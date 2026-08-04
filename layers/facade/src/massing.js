// What shape a building is, before anything is bolted to it.
//
// A city of extruded boxes reads as a city of boxes however well it is textured, and stacking boxes
// on boxes only makes wedding cakes. The shapes here are the ones a dense night city actually has:
// masses that BATTER inward as they rise or FLARE into a crown, towers cut through by a void and
// carried on legs, a shaft that narrows to a waist and widens again, two shafts joined at the top,
// and something standing on the roof - a mast, a frame, a dish.
//
// Everything is in the building's own frame: origin in the middle of its footprint, on the ground.

const LEDGE = { depth: 0.22, height: 0.28 }; // the band round a tier where it steps back
const PARAPET = { height: 0.7, proud: 0.18 };
const LEG = 0.16; // a leg under a void, as a share of the tier's width

// What a building can stand as. The first five keep their footprint and step; the rest lean, are cut
// through, or carry something wider than what holds it up. Weighted by repetition: a night city is
// mostly things that LEAN, and a street of upright boxes is what reads as a street of boxes.
const SHAPES = [
  "slab", "setback", "stepped", "shoulder", "tower",
  "battered", "battered", "battered",
  "waisted", "waisted",
  "slotted", "slotted",
  "crowned", "crowned",
  "void",
];

// What can stand on a roof, and how tall it is as a share of the building. Only something with the
// height to be seen over gets one.
const TOPPERS = ["mast", "frame", "dish", "spire", "vents"];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * @param {{w:number,h:number,d:number,floors:number,storey:number}} building
 * @param {object} rng
 * @returns {{ shape:string, tiers:Array, bands:Array, topper:object|null }}
 *   `tiers` are the solid masses, each with a `taper` (the top's size as a share of its bottom's);
 *   `bands` the ledges and the parapet cap that trim them; `topper` whatever stands on the roof.
 */
export function massingFor({ w, h, d, floors, storey }, rng) {
  // Nothing to step: a low building is one mass with a cap on it.
  const shape = floors <= 2 ? "slab" : rng.pick(SHAPES);
  const tiers = [];

  const push = (from, to, insetX, insetZ, opts = {}) => {
    const height = to - from;
    if (height <= 0.2) return null;
    const tier = {
      position: [opts.shiftX ?? 0, from + height / 2, opts.shiftZ ?? 0],
      size: [Math.max(2, w - insetX * 2), height, Math.max(2, d - insetZ * 2)],
      taper: opts.taper ?? [1, 1],
      ...(opts.legs ? { legs: opts.legs } : {}),
    };
    tiers.push(tier);
    return tier;
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
    push(wing, h, cut / 2, rng.range(0.4, 1), { shiftX: -cut / 2 });
  } else if (shape === "tower") {
    // a wider plinth for the first storeys, then a shaft
    const plinth = clamp(Math.round(floors * 0.25), 1, floors - 1) * storey;
    push(0, plinth, 0, 0);
    push(plinth, h, w * rng.range(0.14, 0.24), d * rng.range(0.14, 0.24));
  } else if (shape === "battered") {
    // One mass leaning in the whole way up, on a skirt that flares out over the pavement. This is the
    // silhouette a night city is mostly made of, and no stack of boxes gives it.
    const skirt = storey * rng.range(1, 1.6);
    push(0, skirt, 0, 0, { taper: [1, 1] });
    push(skirt, h, 0.4, 0.4, { taper: [rng.range(0.55, 0.78), rng.range(0.55, 0.78)] });
  } else if (shape === "waisted") {
    // Wide at the street, drawn in to a waist, and opening out again into a crown.
    const low = clamp(Math.round(floors * 0.3), 1, floors - 2) * storey;
    const high = clamp(Math.round(floors * 0.78), 2, floors - 1) * storey;
    const waist = rng.range(0.6, 0.72);
    push(0, low, 0, 0, { taper: [waist, waist] });
    push(low, high, (w * (1 - waist)) / 2, (d * (1 - waist)) / 2, { taper: [1, 1] });
    push(high, h, (w * (1 - waist)) / 2, (d * (1 - waist)) / 2, { taper: [rng.range(1.15, 1.4), rng.range(1.15, 1.4)] });
  } else if (shape === "slotted") {
    // Two shafts with a slot of sky between them, joined at the top. Reads as one building with a
    // hole through it, which is what half the towers in the reference are.
    const gap = w * rng.range(0.16, 0.26);
    const shaft = (w - gap) / 2;
    const bridge = clamp(Math.round(floors * rng.range(0.7, 0.85)), 2, floors - 1) * storey;
    const plinth = storey * rng.range(1, 2);
    push(0, plinth, 0, 0);
    for (const side of [-1, 1]) {
      push(plinth, bridge, (w - shaft) / 2, rng.range(0.3, 0.8), {
        shiftX: (side * (shaft + gap)) / 2,
        taper: [rng.range(0.72, 0.92), 1],
      });
    }
    push(bridge, h, 0.5, rng.range(0.3, 0.8), { taper: [rng.range(0.8, 0.95), 0.9] });
  } else if (shape === "crowned") {
    // A narrow shaft carrying a cap wider than itself: the thing a box can never do.
    const shaft = clamp(Math.round(floors * rng.range(0.72, 0.86)), 2, floors - 1) * storey;
    const inset = w * rng.range(0.2, 0.3);
    push(0, storey, 0, 0);
    push(storey, shaft, inset, inset, { taper: [rng.range(0.76, 0.94), rng.range(0.76, 0.94)] });
    push(shaft, h, inset * rng.range(0.1, 0.4), inset * rng.range(0.1, 0.4), { taper: [0.9, 0.9] });
  } else {
    // void: a mass, then open sky carried on legs, then a mass again. A building you can see through.
    const under = clamp(Math.round(floors * rng.range(0.35, 0.5)), 1, floors - 2) * storey;
    const open = storey * rng.range(1.2, 2.2);
    push(0, under, 0, 0, { taper: [rng.range(0.78, 0.96), 1] });
    push(under, under + open, w * (0.5 - LEG), d * 0.2, { legs: 2 });
    push(under + open, h, rng.range(0.4, 1.2), rng.range(0.4, 1.2), { taper: [rng.range(0.8, 0.95), 1] });
  }

  // A band where each tier meets the one under it, and a cap on the top: what makes a stack read as
  // a building rather than as boxes left on top of each other. A tier that leans is trimmed at the
  // size it actually ends up, not the size it started.
  const bands = [];
  for (let i = 1; i < tiers.length; i++) {
    const under = tiers[i - 1];
    if (under.legs) continue; // nothing to trim: it is open sky on columns
    bands.push({
      position: [under.position[0], under.position[1] + under.size[1] / 2, under.position[2]],
      size: [
        under.size[0] * under.taper[0] + LEDGE.depth * 2,
        LEDGE.height,
        under.size[2] * under.taper[1] + LEDGE.depth * 2,
      ],
    });
  }
  const top = tiers.at(-1);
  bands.push({
    position: [top.position[0], top.position[1] + top.size[1] / 2 - PARAPET.height / 2, top.position[2]],
    size: [
      top.size[0] * top.taper[0] + PARAPET.proud * 2,
      PARAPET.height,
      top.size[2] * top.taper[1] + PARAPET.proud * 2,
    ],
  });

  return { shape, tiers, bands, topper: topperFor(h, top, floors, rng) };
}

// What stands on the roof. Only a building tall enough to be seen over its neighbours gets one, and
// it is always narrower than the roof it stands on.
function topperFor(h, top, floors, rng) {
  if (floors < 6 || !rng.chance(0.55)) return null;
  const roof = Math.min(top.size[0] * top.taper[0], top.size[2] * top.taper[1]);
  const kind = rng.pick(TOPPERS);
  const height = h * (kind === "mast" || kind === "spire" ? rng.range(0.14, 0.3) : rng.range(0.04, 0.09));
  return {
    kind,
    position: [top.position[0], top.position[1] + top.size[1] / 2, top.position[2]],
    width: roof * (kind === "mast" || kind === "spire" ? rng.range(0.06, 0.14) : rng.range(0.3, 0.6)),
    height,
  };
}

/**
 * The walls a tier presents to the street AT ONE HEIGHT: which way each faces, how wide it is there,
 * and how far out from the building's middle its face stands there. A tier that leans is narrower
 * the higher you go, so anything hung on it has to be hung at the size the wall actually IS at that
 * height, or it floats off the face.
 *
 * @param {object} tier
 * @param {number} [y]  height in the building's frame; defaults to the tier's own bottom
 */
export function tierWalls(tier, y) {
  const [w, h, d] = tier.size;
  const [cx, cy, cz] = tier.position;
  const bottom = cy - h / 2;
  const up = h > 0 ? clamp((y ?? bottom) - bottom, 0, h) / h : 0;
  const [tx, tz] = tier.taper ?? [1, 1];
  const ww = w * (1 + (tx - 1) * up);
  const dd = d * (1 + (tz - 1) * up);
  return [
    { name: "south", nx: 0, nz: -1, span: ww, offset: dd / 2 - cz, shift: cx },
    { name: "north", nx: 0, nz: 1, span: ww, offset: dd / 2 + cz, shift: cx },
    { name: "west", nx: -1, nz: 0, span: dd, offset: ww / 2 - cx, shift: cz },
    { name: "east", nx: 1, nz: 0, span: dd, offset: ww / 2 + cx, shift: cz },
  ];
}
