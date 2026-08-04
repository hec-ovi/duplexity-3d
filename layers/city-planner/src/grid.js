// The road network, on an integer grid.
//
// Why a grid: two segments that are neighbours on the grid share a FULL wall face, so the opening
// between them is exactly coincident on both sides. That exactness is what the runtime's wall-cutting
// needs, and it is why doorways here are correct by construction rather than by tolerance.
//
// This module is pure integers: no metres, no assets, no ids beyond the cell key.

export const SEGMENTS_BY_SIZE = { small: 3, medium: 5, large: 7 };

const key = (gx, gz) => `${gx},${gz}`;

// Faces of a cell, in the order lots are handed out. `d` is the neighbour offset.
export const FACES = [
  { name: "north", dx: 0, dz: 1 },
  { name: "south", dx: 0, dz: -1 },
  { name: "east", dx: 1, dz: 0 },
  { name: "west", dx: -1, dz: 0 },
];

/**
 * A main avenue running east along z=0, plus side streets branching north from it.
 *
 * @returns {{cells: Array, joins: Array, byKey: Map}} cells in walk order, and the neighbour pairs
 * that need an opening between them.
 */
export function layoutRoads(segments, sideStreets, rng) {
  const cells = [];
  const byKey = new Map();
  const add = (gx, gz, kind) => {
    if (byKey.has(key(gx, gz))) return null;
    const cell = { gx, gz, kind, index: cells.length };
    cells.push(cell);
    byKey.set(key(gx, gz), cell);
    return cell;
  };

  for (let i = 0; i < segments; i++) add(i, 0, "avenue");

  // Side streets hang off an interior column, never off the first cell (the spawn) or the last one
  // (which carries the exit gate), so neither is boxed in by a branch.
  const columns = [];
  for (let i = 1; i < segments - 1; i++) columns.push(i);
  for (let s = 0; s < sideStreets && columns.length; s++) {
    const at = columns.splice(rng.int(0, columns.length - 1), 1)[0];
    add(at, 1, "side");
  }

  const joins = [];
  for (const cell of cells) {
    for (const face of FACES) {
      if (face.dx < 0 || face.dz < 0) continue; // each pair once: only look north and east
      const other = byKey.get(key(cell.gx + face.dx, cell.gz + face.dz));
      if (other) joins.push({ a: cell, b: other, face });
    }
  }
  return { cells, joins, byKey };
}

/** Faces with no neighbouring cell: where a front door or the exit gate can go. */
export function freeFaces(cells, byKey) {
  const free = [];
  for (const cell of cells) {
    for (const face of FACES) {
      if (byKey.has(key(cell.gx + face.dx, cell.gz + face.dz))) continue;
      free.push({ cell, face });
    }
  }
  return free;
}
