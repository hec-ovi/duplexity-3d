// The small things bolted to a building: a balcony, an awning, a cartel.
//
// One function each, and each one only knows the wall it is put on. They return plain boxes in the
// building's own frame (origin at the middle of its footprint, on the ground), so a caller only has
// to add the building's position and turn them to face the way they say.

const BALCONY = { depth: 1.1, rail: 0.95, slab: 0.14, margin: 0.5 };
// One entry per balcony style: how far it stands out, how high its parapet is, and whether it has a
// floor at all. A French balcony is a rail across a door with nothing to stand on.
const BALCONY_SHAPE = {
  slab: { depth: 1.1, rail: 0.95, floor: true, wide: 3.2, chance: 0.62 },
  cage: { depth: 1.25, rail: 1.05, floor: true, wide: 2.6, chance: 0.72, bars: true },
  french: { depth: 0.18, rail: 0.95, floor: false, wide: 1.8, chance: 0.55 },
  corner: { depth: 1.6, rail: 1, floor: true, wide: 4.2, chance: 0.45 },
};
// A shopfront reads bottom to top: glass, then the awning over it, then the sign on the fascia. The
// two never share a height, or the sign ends up growing through the awning.
const DOOR_HEAD = 3.1; // the top of a front door: nothing is hung lower than this over one
const AWNING = { depth: 1.3, drop: 0.3, at: 0.6, clear: 0.55 }; // `at` is a share of the storey
const SIGN = { height: 0.66, drop: 0.14, at: 0.85, blade: { width: 0.8 } };
// One entry per window style: how big a pane is, how high off the floor it sits, how deep it is set,
// and how often one comes along the wall. This is what stops a city reading as one building repeated.
const WINDOW_SHAPE = {
  square: { width: 1.5, height: 1.35, sill: 0.9, depth: 0.24, step: 2.6, proud: 0.01 },
  tall: { width: 1.05, height: 2.3, sill: 0.5, depth: 0.24, step: 2.0, proud: 0.01 },
  bay: { width: 1.9, height: 1.6, sill: 0.75, depth: 0.62, step: 3.6, proud: 0.34 },
  grid: { width: 1.75, height: 2.3, sill: 0.35, depth: 0.18, step: 1.9, proud: 0.02 },
  // one band the width of the wall, which is what an office block wears
  ribbon: { width: null, height: 1.25, sill: 1.05, depth: 0.22, step: null, proud: 0.02 },
};
const WINDOW = { margin: 0.6, maxBays: 10 };
const ADVERT = { depth: 0.4, margin: 1.2, minSpan: 6 };
const NEON = { thickness: 0.16, proud: 0.1 };

/** Where a wall's outward normal points, and how wide that wall is. */
export function walls({ w, d }) {
  return [
    { name: "south", nx: 0, nz: -1, span: w, offset: d / 2 },
    { name: "north", nx: 0, nz: 1, span: w, offset: d / 2 },
    { name: "west", nx: -1, nz: 0, span: d, offset: w / 2 },
    { name: "east", nx: 1, nz: 0, span: d, offset: w / 2 },
  ];
}

const facing = (wall) => Math.atan2(wall.nx, wall.nz);

// A point `out` metres in front of a wall, `along` metres to one side of its middle, `y` metres up.
function on(wall, along, y, out) {
  const dist = wall.offset + out;
  const across = along + (wall.shift ?? 0) * (wall.nx !== 0 || wall.nz > 0 ? 1 : -1);
  return wall.nx !== 0
    ? [wall.nx * dist, y, (wall.nx > 0 ? -1 : 1) * along + (wall.shift ?? 0)]
    : [(wall.nz > 0 ? 1 : -1) * along + (wall.shift ?? 0), y, wall.nz * dist];
}

/**
 * Balconies along one storey of one wall. A slab standing out with a parapet round it, a cage with
 * bars over that parapet, a French one that is a rail across a door and nothing to stand on, or a
 * corner one that runs out to the end of the wall.
 */
export function balconies(wall, storeyY, bays, style, rng) {
  const shape = BALCONY_SHAPE[style] ?? BALCONY_SHAPE.slab;
  const out = [];
  const width = Math.min(shape.wide, (wall.span - BALCONY.margin * 2) / bays);
  for (let bay = 0; bay < bays; bay++) {
    if (!rng.chance(shape.chance)) continue;
    const step = wall.span / bays;
    // A corner balcony sits at the end of its wall rather than in the middle of its bay.
    const along =
      style === "corner"
        ? Math.sign((bay - (bays - 1) / 2) || 1) * (wall.span / 2 - width / 2 - BALCONY.margin)
        : (bay - (bays - 1) / 2) * step;
    out.push({
      kind: "balcony",
      style,
      position: on(wall, along, storeyY, shape.depth / 2),
      size: [width, BALCONY.slab, shape.depth],
      rail: shape.rail,
      floor: shape.floor, // false is a rail on the wall: nothing to stand on
      bars: Boolean(shape.bars),
      facing: facing(wall),
    });
    if (style === "corner") break; // one per wall, at one end: two would be the whole facade
  }
  return out;
}

/** How many bays of balcony a wall gets, kept low: a facade is not a filing cabinet. */
export const MAX_BALCONY_BAYS = 4;

/**
 * The windows along one storey of one wall, in the style this building wears. Each is its own thing
 * standing in its own hole, with its own light on or off behind it, so a building is not one sheet
 * of identical rectangles. A ribbon is the exception: one band the width of the wall.
 */
export function windowsOn(wall, storeyY, style, litRatio, rng, colours) {
  const shape = WINDOW_SHAPE[style] ?? WINDOW_SHAPE.square;
  const bays = windowBays(wall.span, style);
  const out = [];
  const width = shape.width ?? Math.max(1, wall.span - WINDOW.margin * 2);
  const step = wall.span / bays;
  for (let bay = 0; bay < bays; bay++) {
    const along = (bay - (bays - 1) / 2) * step;
    const lit = rng.chance(litRatio);
    out.push({
      kind: "window",
      style,
      // set back into the wall, with its face a centimetre clear of it. A bay window is the other
      // way round: it stands out over the pavement.
      position: on(wall, along, storeyY + shape.sill + shape.height / 2, shape.proud - shape.depth / 2),
      size: [width, shape.height, shape.depth],
      facing: facing(wall),
      lit,
      colour: lit ? rng.pick(colours) : null,
      blind: style !== "ribbon" && rng.chance(0.22), // some are shut: what stops a wall reading as a grid
    });
  }
  return out;
}

/** How many windows of this style a wall of this width takes. A ribbon is always one. */
export function windowBays(span, style = "square") {
  const shape = WINDOW_SHAPE[style] ?? WINDOW_SHAPE.square;
  if (!shape.step) return 1;
  return Math.max(1, Math.min(WINDOW.maxBays, Math.floor((span - WINDOW.margin) / shape.step)));
}

/** How much headroom a storey needs for this style, so nothing is cut by the floor above. */
export const windowRise = (style) => {
  const shape = WINDOW_SHAPE[style] ?? WINDOW_SHAPE.square;
  return shape.sill + shape.height;
};

/**
 * A holo advert: a big lit panel bolted flat to a wall, high enough to be seen down the street.
 * `portrait` runs up the building, `banner` across it.
 */
export function advert(wall, y, height, face, colour, portrait) {
  const across = portrait
    ? Math.min(wall.span - ADVERT.margin, height * 0.42)
    : wall.span - ADVERT.margin;
  return {
    kind: "advert",
    position: on(wall, 0, y + height / 2, ADVERT.depth / 2),
    size: [across, height, ADVERT.depth],
    facing: facing(wall),
    text: face.text,
    graphic: face.graphic,
    holo: Boolean(face.holo), // stands in the air in front of the panel rather than painted on it
    colour,
    portrait: Boolean(portrait),
  };
}

/** Whether a wall is wide enough to carry an advert at all. */
export const takesAdvert = (wall) => wall.span >= ADVERT.minSpan;

/** A neon line along the top edge of a tier: what a building wears instead of a roofline. */
export function neon(wall, y, colour) {
  return {
    kind: "neon",
    position: on(wall, 0, y, NEON.proud),
    size: [wall.span, NEON.thickness, NEON.thickness],
    facing: facing(wall),
    colour,
  };
}

/** An awning over a shopfront: a slab standing out over the pavement, under the sign. */
export function awningHeight(storey) {
  return Math.max(storey * AWNING.at, DOOR_HEAD + AWNING.clear);
}

export function awning(wall, along, width, storey, colour) {
  return {
    kind: "awning",
    position: on(wall, along, awningHeight(storey), AWNING.depth / 2),
    size: [width, AWNING.drop, AWNING.depth],
    facing: facing(wall),
    colour,
  };
}

/** Where the sign over a shopfront sits: on the fascia, clear above the door and the awning. */
export const signHeight = (storey) =>
  Math.max(storey * SIGN.at, awningHeight(storey) + SIGN.height * 0.9);

// How far off the wall each mounting holds its board, and how tall that board is.
const MOUNT = {
  flat: { out: SIGN.drop, height: SIGN.height },
  blade: { out: null, height: SIGN.height }, // set from its own width: it turns to face down the street
  frame: { out: 0.55, height: SIGN.height * 1.15 }, // held off the wall on arms, with a gap behind it
  roof: { out: 0.1, height: SIGN.height * 1.6 }, // a box standing on the parapet
};

/**
 * A cartel: a board with the name on it, hung the way this building hangs its signs.
 *
 *   flat   against the wall over the door
 *   blade  out at right angles, so it reads down the street rather than across it
 *   frame  held clear of the wall on two arms
 *   roof   standing on the parapet, seen over the whole street
 */
export function sign(wall, along, y, width, { text, colour, mount = "flat" }) {
  const shape = MOUNT[mount] ?? MOUNT.flat;
  const blade = mount === "blade";
  return {
    kind: "sign",
    orientation: blade ? "blade" : "flat",
    mount,
    position: on(wall, along, y, blade ? width / 2 : shape.out),
    // A flat sign is wide across the wall and thin through it; a blade is the other way round, which
    // is what makes it readable from up the street instead of only from in front of it.
    size: blade ? [SIGN.blade.width, shape.height, width] : [width, shape.height, 0.16],
    facing: facing(wall),
    text,
    colour,
  };
}
