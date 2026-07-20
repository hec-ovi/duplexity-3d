// Deterministic geometry solver: turn an abstract room-adjacency graph into a concrete, valid
// Instance layout.
//
// Rooms are packed onto a uniform integer GRID so that every adjacency becomes a shared full wall
// face, which is exactly what the runtime's opening-cut needs: a portal only cuts a doorway where
// its plane coincides with a wall of BOTH rooms (see the runtime scene-model). Grid packing makes
// that coincidence exact, so the four geometry invariants (no overlap, full connectivity, portals
// aligned on both walls, goal reachable) hold BY CONSTRUCTION. validate.js re-proves them
// independently, so the solver is never trusted on its own word.
//
// Chosen over the Delaunay + separation-steering + MST "organic dungeon" method (04-TECH-STACK.md):
// float-positioned rooms make exact wall-plane coincidence fragile, and a doorway that misses the
// shared plane by a millimetre is a wall the player cannot walk through. The organic layout is a
// later drop-in behind this same graph -> Instance seam.

const CELL_BY_SIZE = { small: 6, medium: 8, large: 10 };
const HEIGHT = 3;
const OPEN_W = 1.5; // doorway opening width (m)
const OPEN_H = 2.4; // doorway opening height (m)
const ITEM_Y = 0.6; // pickup height off the floor (m)

const DIRS = [
  { dx: 1, dz: 0 }, // east
  { dx: 0, dz: 1 }, // south
  { dx: -1, dz: 0 }, // west
  { dx: 0, dz: -1 }, // north
];

const key = (gx, gz) => `${gx},${gz}`;

class NoAssetForKindError extends Error {
  constructor(kind, theme) {
    super(`no asset of kind "${kind}" for theme "${theme}" in the registry`);
    this.code = "NO_ASSET_FOR_KIND";
  }
}

function cellSize(spec) {
  return CELL_BY_SIZE[spec.sizeHint] ?? 6;
}

function adjacency(graph) {
  const adj = new Map(graph.rooms.map((r) => [r.id, new Set()]));
  for (const [a, b] of graph.edges) {
    if (adj.has(a) && adj.has(b)) {
      adj.get(a).add(b);
      adj.get(b).add(a);
    }
  }
  return adj;
}

// BFS from the entry so every room after the first has an already-placed graph parent (its anchor).
// Rooms unreachable in the graph are appended with a null anchor and later attached to whatever is
// already placed, so a disconnected GRAPH still yields a fully connected LAYOUT.
function placementOrder(graph, adj) {
  const order = [];
  const parent = new Map();
  const seen = new Set();
  const entry = graph.rooms.some((r) => r.id === graph.entry) ? graph.entry : graph.rooms[0]?.id;
  if (entry) {
    seen.add(entry);
    parent.set(entry, null);
    const queue = [entry];
    while (queue.length) {
      const cur = queue.shift();
      order.push(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        parent.set(nb, cur);
        queue.push(nb);
      }
    }
  }
  for (const r of graph.rooms) {
    if (!seen.has(r.id)) {
      order.push(r.id);
      parent.set(r.id, null);
    }
  }
  return { order, parent };
}

function freeNeighbours(cell, occ) {
  const out = [];
  for (const { dx, dz } of DIRS) {
    const gx = cell.gx + dx;
    const gz = cell.gz + dz;
    if (!occ.has(key(gx, gz))) out.push({ gx, gz });
  }
  return out;
}

// Deduped free cells adjacent to any of `cells`, in a stable order (cells in placement order, each
// scanned in DIRS order; first occurrence wins).
function freeNeighboursOf(cells, occ) {
  const seen = new Set();
  const out = [];
  for (const c of cells) {
    for (const n of freeNeighbours(c, occ)) {
      const k = key(n.gx, n.gz);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(n);
    }
  }
  return out;
}

function centroidOf(cells) {
  let sx = 0;
  let sz = 0;
  for (const c of cells) {
    sx += c.gx;
    sz += c.gz;
  }
  return { gx: sx / cells.length, gz: sz / cells.length };
}

function gridAdjacent(a, b) {
  return Math.abs(a.gx - b.gx) + Math.abs(a.gz - b.gz) === 1;
}

// How many of `id`'s already-placed GRAPH neighbours sit grid-adjacent to candidate cell `c`. This
// counts the anchor (guaranteeing the room connects to its intended parent) and rewards a cell that
// also closes a loop back to another neighbour.
function graphNeighboursTouching(id, c, adj, cell) {
  let n = 0;
  for (const nb of adj.get(id) ?? []) {
    const nc = cell.get(nb);
    if (nc && gridAdjacent(c, nc)) n += 1;
  }
  return n;
}

function placeRooms(graph, adj) {
  const { order, parent } = placementOrder(graph, adj);
  const cell = new Map();
  const occ = new Map();
  const placedCells = [];

  const place = (id, gx, gz) => {
    cell.set(id, { gx, gz });
    occ.set(key(gx, gz), id);
    placedCells.push({ gx, gz });
  };

  place(order[0], 0, 0);

  for (let i = 1; i < order.length; i++) {
    const id = order[i];
    const anchor = parent.get(id);
    const anchorCell = anchor ? cell.get(anchor) : null;

    let candidates = anchorCell ? freeNeighbours(anchorCell, occ) : [];
    if (!candidates.length) {
      const placedGraphNeighbours = [...(adj.get(id) ?? [])].map((nb) => cell.get(nb)).filter(Boolean);
      candidates = freeNeighboursOf(placedGraphNeighbours, occ);
    }
    if (!candidates.length) candidates = freeNeighboursOf(placedCells, occ);

    const centroid = centroidOf(placedCells);
    let best = null;
    let bestPrimary = -1;
    let bestDist = Infinity;
    for (const c of candidates) {
      const primary = graphNeighboursTouching(id, c, adj, cell);
      const dist = (c.gx - centroid.gx) ** 2 + (c.gz - centroid.gz) ** 2;
      // rank: more realised neighbours first (closes loops, guarantees the anchor link), then the
      // most compact cell, then the DIRS order the candidate list already carries (first wins ties).
      if (primary > bestPrimary || (primary === bestPrimary && dist < bestDist - 1e-9)) {
        best = c;
        bestPrimary = primary;
        bestDist = dist;
      }
    }
    place(id, best.gx, best.gz);
  }
  return cell;
}

function portalBetween(aId, bId, ca, cb, id, S) {
  if (ca.gx !== cb.gx) {
    const plane = Math.min(ca.gx, cb.gx) * S + S / 2;
    return { id, roomA: aId, roomB: bId, position: [plane, 0, ca.gz * S], axis: "x", size: [OPEN_W, OPEN_H] };
  }
  const plane = Math.min(ca.gz, cb.gz) * S + S / 2;
  return { id, roomA: aId, roomB: bId, position: [ca.gx * S, 0, plane], axis: "z", size: [OPEN_W, OPEN_H] };
}

// Union-find over room ids.
function makeUF(ids) {
  const parent = new Map(ids.map((x) => [x, x]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    parent.set(find(a), find(b));
  };
  return { find, union };
}

function buildPortals(cellMap, adj, S) {
  const ids = [...cellMap.keys()];
  const portals = [];
  const have = new Set();
  const uf = makeUF(ids);

  const add = (a, b) => {
    const k = [a, b].sort().join("|");
    if (have.has(k)) return;
    have.add(k);
    portals.push(portalBetween(a, b, cellMap.get(a), cellMap.get(b), `p${portals.length + 1}`, S));
    uf.union(a, b);
  };

  // 1) intended portals: graph edges whose rooms ended up grid-adjacent.
  for (const a of ids) {
    for (const b of adj.get(a) ?? []) {
      if (gridAdjacent(cellMap.get(a), cellMap.get(b))) add(a, b);
    }
  }

  // 2) connectivity repair: while more than one component, join any two grid-adjacent rooms in
  // different components. The placement made the occupied cells one connected polyomino, so a
  // grid-adjacent cross-component pair always exists until everything is connected.
  let joined = true;
  while (joined) {
    joined = false;
    for (let i = 0; i < ids.length && !joined; i++) {
      for (let j = i + 1; j < ids.length && !joined; j++) {
        const a = ids[i];
        const b = ids[j];
        if (uf.find(a) === uf.find(b)) continue;
        if (gridAdjacent(cellMap.get(a), cellMap.get(b))) {
          add(a, b);
          joined = true;
        }
      }
    }
  }
  return portals;
}

function pickKit(assetQuery, kind, theme, required) {
  const res = assetQuery?.({ kind, theme });
  const id = res?.[0]?.id;
  if (!id && required) throw new NoAssetForKindError(kind, theme);
  return id ?? null;
}

function yawToward(dx, dz) {
  return Math.atan2(-dx, -dz);
}

// The first outer (unshared) wall face of a room, as an EXIT portal spec. Prefers `roomId`, then any
// room with a free perimeter face (the layout's boundary is always non-empty).
function exitPortal(roomId, cellMap, S, idsPreferred, portalId) {
  const occ = new Map([...cellMap].map(([id, c]) => [key(c.gx, c.gz), id]));
  const order = [roomId, ...idsPreferred.filter((x) => x !== roomId)];
  for (const rid of order) {
    const c = cellMap.get(rid);
    for (const { dx, dz } of DIRS) {
      if (occ.has(key(c.gx + dx, c.gz + dz))) continue;
      if (dx !== 0) {
        const plane = c.gx * S + (dx > 0 ? S / 2 : -S / 2);
        return { id: portalId, roomA: rid, roomB: "EXIT", position: [plane, 0, c.gz * S], axis: "x", size: [OPEN_W, OPEN_H] };
      }
      const plane = c.gz * S + (dz > 0 ? S / 2 : -S / 2);
      return { id: portalId, roomA: rid, roomB: "EXIT", position: [c.gx * S, 0, plane], axis: "z", size: [OPEN_W, OPEN_H] };
    }
  }
  return null;
}

/**
 * Solve an abstract graph into a concrete Instance layout (the persistence Instance minus npcs). May
 * throw NO_ASSET_FOR_KIND if the theme lacks a required floor/wall kit.
 */
export function solve(graph, spec, assetQuery) {
  const S = cellSize(spec);
  const adj = adjacency(graph);
  const cellMap = placeRooms(graph, adj);

  const floorKit = pickKit(assetQuery, "room-floor", spec.theme, true);
  const wallKit = pickKit(assetQuery, "wall", spec.theme, true);
  const propKit = pickKit(assetQuery, "prop", spec.theme, false);

  const rooms = graph.rooms.map((r) => {
    const { gx, gz } = cellMap.get(r.id);
    return {
      id: r.id,
      position: [gx * S, 0, gz * S],
      size: [S, HEIGHT, S],
      floorKit,
      wallKit,
      objects: [],
      inventory: [],
    };
  });
  const roomById = new Map(rooms.map((rm) => [rm.id, rm]));

  const portals = buildPortals(cellMap, adj, S);

  const ids = graph.rooms.map((r) => r.id);
  const entryId = roomById.has(graph.entry) ? graph.entry : ids[0];
  const goalId = roomById.has(graph.goalRoom) ? graph.goalRoom : ids[ids.length - 1];
  const goalRoom = roomById.get(goalId);
  const entryRoom = roomById.get(entryId);

  // spawn: the entry room centre, facing its first doorway.
  const entryPortal = portals.find((p) => p.roomA === entryId || p.roomB === entryId);
  const facing = entryPortal
    ? yawToward(entryPortal.position[0] - entryRoom.position[0], entryPortal.position[2] - entryRoom.position[2])
    : 0;
  const spawn = { position: [entryRoom.position[0], 0, entryRoom.position[2]], facing };

  const goal = finishGoal(spec, { goalRoom, entryId, goalId, portals, cellMap, S, propKit, ids });

  return { id: spec.id, theme: spec.theme, rules: { pvp: false }, rooms, portals, goal, spawn };
}

// Place the goal target and emit a satisfiable Goal. discover_item drops a pickup in the goal room;
// reach_exit (and, until the narrator folds NPCs in, the npc-targeted goal specs) opens an EXIT on
// the goal room's outer wall; survive is connectivity-only.
function finishGoal(spec, ctx) {
  const { goalRoom, goalId, portals, cellMap, S, propKit, ids } = ctx;
  const type = spec.goalSpec?.type ?? "discover_item";

  if (type === "discover_item") {
    const itemId = `${spec.id}-goal`;
    const item = { itemId, position: [goalRoom.position[0], ITEM_Y, goalRoom.position[2]] };
    if (propKit) item.assetRef = propKit;
    goalRoom.inventory.push(item);
    return { type: "discover_item", itemId };
  }

  if (type === "survive") {
    const seconds = Number.isFinite(spec.goalSpec?.seconds) ? spec.goalSpec.seconds : 60;
    return { type: "survive", seconds };
  }

  // reach_exit, plus defeat / unlock_dialog (whose npcId the narrator assigns later): make the goal
  // room's outer wall an EXIT so the win condition is a reachable geometry fact now.
  const ex = exitPortal(goalId, cellMap, S, ids, `p${portals.length + 1}`);
  if (ex) portals.push(ex);
  return { type: "reach_exit" };
}

export { NoAssetForKindError };
