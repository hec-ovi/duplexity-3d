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

const INNER = BLOCK - PAVEMENT * 2; // what a block has room to build on
const GAP = 1; // between two premises on the same block
const NEAR = 0.25; // between the two that share one side of a three-way split

/**
 * How big each premises on a block is. A premises is the size a premises is; only one that has to
 * hold something pinned there grows, so a big building never drags its neighbours out with it.
 *
 * @param {number} count how many premises the block is split into
 * @param {Array<{w:number,d:number}|undefined>} [demands] per slot, what has to fit there
 */
export function plotSizes(count, demands = []) {
  const grown = (slot, w, d) => ({
    w: Math.max(w, demands[slot]?.w ?? 0),
    d: Math.max(d, demands[slot]?.d ?? 0),
  });
  if (count <= 1) return [grown(0, INNER, INNER)];
  if (count === 2) {
    // one wide, one narrow, split along z
    const wide = INNER * 0.58;
    return [grown(0, INNER, wide), grown(1, INNER, INNER - wide - GAP)];
  }
  // three: one down one side, two down the other, so no premises is a quarter of a quarter
  const half = (INNER - GAP) / 2;
  return [grown(0, half * 1.05, INNER), grown(1, half * 0.95, half), grown(2, half * 0.95, half * 1.05)].slice(
    0,
    Math.min(count, 3)
  );
}

/** The ground a block has to give up to hold those premises, pavement not counted. */
function innerFor(sizes) {
  if (sizes.length <= 1) return { w: sizes[0].w, d: sizes[0].d };
  if (sizes.length === 2) {
    return { w: Math.max(sizes[0].w, sizes[1].w), d: sizes[0].d + sizes[1].d + GAP };
  }
  return {
    w: sizes[0].w + Math.max(sizes[1].w, sizes[2].w) + GAP,
    d: Math.max(sizes[0].d, sizes[1].d + sizes[2].d + NEAR),
  };
}

/**
 * Split one city block into the plots its buildings stand on. Each premises is anchored to its own
 * corner of the block, so growing one moves the others apart without resizing them.
 *
 * @returns {Array<{center:{x:number,z:number}, size:{w:number,d:number}}>}
 */
export function plotsInBlock(center, count, demands = []) {
  const sizes = plotSizes(count, demands);
  const inner = innerFor(sizes);
  const at = (x, z, size) => ({ center: { x: center.x + x, z: center.z + z }, size });

  if (sizes.length <= 1) return [at(0, 0, sizes[0])];
  if (sizes.length === 2) {
    return [
      at(0, -inner.d / 2 + sizes[0].d / 2, sizes[0]),
      at(0, inner.d / 2 - sizes[1].d / 2, sizes[1]),
    ];
  }
  const left = -inner.w / 2 + sizes[0].w / 2;
  return [
    at(left, 0, sizes[0]),
    at(inner.w / 2 - sizes[1].w / 2, -inner.d / 2 + sizes[1].d / 2, sizes[1]),
    at(inner.w / 2 - sizes[2].w / 2, inner.d / 2 - sizes[2].d / 2, sizes[2]),
  ];
}

/**
 * How big a block has to be to hold what stands on it: the plots, and a pavement all the way round.
 *
 * @param {number} count how many premises the block is split into
 * @param {Array<{w:number,d:number}|undefined>} [demands] per slot, what has to fit there
 * @returns {{w:number,d:number}}
 */
export function blockSizeFor(count, demands = []) {
  const inner = innerFor(plotSizes(count, demands));
  // Half a metre, so a block size is a number a person can read.
  const round = (n) => Math.ceil((n + PAVEMENT * 2) * 2) / 2;
  return { w: Math.max(BLOCK, round(inner.w)), d: Math.max(BLOCK, round(inner.d)) };
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
