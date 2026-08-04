// What shape a building is, before anything is bolted to it.
//
// A city of single extruded boxes reads as a city of boxes however well it is textured. So a
// building is a stack of TIERS: the ground one always fills its plot (that is what you walk into),
// and the ones above step back, narrow, or shoulder to one side. A handful of shapes, drawn from the
// seed, is enough that no two buildings on a street stand the same way.
//
// Everything is in the building's own frame: origin in the middle of its footprint, on the ground.

const SHAPES = ["slab", "setback", "stepped", "shoulder", "tower"];
const LEDGE = { depth: 0.22, height: 0.28 }; // the band round a tier where it steps back
const PARAPET = { height: 0.7, proud: 0.18 };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * @param {{w:number,h:number,d:number,floors:number,storey:number}} building
 * @param {object} rng
 * @returns {{ shape:string, tiers:Array, bands:Array }}
 *   `tiers` are the solid masses, `bands` the ledges and the parapet cap that trim them.
 */
export function massingFor({ w, h, d, floors, storey }, rng) {
  // Nothing to step: a low building is one mass with a cap on it.
  const shape = floors <= 2 ? "slab" : rng.pick(SHAPES);
  const tiers = [];

  const push = (from, to, insetX, insetZ, shiftX = 0, shiftZ = 0) => {
    const height = to - from;
    if (height <= 0.2) return;
    tiers.push({
      position: [shiftX, from + height / 2, shiftZ],
      size: [Math.max(2, w - insetX * 2), height, Math.max(2, d - insetZ * 2)],
    });
  };

  if (shape === "slab") {
    push(0, h, 0, 0);
  } else if (shape === "setback") {
    const at = clamp(Math.round(floors * rng.range(0.4, 0.6)), 1, floors - 1) * storey;
    push(0, at, 0, 0);
    push(at, h, rng.range(0.6, 1.4), rng.range(0.6, 1.4));
  } else if (shape === "stepped") {
    const first = clamp(Math.round(floors * 0.35), 1, floors - 2) * storey;
    const second = clamp(Math.round(floors * 0.7), 2, floors - 1) * storey;
    push(0, first, 0, 0);
    push(first, second, rng.range(0.5, 1), rng.range(0.5, 1));
    push(second, h, rng.range(1.4, 2.2), rng.range(1.4, 2.2));
  } else if (shape === "shoulder") {
    // A low wing along one side, and the rest carried to full height.
    const wing = clamp(Math.round(floors * rng.range(0.3, 0.5)), 1, floors - 1) * storey;
    const cut = w * rng.range(0.3, 0.42);
    push(0, wing, 0, 0);
    push(wing, h, cut / 2, rng.range(0.4, 1), -cut / 2);
  } else {
    // tower: a wider plinth for the first storeys, then a shaft
    const plinth = clamp(Math.round(floors * 0.25), 1, floors - 1) * storey;
    push(0, plinth, 0, 0);
    push(plinth, h, w * rng.range(0.14, 0.24), d * rng.range(0.14, 0.24));
  }

  // A band where each tier meets the one under it, and a cap on the top: what makes a stack read as
  // a building rather than as boxes left on top of each other.
  const bands = [];
  for (let i = 1; i < tiers.length; i++) {
    const under = tiers[i - 1];
    bands.push({
      position: [under.position[0], under.position[1] + under.size[1] / 2, under.position[2]],
      size: [under.size[0] + LEDGE.depth * 2, LEDGE.height, under.size[2] + LEDGE.depth * 2],
    });
  }
  const top = tiers.at(-1);
  bands.push({
    position: [top.position[0], top.position[1] + top.size[1] / 2 - PARAPET.height / 2, top.position[2]],
    size: [top.size[0] + PARAPET.proud * 2, PARAPET.height, top.size[2] + PARAPET.proud * 2],
  });

  return { shape, tiers, bands };
}

/**
 * The walls a tier presents to the street: which way each faces, how wide it is, and how far out
 * from the building's middle its face stands. What gets dressed is a tier, not the whole building.
 */
export function tierWalls(tier) {
  const [w, , d] = tier.size;
  const [cx, , cz] = tier.position;
  return [
    { name: "south", nx: 0, nz: -1, span: w, offset: d / 2 - cz, shift: cx },
    { name: "north", nx: 0, nz: 1, span: w, offset: d / 2 + cz, shift: cx },
    { name: "west", nx: -1, nz: 0, span: d, offset: w / 2 - cx, shift: cz },
    { name: "east", nx: 1, nz: 0, span: d, offset: w / 2 + cx, shift: cz },
  ];
}
