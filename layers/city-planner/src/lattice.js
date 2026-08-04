// Where the buildings stand, and therefore where the streets are.
//
// A city block lattice: footprints of side BLOCK, separated by gaps of STREET. The gaps ARE the
// streets, so they are connected by construction, every building fronts one on all four sides, and
// there is no corridor anywhere. Empty cells are squares you can cross.
//
// Pure integers and metres. No assets, no ids beyond the cell index.

export const BLOCK = 32; // a city block, metres square: its pavement plus the premises on it
export const STREET = 12; // roadway between blocks, and the margin around the whole lattice
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

export const PAVEMENT = 4.5; // pavement round a block, wide enough to walk and stand on
export const MAX_PER_BLOCK = 4; // premises one block can be split into

/**
 * Split one city block into the plots its buildings stand on. The block keeps a pavement all the way
 * round, and the buildings inside it differ in footprint, so a block reads as several premises rather
 * than one slab.
 *
 * @returns {Array<{center:{x:number,z:number}, size:{w:number,d:number}}>}
 */
export function plotsInBlock(center, count) {
  const inner = BLOCK - PAVEMENT * 2;
  if (count <= 1) return [{ center: { ...center }, size: { w: inner, d: inner } }];
  if (count === 2) {
    // one wide, one narrow, split along z
    const wide = inner * 0.58;
    const narrow = inner - wide - 1;
    return [
      { center: { x: center.x, z: center.z - inner / 2 + wide / 2 }, size: { w: inner, d: wide } },
      { center: { x: center.x, z: center.z + inner / 2 - narrow / 2 }, size: { w: inner, d: narrow } },
    ];
  }
  // three or four: quarters, each a little different
  const half = (inner - 1) / 2;
  const quads = [
    { x: -1, z: -1, w: half * 1.05, d: half },
    { x: 1, z: -1, w: half * 0.95, d: half },
    { x: -1, z: 1, w: half, d: half * 0.9 },
    { x: 1, z: 1, w: half, d: half * 1.05 },
  ].slice(0, Math.min(count, 4));
  return quads.map((q) => ({
    center: { x: center.x + (q.x * (inner - q.w)) / 2, z: center.z + (q.z * (inner - q.d)) / 2 },
    size: { w: q.w, d: q.d },
  }));
}

/** The four faces of a footprint. A door goes on one of them, and every one fronts a street. */
export const FACES = [
  { name: "south", dx: 0, dz: -1 },
  { name: "north", dx: 0, dz: 1 },
  { name: "west", dx: -1, dz: 0 },
  { name: "east", dx: 1, dz: 0 },
];

/** Where a door sits on one face of a footprint of the given size, as a portal position + axis. */
export function doorOnFace(center, footprint, face, size) {
  if (face.dx !== 0) {
    return { position: [center.x + (face.dx * footprint.w) / 2, 0, center.z], axis: "x", size };
  }
  return { position: [center.x, 0, center.z + (face.dz * footprint.d) / 2], axis: "z", size };
}
