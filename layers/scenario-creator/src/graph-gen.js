// The abstract room-adjacency graph generator: the LLM stand-in for this layer.
//
// Phase 4 ships a deterministic default. Phase 5/6 injects a grammar-constrained local model behind
// this exact seam (createInstance's `graphGen` option), the same way the NPC brain is injected at
// play-time. The generator emits ONLY topology (rooms + roles + which connect to which), never
// coordinates: per 04-TECH-STACK.md the model is never trusted with geometry or connectivity, only
// the abstract graph, and the deterministic solver owns all placement.

const ROOM_COUNT_BY_SIZE = { small: 3, medium: 5, large: 7 };

function roomCount(spec) {
  const hints = spec.connectionHints ?? {};
  if (Number.isInteger(hints.roomCount)) return Math.max(1, hints.roomCount);
  return ROOM_COUNT_BY_SIZE[spec.sizeHint] ?? 3;
}

/**
 * The default deterministic graph: a connected backbone (a linear chain entry -> ... -> goal) with
 * an optional loop tying the goal back toward the start. `seed` is accepted for the injected-model
 * seam (a stochastic generator resamples on it); the default layout is a pure function of the spec.
 */
export function defaultGraphGen(spec, seed = 0) {
  void seed;
  const count = roomCount(spec);
  const rooms = [];
  for (let i = 0; i < count; i++) {
    let role = "chamber";
    if (i === 0) role = "entry";
    else if (i === count - 1) role = "goal";
    rooms.push({ id: `room-${i}`, role });
  }
  const edges = [];
  for (let i = 1; i < rooms.length; i++) edges.push([rooms[i - 1].id, rooms[i].id]);
  // A loop the solver realises only when the two rooms end up grid-adjacent (dropped otherwise), so
  // it never threatens validity.
  if ((spec.connectionHints ?? {}).loops && rooms.length >= 4) {
    edges.push([rooms[rooms.length - 1].id, rooms[1].id]);
  }
  return { rooms, edges, entry: rooms[0].id, goalRoom: rooms[rooms.length - 1].id };
}

/** A guaranteed-valid straight chain, used as the never-hard-fail fallback layout. */
export function linearChain(spec) {
  const count = roomCount(spec);
  const rooms = [];
  for (let i = 0; i < count; i++) {
    rooms.push({ id: `room-${i}`, role: i === 0 ? "entry" : i === count - 1 ? "goal" : "chamber" });
  }
  const edges = [];
  for (let i = 1; i < rooms.length; i++) edges.push([rooms[i - 1].id, rooms[i].id]);
  return { rooms, edges, entry: rooms[0].id, goalRoom: rooms[rooms.length - 1].id };
}

/**
 * A light structural guard on a graph BEFORE the solver runs (the src stays free of ajv; the
 * room-graph JSON Schema proves the same shape in the tests). Rejects duplicate/dangling ids so a
 * malformed model response is regenerated rather than solved into a broken layout.
 */
export function isValidGraph(g) {
  if (!g || !Array.isArray(g.rooms) || g.rooms.length < 1) return false;
  const ids = new Set();
  for (const r of g.rooms) {
    if (!r || typeof r.id !== "string" || ids.has(r.id)) return false;
    ids.add(r.id);
  }
  if (!Array.isArray(g.edges)) return false;
  for (const e of g.edges) {
    if (!Array.isArray(e) || e.length !== 2 || !ids.has(e[0]) || !ids.has(e[1])) return false;
  }
  if (typeof g.entry !== "string" || !ids.has(g.entry)) return false;
  if (g.goalRoom != null && (typeof g.goalRoom !== "string" || !ids.has(g.goalRoom))) return false;
  return true;
}
