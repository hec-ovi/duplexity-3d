// The small things bolted to a building: a balcony, an awning, a cartel.
//
// One function each, and each one only knows the wall it is put on. They return plain boxes in the
// building's own frame (origin at the middle of its footprint, on the ground), so a caller only has
// to add the building's position and turn them to face the way they say.

const BALCONY = { depth: 1.1, rail: 0.95, slab: 0.14, margin: 0.5 };
// A shopfront reads bottom to top: glass, then the awning over it, then the sign on the fascia. The
// two never share a height, or the sign ends up growing through the awning.
const DOOR_HEAD = 3.1; // the top of a front door: nothing is hung lower than this over one
const AWNING = { depth: 1.3, drop: 0.3, at: 0.6, clear: 0.55 }; // `at` is a share of the storey
const SIGN = { height: 0.66, drop: 0.14, at: 0.85, blade: { width: 0.8 } };
const WINDOW = { width: 1.5, height: 1.35, depth: 0.24, sill: 0.9, margin: 0.6, proud: 0.01 };
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

/** Balconies along one storey of one wall: a slab standing out, with a parapet round it. */
export function balconies(wall, storeyY, bays, rng) {
  const out = [];
  const width = Math.min(3.2, (wall.span - BALCONY.margin * 2) / bays);
  for (let bay = 0; bay < bays; bay++) {
    if (!rng.chance(0.62)) continue;
    const along = (bay - (bays - 1) / 2) * (wall.span / bays);
    out.push({
      kind: "balcony",
      position: on(wall, along, storeyY, BALCONY.depth / 2),
      size: [width, BALCONY.slab, BALCONY.depth],
      rail: BALCONY.rail,
      facing: facing(wall),
    });
  }
  return out;
}

/** How many bays of balcony a wall gets, kept low: a facade is not a filing cabinet. */
export const MAX_BALCONY_BAYS = 4;

/**
 * The windows along one storey of one wall. Each is its own thing standing in its own hole, with its
 * own light on or off behind it, so a building is not one sheet of identical rectangles.
 */
export function windowsOn(wall, storeyY, bays, litRatio, rng, colours) {
  const out = [];
  const step = wall.span / bays;
  for (let bay = 0; bay < bays; bay++) {
    const along = (bay - (bays - 1) / 2) * step;
    const lit = rng.chance(litRatio);
    out.push({
      kind: "window",
      // set back into the wall, with its face a centimetre clear of it
      position: on(wall, along, storeyY + WINDOW.sill + WINDOW.height / 2, WINDOW.proud - WINDOW.depth / 2),
      size: [WINDOW.width, WINDOW.height, WINDOW.depth],
      facing: facing(wall),
      lit,
      colour: lit ? rng.pick(colours) : null,
      blind: rng.chance(0.22), // some are shut, which is what stops a wall reading as a grid
    });
  }
  return out;
}

/** How many windows a wall of this width takes. */
export const windowBays = (span) => Math.max(1, Math.min(8, Math.floor((span - WINDOW.margin) / 2.6)));

/**
 * A holo advert: a big lit panel bolted flat to a wall, high enough to be seen down the street.
 * `portrait` runs up the building, `banner` across it.
 */
export function advert(wall, y, height, text, colour, portrait) {
  const across = portrait
    ? Math.min(wall.span - ADVERT.margin, height * 0.42)
    : wall.span - ADVERT.margin;
  return {
    kind: "advert",
    position: on(wall, 0, y + height / 2, ADVERT.depth / 2),
    size: [across, height, ADVERT.depth],
    facing: facing(wall),
    text,
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

/**
 * A cartel: a board with the name on it. `flat` sits against the wall over the door; `blade` sticks
 * out from it, so it reads down the street rather than across it.
 */
export function sign(wall, along, y, width, { text, colour, blade = false }) {
  return {
    kind: "sign",
    orientation: blade ? "blade" : "flat",
    position: on(wall, along, y, blade ? width / 2 : SIGN.drop),
    // A flat sign is wide across the wall and thin through it; a blade is the other way round, which
    // is what makes it readable from up the street instead of only from in front of it.
    size: blade ? [SIGN.blade.width, SIGN.height, width] : [width, SIGN.height, 0.16],
    facing: facing(wall),
    text,
    colour,
  };
}
