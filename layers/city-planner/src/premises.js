// What stands on each block, decided before anything becomes geometry.
//
// One brief per premises: which plot it takes, how tall it is, what it is for, which face its door
// would be on, and whether it has a door at all. Every seeded choice is made here, so `index.js` is
// plain assembly and an author's pins land in exactly one place.

import { FACES, MAX_PER_BLOCK, plotsInBlock } from "./lattice.js";
import { CitySpecInvalidError } from "./errors.js";

const PROGRAMS = ["apartments", "office", "shop"];
const HOUSE_PROGRAMS = ["house", "shop"];
// A skyline needs a mix. Without floorsPerLot, heights are drawn from this: mostly low premises with
// the odd tower, so a block reads as houses and shops around something taller.
const FLOOR_MIX = [1, 1, 1, 2, 2, 3, 4, 6, 9];

/**
 * Plan every premises on the lattice.
 *
 * @param {object} spec  CitySpec
 * @param {Array}  cells the lattice, from `lattice.cells`
 * @param {object} rng   the seeded generator
 * @param {Function} programFits injected building-planner.programFits: whether a room mix fits a
 *   footprint. Without it every program is assumed to fit, and the caller owns that.
 * @returns {Array<{id,block,slot,plot,footprint,face,floors,program,label,accessible,quest?}>}
 */
export function planPremises(spec, cells, rng, programFits = () => true) {
  const pins = indexPins(spec.buildings ?? [], cells.length);
  const minimums = cells.map((_, block) => pinnedSlots(pins, block));
  const counts = countPerBlock(cells.length, spec.lots ?? null, minimums, rng);

  const list = [];
  for (let block = 0; block < cells.length; block++) {
    if (counts[block] === 0) continue;
    const plots = plotsInBlock(cells[block].center, counts[block]);
    for (let slot = 0; slot < plots.length; slot++) {
      const pin = pins.get(`${block}:${slot}`) ?? {};
      const ordinal = list.length + 1;
      const floors = pin.floors ?? floorsFor(spec, list.length, rng);
      const footprint = footprintOf(plots[slot]);
      list.push({
        id: `${spec.id}-b${ordinal}`,
        block,
        slot,
        plot: plots[slot],
        footprint,
        floors,
        face: outwardFace(cells[block].center, plots[slot].center, rng),
        program: programFor(pin, floors, footprint, programFits, rng),
        label: pin.label ?? `${spec.label ?? spec.id} ${ordinal}`,
        accessible: pin.accessible ?? (pin.quest ? true : undefined),
        ...(pin.quest ? { quest: questFor(pin, floors) } : {}),
      });
    }
  }
  assignDoors(list, spec.accessibleRatio ?? 1, rng);
  return list;
}

/** How much of the plot the building's interior gets: the mass, less its outside walls. */
function footprintOf(plot) {
  return { width: Math.max(6, plot.size.w - 2), depth: Math.max(6, plot.size.d - 2) };
}

// What the place is for. A small premises cannot be an open-plan office, so only the mixes that fit
// inside this footprint are on the table, and an author who pinned one that does not is told so.
function programFor(pin, floors, footprint, programFits, rng) {
  if (pin.program) {
    if (!programFits(pin.program, footprint)) {
      throw new CitySpecInvalidError(
        `a ${pin.program} does not fit in the ${footprint.width.toFixed(1)}x${footprint.depth.toFixed(1)}m ` +
          `premises pinned at block ${pin.block} slot ${pin.slot}`
      );
    }
    return pin.program;
  }
  const wanted = floors > 1 ? PROGRAMS : HOUSE_PROGRAMS;
  const usable = wanted.filter((p) => programFits(p, footprint));
  if (usable.length === 0) throw new CitySpecInvalidError("a premises is too small to build anything in");
  return rng.pick(usable);
}

function indexPins(list, blockCount) {
  const byKey = new Map();
  for (const pin of list) {
    if (!(pin.block >= 0 && pin.block < blockCount)) {
      throw new CitySpecInvalidError(`no block ${pin.block}: this city has ${blockCount}`);
    }
    if (!(pin.slot >= 0 && pin.slot < MAX_PER_BLOCK)) {
      throw new CitySpecInvalidError(`no slot ${pin.slot}: a block holds at most ${MAX_PER_BLOCK}`);
    }
    const key = `${pin.block}:${pin.slot}`;
    if (byKey.has(key)) throw new CitySpecInvalidError(`two buildings pinned to block ${pin.block} slot ${pin.slot}`);
    if (pin.quest && pin.accessible === false) {
      throw new CitySpecInvalidError(`the quest on block ${pin.block} is inside a building with no door`);
    }
    byKey.set(key, pin);
  }
  return byKey;
}

/** How many premises a block must be split into to hold the slots pinned on it. */
function pinnedSlots(pins, block) {
  let least = 0;
  for (const pin of pins.values()) {
    if (pin.block === block) least = Math.max(least, pin.slot + 1);
  }
  return least;
}

// How many premises each block gets. Blocks differ, and the total is trimmed or topped up to match
// what the spec asked for, so `lots` still means "this many buildings".
function countPerBlock(blockCount, wanted, minimums, rng) {
  const counts = Array.from({ length: blockCount }, (_, i) => Math.max(minimums[i], rng.int(2, MAX_PER_BLOCK)));
  if (wanted == null) return counts;

  const pinned = minimums.reduce((a, b) => a + b, 0);
  if (wanted < pinned) {
    throw new CitySpecInvalidError(`${wanted} buildings asked for, but ${pinned} are pinned in place`);
  }
  if (wanted > blockCount * MAX_PER_BLOCK) {
    throw new CitySpecInvalidError(`${wanted} buildings asked for, room for ${blockCount * MAX_PER_BLOCK}`);
  }

  let total = counts.reduce((a, b) => a + b, 0);
  for (let guard = 0; total !== wanted && guard < blockCount * MAX_PER_BLOCK * 2; guard++) {
    const i = guard % blockCount;
    if (total > wanted && counts[i] > minimums[i]) {
      counts[i] -= 1;
      total -= 1;
    } else if (total < wanted && counts[i] < MAX_PER_BLOCK) {
      counts[i] += 1;
      total += 1;
    }
  }
  return counts;
}

// How many floors this premises gets. A short `floorsPerLot` repeats its last value; with none given
// the height is drawn from the mix.
function floorsFor(spec, index, rng) {
  const list = spec.floorsPerLot ?? [];
  if (list.length === 0) return rng.pick(FLOOR_MIX);
  return list[Math.min(index, list.length - 1)];
}

// A front door faces the pavement, never the inside of its own block: the gap between two premises
// is not a street, and a door onto it is a door nobody can reach.
function outwardFace(blockCentre, plotCentre, rng) {
  const out = FACES.filter(
    (f) =>
      (f.dx !== 0 && Math.sign(plotCentre.x - blockCentre.x) === f.dx) ||
      (f.dz !== 0 && Math.sign(plotCentre.z - blockCentre.z) === f.dz)
  );
  return rng.pick(out.length ? out : FACES); // a premises alone on its block fronts every side
}

function questFor(pin, floors) {
  const floor = pin.quest.floor ?? floors;
  if (floor > floors) {
    throw new CitySpecInvalidError(
      `the quest is on floor ${floor} of a building ${floors} storey(s) tall`
    );
  }
  return { itemId: pin.quest.itemId, floor };
}

// Not every building is somewhere you can go. A sealed one is scenery: no door, no instance behind
// it, and never a node on the map, so the exit gate is not waiting on it. Pinned answers win; the
// rest are drawn until the ratio is met, and at least one building is always open.
function assignDoors(list, ratio, rng) {
  const free = list.filter((p) => p.accessible === undefined);
  if (ratio >= 1) {
    for (const p of free) p.accessible = true;
    return;
  }
  const alreadyOpen = list.filter((p) => p.accessible === true).length;
  let open = Math.max(0, Math.max(1, Math.round(list.length * ratio)) - alreadyOpen);
  for (const p of shuffle(free, rng)) p.accessible = open-- > 0;
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
