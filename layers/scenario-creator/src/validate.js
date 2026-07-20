// The geometry validator: an independent proof that a produced layout is legal. It re-derives every
// invariant from the Instance alone, never trusting the solver, so a solver bug is caught here and
// the layout is regenerated rather than shipped. It is also the adversarial guard the tests fire at
// hand-built broken fixtures (overlapping rooms, unaligned portals, unreachable goal).

const EPS = 1e-4;
// The runtime seals (does not cut) any doorway whose opening width is <= its own EPS: see
// scene-model.subtractOpenings, which skips an opening with `ob - oa <= 1e-3`. The validator must
// reject an opening the runtime cannot cut, or it would pass a layout with a sealed doorway.
const MIN_CUT_WIDTH = 1e-3;

function box(room) {
  const [cx, , cz] = room.position;
  const [w, , d] = room.size;
  return {
    id: room.id,
    minX: cx - w / 2,
    maxX: cx + w / 2,
    minZ: cz - d / 2,
    maxZ: cz + d / 2,
    height: room.size[1],
  };
}

function overlaps(a, b) {
  const over1d = (min1, max1, min2, max2) => min1 < max2 - 1e-9 && min2 < max1 - 1e-9;
  return over1d(a.minX, a.maxX, b.minX, b.maxX) && over1d(a.minZ, a.maxZ, b.minZ, b.maxZ);
}

// True when the portal opening sits fully on ONE wall face of `b`: its plane coincides with a face,
// the opening span stays inside the wall, and the opening is no taller than the room.
function openingOnRoom(portal, b) {
  // A doorway narrower than the runtime's cut gate would leave the wall solid (a sealed door).
  if (!(portal.size[0] > MIN_CUT_WIDTH)) return false;
  if (portal.axis === "x") {
    const plane = portal.position[0];
    if (Math.abs(plane - b.minX) > EPS && Math.abs(plane - b.maxX) > EPS) return false;
    const c = portal.position[2];
    const half = portal.size[0] / 2;
    if (c - half < b.minZ - EPS || c + half > b.maxZ + EPS) return false;
    return portal.size[1] <= b.height + EPS;
  }
  const plane = portal.position[2];
  if (Math.abs(plane - b.minZ) > EPS && Math.abs(plane - b.maxZ) > EPS) return false;
  const c = portal.position[0];
  const half = portal.size[0] / 2;
  if (c - half < b.minX - EPS || c + half > b.maxX + EPS) return false;
  return portal.size[1] <= b.height + EPS;
}

function containsPoint(b, x, z) {
  return x >= b.minX - EPS && x <= b.maxX + EPS && z >= b.minZ - EPS && z <= b.maxZ + EPS;
}

// The room whose footprint holds (x,z), else the nearest room by distance to its footprint.
function roomOf(boxes, x, z) {
  for (const b of boxes) if (containsPoint(b, x, z)) return b.id;
  let best = null;
  let bestD = Infinity;
  for (const b of boxes) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const d = (x - cx) ** 2 + (z - cz) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b.id;
    }
  }
  return best;
}

function reachableRooms(instance, startRoom) {
  const adj = new Map((instance.rooms ?? []).map((r) => [r.id, []]));
  for (const p of instance.portals ?? []) {
    if (p.roomB === "EXIT") continue;
    if (adj.has(p.roomA) && adj.has(p.roomB)) {
      adj.get(p.roomA).push(p.roomB);
      adj.get(p.roomB).push(p.roomA);
    }
  }
  const seen = new Set();
  if (startRoom && adj.has(startRoom)) {
    const queue = [startRoom];
    seen.add(startRoom);
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
  }
  return seen;
}

/**
 * Validate a layout against the geometry invariants. Returns { ok, checks[] } matching
 * validation-report.json. Robust to partial/adversarial fixtures (missing spawn/goal are simply not
 * checked), so it doubles as the negative-test harness.
 */
export function validateLayout(instance) {
  const rooms = instance.rooms ?? [];
  const boxes = rooms.map(box);
  const ids = new Set(rooms.map((r) => r.id));
  const portals = instance.portals ?? [];
  const checks = [];

  // no two rooms overlap on the floor plane.
  let overlapOk = true;
  let overlapDetail;
  for (let i = 0; i < boxes.length && overlapOk; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i], boxes[j])) {
        overlapOk = false;
        overlapDetail = `${boxes[i].id} overlaps ${boxes[j].id}`;
        break;
      }
    }
  }
  checks.push(mkCheck("no_room_overlap", overlapOk, overlapDetail));

  // every portal names real rooms (or EXIT).
  const refOk = portals.every((p) => ids.has(p.roomA) && (p.roomB === "EXIT" || ids.has(p.roomB)));
  checks.push(mkCheck("portals_reference_rooms", refOk));

  // every portal opening lies on a wall face of BOTH rooms it joins (or the one room + EXIT).
  const boxById = new Map(boxes.map((b) => [b.id, b]));
  let alignedOk = true;
  let alignedDetail;
  for (const p of portals) {
    const a = boxById.get(p.roomA);
    const bOk = p.roomB === "EXIT" || (boxById.get(p.roomB) && openingOnRoom(p, boxById.get(p.roomB)));
    if (!a || !openingOnRoom(p, a) || !bOk) {
      alignedOk = false;
      alignedDetail = `portal ${p.id ?? "?"} is not aligned on both room walls`;
      break;
    }
  }
  checks.push(mkCheck("portals_aligned", alignedOk));

  // every room is reachable from the spawn room through portals.
  const spawnRoom = instance.spawn
    ? roomOf(boxes, instance.spawn.position[0], instance.spawn.position[2])
    : boxes[0]?.id;
  const reachable = reachableRooms(instance, spawnRoom);
  const connOk = rooms.length > 0 && rooms.every((r) => reachable.has(r.id));
  checks.push(mkCheck("full_connectivity", connOk, connOk ? undefined : "a room is unreachable from spawn"));

  // the goal target sits in a reachable room (only checked when a goal + spawn are present).
  if (instance.goal && instance.spawn) {
    const { ok, detail } = goalReachable(instance, reachable, boxes);
    checks.push(mkCheck("goal_reachable", ok, detail));
  }

  return { ok: checks.every((c) => c.ok), checks };
}

function goalReachable(instance, reachable, boxes) {
  const goal = instance.goal;
  const rooms = instance.rooms ?? [];

  const itemRoom = (itemId) => {
    for (const r of rooms) {
      if ((r.inventory ?? []).some((it) => it.itemId === itemId)) return r.id;
    }
    return null;
  };

  if (goal.type === "discover_item" || (goal.itemId && goal.type !== "reach_exit")) {
    const room = itemRoom(goal.itemId);
    if (!room) return { ok: false, detail: `goal item ${goal.itemId} is placed in no room` };
    return { ok: reachable.has(room), detail: reachable.has(room) ? undefined : `goal item room ${room} is unreachable` };
  }

  if (goal.type === "reach_exit") {
    const exits = (instance.portals ?? []).filter((p) => p.roomB === "EXIT");
    const usable = exits.filter((p) => (!goal.portalId || p.id === goal.portalId) && reachable.has(p.roomA));
    return { ok: usable.length > 0, detail: usable.length ? undefined : "no reachable EXIT portal" };
  }

  if (goal.type === "survive") return { ok: true };

  // A room-targeted goal we do not model geometrically: pass as long as the layout is connected.
  return { ok: true };
}

function mkCheck(name, ok, detail) {
  const c = { name, ok: Boolean(ok) };
  if (!ok && detail) c.detail = detail;
  return c;
}
