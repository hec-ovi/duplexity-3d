// scenario-creator - turn one InstanceSpec into a geometrically valid layout. Imports no other
// layer's src; the asset-registry query is injected as a function (dependency, not an import).
//
// Phase 1 returns a fixed, valid 3-room layout and runs a real (small) geometry validator on it, so
// the invariant-checking half of the contract already runs. The LLM room-adjacency graph and the
// deterministic solver (Delaunator + MST + A*, per 04-TECH-STACK.md) arrive at Phase 4 behind this
// same signature.

function overlaps(a, b) {
  // AABB overlap on the floor plane (X, Z). position is the room center; size is [w, h, d].
  const span = (c, s) => [c - s / 2, c + s / 2];
  const ax = span(a.position[0], a.size[0]);
  const az = span(a.position[2], a.size[2]);
  const bx = span(b.position[0], b.size[0]);
  const bz = span(b.position[2], b.size[2]);
  const over1d = (p, q) => p[0] < q[1] - 1e-9 && q[0] < p[1] - 1e-9;
  return over1d(ax, bx) && over1d(az, bz);
}

export function validateLayout(instance) {
  const rooms = instance.rooms ?? [];
  const checks = [];

  let overlapOk = true;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (overlaps(rooms[i], rooms[j])) overlapOk = false;
    }
  }
  checks.push({ name: "no_room_overlap", ok: overlapOk });

  const ids = new Set(rooms.map((r) => r.id));
  const portalsOk = (instance.portals ?? []).every(
    (p) => ids.has(p.roomA) && (p.roomB === "EXIT" || ids.has(p.roomB)),
  );
  checks.push({ name: "portals_reference_rooms", ok: portalsOk });

  return { ok: checks.every((c) => c.ok), checks };
}

// A fixed valid layout: three adjacent rooms sharing walls, two portals, a discover_item goal.
// (The persistence Instance minus npcs; the narrator authors and folds NPCs in afterward.)
const BASE_LAYOUT = {
  id: "inst-generated",
  theme: "dungeon",
  rules: { pvp: false },
  rooms: [
    {
      id: "room-entry",
      position: [0, 0, 0],
      size: [6, 3, 6],
      floorKit: "kit.floor",
      wallKit: "kit.wall",
      objects: [],
      inventory: [],
    },
    {
      id: "room-hall",
      position: [0, 0, 6],
      size: [6, 3, 6],
      floorKit: "kit.floor",
      wallKit: "kit.wall",
      objects: [],
      inventory: [],
    },
    {
      id: "room-vault",
      position: [6, 0, 6],
      size: [6, 3, 6],
      floorKit: "kit.floor",
      wallKit: "kit.wall",
      objects: [],
      inventory: [{ itemId: "amulet", assetRef: "kit.amulet", position: [6, 0.6, 6] }],
    },
  ],
  portals: [
    { id: "p1", roomA: "room-entry", roomB: "room-hall", position: [0, 0, 3], axis: "z", size: [1.5, 2.4] },
    { id: "p2", roomA: "room-hall", roomB: "room-vault", position: [3, 0, 6], axis: "x", size: [1.5, 2.4] },
  ],
  goal: { type: "discover_item", itemId: "amulet" },
  spawn: { position: [0, 0, 0], facing: 0 },
};

export function createInstance(instanceSpec, assetQuery) {
  const floor = assetQuery?.({ kind: "room-floor", theme: instanceSpec.theme })?.[0]?.id;
  const wall = assetQuery?.({ kind: "wall", theme: instanceSpec.theme })?.[0]?.id;

  const instance = structuredClone(BASE_LAYOUT);
  instance.id = instanceSpec.id;
  instance.theme = instanceSpec.theme;
  if (floor) for (const r of instance.rooms) r.floorKit = floor;
  if (wall) for (const r of instance.rooms) r.wallKit = wall;

  const report = validateLayout(instance);
  if (!report.ok) {
    throw Object.assign(new Error("layout invalid"), { code: "LAYOUT_INVALID", report });
  }
  return { instance, report };
}
