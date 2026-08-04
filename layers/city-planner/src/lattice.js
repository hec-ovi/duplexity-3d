// Where the buildings stand, and therefore where the streets are.
//
// A city block lattice: footprints of side BLOCK, separated by gaps of STREET. The gaps ARE the
// streets, so they are connected by construction, every building fronts one on all four sides, and
// there is no corridor anywhere. Empty cells are squares you can cross.
//
// Pure integers and metres. No assets, no ids beyond the cell index.

export const BLOCK = 16; // building footprint, metres square
export const STREET = 10; // gap between footprints, and the margin around the whole lattice
export const LATTICE_BY_SIZE = { small: 2, medium: 3, large: 4 };

/** Ground extent for a lattice of n x n blocks, with a street all the way round the outside. */
export function groundSize(n) {
  return n * BLOCK + (n + 1) * STREET;
}

/**
 * The cells of the lattice, centred on the origin, in a fixed order.
 * @returns {Array<{i:number,j:number,index:number,center:{x:number,z:number}}>}
 */
export function cells(n) {
  const half = groundSize(n) / 2;
  const out = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      out.push({
        i,
        j,
        index: out.length,
        center: {
          x: -half + STREET + i * (BLOCK + STREET) + BLOCK / 2,
          z: -half + STREET + j * (BLOCK + STREET) + BLOCK / 2,
        },
      });
    }
  }
  return out;
}

/**
 * Choose which cells get a building, spread over the lattice rather than filling one corner.
 * Deterministic: the same count and seed pick the same cells.
 */
export function chooseCells(all, wanted, rng) {
  if (wanted >= all.length) return all.slice(0, wanted);
  const stride = Math.max(1, Math.floor(all.length / wanted));
  const offset = rng.int(0, stride - 1);
  return Array.from({ length: wanted }, (_, k) => all[offset + k * stride]);
}

/** The four faces of a footprint. A door goes on one of them, and every one fronts a street. */
export const FACES = [
  { name: "south", dx: 0, dz: -1 },
  { name: "north", dx: 0, dz: 1 },
  { name: "west", dx: -1, dz: 0 },
  { name: "east", dx: 1, dz: 0 },
];

/** Where a door sits on one face of a footprint, as a portal position + axis. */
export function doorOnFace(center, face, size) {
  if (face.dx !== 0) {
    return { position: [center.x + (face.dx * BLOCK) / 2, 0, center.z], axis: "x", size };
  }
  return { position: [center.x, 0, center.z + (face.dz * BLOCK) / 2], axis: "z", size };
}
