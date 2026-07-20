// runtime - scene model (pure, no three.js).
//
// Turns one Adventure Instance (owned by persistence, consumed only as data) into a flat,
// engine-agnostic description of what to render and what to collide against:
//   - floors and walls derived from room boxes, with an opening cut where each portal sits
//   - axis-aligned wall colliders (the portal openings are simply absent, so you walk through)
//   - object / item / npc placements
// three-scene.js turns this into meshes; collision.js walks the player against `colliders`.
// This module imports no other layer and no renderer, so it is fully unit-testable in node.

const WALL_THICKNESS = 0.2;
const EPS = 1e-3;

function vec3(a) {
  return { x: a[0], y: a[1], z: a[2] };
}

function approxEq(a, b) {
  return Math.abs(a - b) < 1e-4;
}

// Subtract a set of [start,end] openings from a single [min,max] span, returning the solid
// sub-segments that remain (the wall pieces on either side of each doorway).
function subtractOpenings(min, max, openings) {
  let segments = [[min, max]];
  for (const [oaRaw, obRaw] of openings) {
    const oa = Math.max(min, oaRaw);
    const ob = Math.min(max, obRaw);
    if (ob - oa <= EPS) continue; // opening does not actually touch this span
    const next = [];
    for (const [sa, sb] of segments) {
      if (ob <= sa || oa >= sb) {
        next.push([sa, sb]); // no overlap
        continue;
      }
      if (sa < oa - EPS) next.push([sa, oa]);
      if (ob + EPS < sb) next.push([ob, sb]);
    }
    segments = next;
  }
  return segments.filter(([a, b]) => b - a > EPS);
}

// A room's four vertical sides as {axis, plane, spanMin, spanMax}. `axis` is the wall normal
// direction (matches Portal.axis); the wall runs along the other horizontal axis.
function roomSides(room) {
  const [cx, , cz] = room.position;
  const [w, , d] = room.size;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  return [
    { axis: "z", plane: z0, spanMin: x0, spanMax: x1 },
    { axis: "z", plane: z1, spanMin: x0, spanMax: x1 },
    { axis: "x", plane: x0, spanMin: z0, spanMax: z1 },
    { axis: "x", plane: x1, spanMin: z0, spanMax: z1 },
  ];
}

// The opening [start,end] a portal cuts, along the wall's span axis, or null if the portal is not
// on this side. Portal.axis is the wall normal; the opening width (size[0]) runs along the span.
function portalOpeningOnSide(portal, room, side) {
  if (portal.axis !== side.axis) return null;
  if (portal.roomA !== room.id && portal.roomB !== room.id) return null;
  const planeCoord = side.axis === "z" ? portal.position[2] : portal.position[0];
  if (!approxEq(planeCoord, side.plane)) return null;
  const center = side.axis === "z" ? portal.position[0] : portal.position[2];
  const half = portal.size[0] / 2;
  return { span: [center - half, center + half], height: portal.size[1] };
}

// A wall segment between vertical bounds [yBottom, yTop]. `collides` distinguishes a full-height
// wall from a door header (lintel), which renders but must NOT collide (collision is XZ-only, so a
// lintel collider would wrongly re-block the doorway below it).
function wallRecord(side, a, b, yBottom, yTop, collides) {
  const t = WALL_THICKNESS;
  const mid = (a + b) / 2;
  const cy = (yBottom + yTop) / 2;
  const hy = yTop - yBottom;
  let center;
  let size;
  let collider;
  if (side.axis === "z") {
    center = { x: mid, y: cy, z: side.plane };
    size = { x: b - a, y: hy, z: t };
    collider = { minX: a, maxX: b, minZ: side.plane - t / 2, maxZ: side.plane + t / 2 };
  } else {
    center = { x: side.plane, y: cy, z: mid };
    size = { x: t, y: hy, z: b - a };
    collider = { minX: side.plane - t / 2, maxX: side.plane + t / 2, minZ: a, maxZ: b };
  }
  return {
    // The vertical extent is part of the id so two coincident-footprint walls at different heights
    // or floor levels (e.g. split-level rooms) are NOT merged by the shared-wall dedupe.
    id: `wall:${side.axis}${round(side.plane)}:${round(a)}_${round(b)}@${round(yBottom)}_${round(yTop)}`,
    axis: side.axis,
    plane: side.plane,
    spanMin: a,
    spanMax: b,
    yBottom,
    yTop,
    thickness: t,
    collides,
    center,
    size,
    collider,
  };
}

function round(n) {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Build the flat scene model for one instance. `instance` is a persistence Instance (already
 * validated upstream). Returns floors, deduped walls (with portal openings removed), colliders,
 * objects, pickup items, npc placements, the player spawn, and the world bounds.
 */
export function buildSceneModel(instance) {
  const rooms = instance.rooms.map((room) => {
    const [cx, cy, cz] = room.position;
    const [w, h, d] = room.size;
    return {
      id: room.id,
      floorKit: room.floorKit,
      wallKit: room.wallKit,
      center: { x: cx, y: cy, z: cz },
      size: { x: w, y: h, z: d },
      floorY: cy,
      height: h,
      min: { x: cx - w / 2, z: cz - d / 2 },
      max: { x: cx + w / 2, z: cz + d / 2 },
    };
  });

  const portals = instance.portals ?? [];
  const wallsByKey = new Map();
  for (let i = 0; i < instance.rooms.length; i++) {
    const room = instance.rooms[i];
    const floorY = room.position[1];
    const height = room.size[1];
    for (const side of roomSides(room)) {
      const openings = [];
      for (const portal of portals) {
        const op = portalOpeningOnSide(portal, room, side);
        if (op) openings.push(op);
      }
      // Two rooms sharing a wall compute the identical segments (and cut the identical portal
      // opening), so keying by geometry collapses the shared wall to one piece.
      const add = (rec) => {
        if (!wallsByKey.has(rec.id)) wallsByKey.set(rec.id, rec);
      };
      // Solid, full-height wall pieces on either side of each doorway.
      for (const [a, b] of subtractOpenings(side.spanMin, side.spanMax, openings.map((o) => o.span))) {
        add(wallRecord(side, a, b, floorY, floorY + height, true));
      }
      // A header (lintel) above each doorway whose authored opening height is below the room
      // height, honouring Portal.size[1]. Rendered but non-colliding.
      for (const o of openings) {
        const a = Math.max(side.spanMin, o.span[0]);
        const b = Math.min(side.spanMax, o.span[1]);
        if (b - a <= EPS) continue;
        const lintelBottom = floorY + o.height;
        if (floorY + height - lintelBottom > EPS) {
          add(wallRecord(side, a, b, lintelBottom, floorY + height, false));
        }
      }
    }
  }
  const walls = [...wallsByKey.values()];

  const objects = [];
  const items = [];
  for (const room of instance.rooms) {
    for (const obj of room.objects ?? []) {
      objects.push({
        id: obj.id,
        room: room.id,
        assetRef: obj.assetRef,
        position: vec3(obj.position),
        rotationY: obj.rotationY ?? 0,
        tags: obj.tags ?? [],
      });
    }
    for (const inv of room.inventory ?? []) {
      const pos = inv.position ? vec3(inv.position) : { x: room.position[0], y: room.position[1] + 0.5, z: room.position[2] };
      items.push({ itemId: inv.itemId, room: room.id, assetRef: inv.assetRef, position: pos });
    }
  }

  const npcs = instance.npcs.map((n) => ({
    id: n.id,
    name: n.name,
    persona: n.persona,
    bodyRef: n.bodyRef,
    homeRoom: n.homeRoom,
    disposition: n.disposition,
    allowedModes: n.allowedModes ?? [],
    traits: n.traits ?? [],
    startMode: n.startMode,
    position: vec3(n.spawn.position),
    facing: n.spawn.facing ?? 0,
  }));

  // Portals as routable data (nav.js walks NPCs through the doorway centres). The wall builder above
  // already consumed them to cut the openings; here they are exposed for pathfinding and exits.
  const portalsOut = portals.map((p) => ({
    id: p.id,
    roomA: p.roomA,
    roomB: p.roomB,
    axis: p.axis,
    center: vec3(p.position),
    size: p.size,
  }));

  const bounds = rooms.reduce(
    (b, r) => ({
      minX: Math.min(b.minX, r.min.x),
      maxX: Math.max(b.maxX, r.max.x),
      minZ: Math.min(b.minZ, r.min.z),
      maxZ: Math.max(b.maxZ, r.max.z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );

  return {
    instanceId: instance.id,
    theme: instance.theme,
    rooms,
    walls,
    colliders: walls.filter((w) => w.collides).map((w) => w.collider),
    portals: portalsOut,
    objects,
    items,
    npcs,
    spawn: { position: vec3(instance.spawn.position), facing: instance.spawn.facing ?? 0 },
    groundY: rooms.length ? Math.min(...rooms.map((r) => r.floorY)) : 0,
    bounds,
  };
}

/** The room whose footprint contains (x,z), or null when the point is in a doorway/outside. */
export function roomAt(model, x, z) {
  for (const r of model.rooms) {
    if (x >= r.min.x && x <= r.max.x && z >= r.min.z && z <= r.max.z) return r.id;
  }
  return null;
}

export { WALL_THICKNESS };
