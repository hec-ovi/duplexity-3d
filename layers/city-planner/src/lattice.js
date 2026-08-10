// Where the buildings stand, and therefore where the streets are.
//
// A city block lattice: blocks separated by gaps of STREET. The gaps ARE the streets, so they are
// connected by construction, every building fronts one on all four sides, and there is no corridor
// anywhere. Empty cells are squares you can cross.
//
// Blocks are BLOCK metres square until something on one needs more room. A column is as wide as its
// widest block and a row as deep as its deepest, so a building that arrives at its own size (a GLB
// somebody else built) pushes its column out and the streets stay straight.
//
// Pure integers and metres. No assets, no ids beyond the cell index.

export const BLOCK = 40; // a city block, metres square: its pavement plus the premises on it
export const STREET = 12; // roadway between blocks, and the margin around the whole lattice
export const SKY = 140; // how high the invisible limit reaches: taller than anything built under it
export const LATTICE_BY_SIZE = { small: 2, medium: 3, large: 4 };

/**
 * The cells of an n x n lattice, centred on the origin, in a fixed order, and the square of ground
 * they stand in.
 *
 * @param {number} n
 * @param {Array<{w:number,d:number}|undefined>} [sizes] per cell index, when a block needs more room
 * @returns {{ cells: Array<{i:number,j:number,index:number,center:{x:number,z:number},size:{w:number,d:number}}>, extent:number }}
 */
export function layout(n, sizes = []) {
  const at = (i, j) => sizes[j * n + i];
  const widths = [];
  const depths = [];
  for (let i = 0; i < n; i++) {
    let w = BLOCK;
    for (let j = 0; j < n; j++) w = Math.max(w, at(i, j)?.w ?? 0);
    widths.push(w);
  }
  for (let j = 0; j < n; j++) {
    let d = BLOCK;
    for (let i = 0; i < n; i++) d = Math.max(d, at(i, j)?.d ?? 0);
    depths.push(d);
  }

  const span = (list) => list.reduce((a, b) => a + b, 0) + (n + 1) * STREET;
  const spanX = span(widths);
  const spanZ = span(depths);
  // The ground stays square, so the gate, the spawn and the skyline are unchanged by a wide column.
  const extent = Math.max(spanX, spanZ);

  const centresOf = (list, spanOf) => {
    const out = [];
    let edge = -spanOf / 2 + STREET;
    for (const size of list) {
      out.push(edge + size / 2);
      edge += size + STREET;
    }
    return out;
  };
  const xs = centresOf(widths, spanX);
  const zs = centresOf(depths, spanZ);

  const cells = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      cells.push({
        i,
        j,
        index: cells.length,
        center: { x: xs[i], z: zs[j] },
        size: { w: widths[i], d: depths[j] },
      });
    }
  }
  return { cells, extent };
}

export const PAVEMENT = 4.5; // pavement round a block, wide enough to walk and stand on
export const MAX_PER_BLOCK = 3; // premises one block can be split into: fewer, bigger places

/**
 * Split one city block into the plots its buildings stand on. The block keeps a pavement all the way
 * round, and the buildings inside it differ in footprint, so a block reads as several premises rather
 * than one slab.
 *
 * @returns {Array<{center:{x:number,z:number}, size:{w:number,d:number}}>}
 */
export function plotsInBlock(center, count, block = { w: BLOCK, d: BLOCK }) {
  const inner = { w: block.w - PAVEMENT * 2, d: block.d - PAVEMENT * 2 };
  if (count <= 1) return [{ center: { ...center }, size: { ...inner } }];
  if (count === 2) {
    // one wide, one narrow, split along z
    const wide = inner.d * 0.58;
    const narrow = inner.d - wide - 1;
    return [
      { center: { x: center.x, z: center.z - inner.d / 2 + wide / 2 }, size: { w: inner.w, d: wide } },
      { center: { x: center.x, z: center.z + inner.d / 2 - narrow / 2 }, size: { w: inner.w, d: narrow } },
    ];
  }
  // three: one down one side, two down the other, so no premises is a quarter of a quarter
  const halfW = (inner.w - 1) / 2;
  const halfD = (inner.d - 1) / 2;
  const quads = [
    { x: -1, z: 0, w: halfW * 1.05, d: inner.d },
    { x: 1, z: -1, w: halfW * 0.95, d: halfD },
    { x: 1, z: 1, w: halfW * 0.95, d: halfD * 1.05 },
  ].slice(0, Math.min(count, 3));
  return quads.map((q) => ({
    center: { x: center.x + (q.x * (inner.w - q.w)) / 2, z: center.z + (q.z * (inner.d - q.d)) / 2 },
    size: { w: q.w, d: q.d },
  }));
}

/**
 * How big a block has to be for one of its plots to hold a footprint. Plots are fractions of the
 * block, so this grows the block by the ratio the plot falls short by and settles in a pass or two.
 *
 * @param {number} count how many premises the block is split into
 * @param {number} slot  which one has to hold it
 * @param {{w:number,d:number}} footprint what has to stand there
 * @returns {{w:number,d:number}}
 */
export function blockSizeFor(count, slot, footprint) {
  let block = { w: BLOCK, d: BLOCK };
  for (let pass = 0; pass < 8; pass++) {
    const plot = plotsInBlock({ x: 0, z: 0 }, count, block)[slot];
    const shortW = footprint.w / plot.size.w;
    const shortD = footprint.d / plot.size.d;
    if (shortW <= 1 && shortD <= 1) break;
    block = {
      w: shortW > 1 ? block.w * shortW + 1 : block.w,
      d: shortD > 1 ? block.d * shortD + 1 : block.d,
    };
  }
  // Half a metre, so a block size is a number a person can read.
  return { w: Math.ceil(block.w * 2) / 2, d: Math.ceil(block.d * 2) / 2 };
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
