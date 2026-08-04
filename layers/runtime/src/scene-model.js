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
  if (portal.blockId) return null; // a door on a building's face cuts nothing out of the room
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
function wallRecord(side, a, b, yBottom, yTop, collides, renders = true) {
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
    renders,
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
      open: Boolean(room.open), // open ground: an edge that stops you, drawn as nothing
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
        const seen = wallsByKey.get(rec.id);
        // A wall shared between an open room and a walled one is still drawn: the walled side needs
        // it. Rendering wins over not rendering, whichever room reached it first.
        if (!seen || (rec.renders && !seen.renders)) wallsByKey.set(rec.id, rec);
      };
      // Solid, full-height wall pieces on either side of each doorway. An OPEN room (a street, a
      // plaza) still has them as colliders, so the world has an edge, but draws nothing: you look out
      // into empty space instead of at a wall.
      for (const [a, b] of subtractOpenings(side.spanMin, side.spanMax, openings.map((o) => o.span))) {
        add(wallRecord(side, a, b, floorY, floorY + height, true, !room.open));
      }
      if (room.open) continue; // no doorway headers to draw over open ground
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

  // Buildings standing in an open room: solid masses you walk around. They are not rooms (there is no
  // inside to them here; the inside is another instance behind their door), so they contribute a
  // collider and a box to draw, and nothing else.
  const blocks = [];
  for (const room of instance.rooms) {
    for (const block of room.blocks ?? []) {
      const [bx, by, bz] = block.position;
      const [bw, bh, bd] = block.size;
      blocks.push({
        id: block.id,
        room: room.id,
        label: block.label ?? null,
        assetRef: block.assetRef ?? null,
        floors: block.floors ?? null,
        program: block.program ?? null,
        center: { x: bx, y: by + bh / 2, z: bz },
        size: { x: bw, y: bh, z: bd },
        min: { x: bx - bw / 2, z: bz - bd / 2 },
        max: { x: bx + bw / 2, z: bz + bd / 2 },
        collider: { minX: bx - bw / 2, maxX: bx + bw / 2, minZ: bz - bd / 2, maxZ: bz + bd / 2 },
      });
    }
  }

  // Where the light stands: a lamp on the pavement, a sign over a door. Placement is authored; how
  // tall and what colour is the renderer's business.
  const lights = [];
  for (const room of instance.rooms) {
    for (const light of room.lights ?? []) {
      lights.push({
        id: light.id,
        kind: light.kind,
        room: room.id,
        blockId: light.blockId ?? null,
        facing: light.facing ?? 0,
        position: light.position.slice(),
      });
    }
  }

  // Flat surfaces marked out on the floor (roadway, pavement, square). Walked over, never collided
  // with: they say what the ground is, so it can be surfaced differently and NPCs told where to walk.
  const zones = [];
  for (const room of instance.rooms) {
    for (const zone of room.zones ?? []) {
      const [zx, zy, zz] = zone.position;
      const [zw, zd] = zone.size;
      zones.push({
        id: zone.id,
        room: room.id,
        kind: zone.kind,
        assetRef: zone.assetRef ?? null,
        center: { x: zx, y: zy, z: zz },
        size: { x: zw, z: zd },
        min: { x: zx - zw / 2, z: zz - zd / 2 },
        max: { x: zx + zw / 2, z: zz + zd / 2 },
      });
    }
  }

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

  // A scenario-creator layout has no npcs yet (the narrator folds them in later), so tolerate an
  // npc-less instance and render an empty world rather than crash.
  const npcs = (instance.npcs ?? []).map((n) => ({
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
  // `link` is the far side when it is another INSTANCE (a street door, a stairwell); `lock` is the
  // rule map-state weighs before the door opens. Both are carried as data: the runtime plays one
  // instance and only reports that the player walked into the door.
  const portalsOut = portals.map((p) => ({
    id: p.id,
    roomA: p.roomA,
    roomB: p.roomB,
    axis: p.axis,
    center: vec3(p.position),
    size: p.size,
    blockId: p.blockId ?? null, // set when the door is on a building's face rather than in a wall
    link: p.link ?? null,
    lock: p.lock ?? null,
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
    rules: instance.rules ?? {}, // freeform authored flags; the blueprint reads `label` / `mapKind`
    rooms,
    walls,
    blocks,
    zones,
    lights,
    colliders: [...walls.filter((w) => w.collides).map((w) => w.collider), ...blocks.map((b) => b.collider)],
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
