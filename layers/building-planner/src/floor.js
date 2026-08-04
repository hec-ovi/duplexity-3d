// One floor's partition: a footprint cut into a grid of rooms, plus the doors between them.
//
// Same reason as the street grid: neighbours on a uniform grid share a FULL wall, so a door between
// them is exactly coincident on both sides. Interior doors are a comb (each room joins its east
// neighbour; the west column joins north to north), which spans every room with the fewest doors.
//
// Pure geometry in metres, local to the floor: the origin is the middle of the footprint.

export const FACES = {
  north: { dx: 0, dz: 1 },
  south: { dx: 0, dz: -1 },
  east: { dx: 1, dz: 0 },
  west: { dx: -1, dz: 0 },
};

export function partition(footprint, cols, rows, height) {
  const cellW = footprint.width / cols;
  const cellD = footprint.depth / rows;
  const cells = [];
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      cells.push({
        cx,
        cz,
        centre: {
          x: (cx + 0.5) * cellW - footprint.width / 2,
          z: (cz + 0.5) * cellD - footprint.depth / 2,
        },
        size: { w: cellW, d: cellD, h: height },
      });
    }
  }
  const at = (cx, cz) => cells.find((c) => c.cx === cx && c.cz === cz) ?? null;

  const joins = [];
  for (const cell of cells) {
    const east = at(cell.cx + 1, cell.cz);
    if (east) joins.push({ a: cell, b: east, face: FACES.east });
    if (cell.cx === 0) {
      const north = at(cell.cx, cell.cz + 1);
      if (north) joins.push({ a: cell, b: north, face: FACES.north });
    }
  }
  return { cells, joins, at };
}

/** Where a portal sits on one face of a cell: on the wall plane, centred on that face. */
export function faceOpening(cell, face, size) {
  if (face.dx !== 0) {
    return {
      position: [cell.centre.x + (face.dx * cell.size.w) / 2, 0, cell.centre.z],
      axis: "x",
      size,
    };
  }
  return {
    position: [cell.centre.x, 0, cell.centre.z + (face.dz * cell.size.d) / 2],
    axis: "z",
    size,
  };
}

/** True when nothing is on the far side of this face: where a door out of the floor may go. */
export function isOuter(at, cell, face) {
  return at(cell.cx + face.dx, cell.cz + face.dz) === null;
}
