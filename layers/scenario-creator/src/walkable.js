// Can you actually walk there?
//
// A walled level proves this through its portal graph: rooms joined by doorways. Open ground has no
// graph to walk, only space with buildings standing in it, so the proof is a flood fill: sample the
// floor on a coarse grid, block the cells a building covers, and see what the spawn can reach.
//
// This is what stops a generator from parking a building across the only way to a door.

const CELL = 1; // metres per sample
const CLEARANCE = 0.6; // how far a body must stay off a wall, so a 0.1m slot is not "walkable"
const APPROACH = 1.2; // where you stand to use a door, measured out from its face

function inflated(block, by) {
  const [cx, , cz] = block.position;
  const [w, , d] = block.size;
  return { minX: cx - w / 2 - by, maxX: cx + w / 2 + by, minZ: cz - d / 2 - by, maxZ: cz + d / 2 + by };
}

function inside(box, x, z) {
  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
}

/** Where a body stands to use this door: out from the block's face, or in from the room's edge. */
export function approachPoint(portal, block, room) {
  const [px, , pz] = portal.position;
  const [rx, , rz] = room.position;
  const towards = block
    ? { x: block.position[0], z: block.position[2] } // step away from the building
    : { x: 2 * px - rx, z: 2 * pz - rz }; // a gate in the boundary: step in from it
  if (portal.axis === "x") {
    return { x: px + (px >= towards.x ? APPROACH : -APPROACH), z: pz };
  }
  return { x: px, z: pz + (pz >= towards.z ? APPROACH : -APPROACH) };
}

/**
 * Flood fill the open floor of one room and report which of the given points it reaches.
 *
 * @param {object} room   a persistence Room (with `blocks`)
 * @param {{x:number,z:number}} from  where the walk starts
 * @param {Array<{id:string,x:number,z:number}>} targets
 * @returns {{ reached: Set<string>, ok: boolean }}
 */
export function reachableInRoom(room, from, targets) {
  const [cx, , cz] = room.position;
  const [w, , d] = room.size;
  const minX = cx - w / 2;
  const minZ = cz - d / 2;
  const cols = Math.max(1, Math.ceil(w / CELL));
  const rows = Math.max(1, Math.ceil(d / CELL));
  const blocks = (room.blocks ?? []).map((b) => inflated(b, CLEARANCE));

  const key = (i, j) => j * cols + i;
  const cellOf = (x, z) => ({
    i: Math.min(cols - 1, Math.max(0, Math.floor((x - minX) / CELL))),
    j: Math.min(rows - 1, Math.max(0, Math.floor((z - minZ) / CELL))),
  });
  const open = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = minX + (i + 0.5) * CELL;
      const z = minZ + (j + 0.5) * CELL;
      open[key(i, j)] = blocks.some((b) => inside(b, x, z)) ? 0 : 1;
    }
  }

  const start = cellOf(from.x, from.z);
  const seen = new Uint8Array(cols * rows);
  const queue = [];
  if (open[key(start.i, start.j)]) {
    seen[key(start.i, start.j)] = 1;
    queue.push(start);
  }
  while (queue.length) {
    const { i, j } = queue.shift();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const k = key(ni, nj);
      if (seen[k] || !open[k]) continue;
      seen[k] = 1;
      queue.push({ i: ni, j: nj });
    }
  }

  const reached = new Set();
  for (const t of targets) {
    const c = cellOf(t.x, t.z);
    if (seen[key(c.i, c.j)]) reached.add(t.id);
  }
  return { reached, ok: reached.size === targets.length };
}
