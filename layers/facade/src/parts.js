// The small things bolted to a building: a balcony, an awning, a cartel.
//
// One function each, and each one only knows the wall it is put on. They return plain boxes in the
// building's own frame (origin at the middle of its footprint, on the ground), so a caller only has
// to add the building's position and turn them to face the way they say.

const BALCONY = { depth: 1.1, rail: 0.95, slab: 0.14, margin: 0.5 };
const AWNING = { depth: 1.4, drop: 0.35, height: 3.1 };
const SIGN = { height: 0.72, drop: 0.14, blade: { width: 0.9 } };

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
  return wall.nx !== 0
    ? [wall.nx * dist, y, along * (wall.nx > 0 ? -1 : 1)]
    : [along * (wall.nz > 0 ? 1 : -1), y, wall.nz * dist];
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

/** An awning over a shopfront: a slab tilted out over the pavement. */
export function awning(wall, along, width, colour) {
  return {
    kind: "awning",
    position: on(wall, along, AWNING.height, AWNING.depth / 2),
    size: [width, AWNING.drop, AWNING.depth],
    facing: facing(wall),
    colour,
  };
}

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
