// What KIND of building this one is, decided once from its seed.
//
// A street where every window is the same window reads as one building repeated, however well it is
// textured. So each building draws a look: which window it wears, what its balconies are, how its
// sign is mounted, what its front door is. Everything else in this box reads these, so a building
// is consistent with itself: an office does not get French balconies over a roller shutter.

export const WINDOW_STYLES = ["square", "tall", "ribbon", "bay", "grid"];
export const BALCONY_STYLES = ["slab", "cage", "french", "corner"];
export const SIGN_MOUNTS = ["flat", "blade", "roof", "frame"];
export const DOOR_STYLES = ["shopfront", "flush", "recessed", "double", "shutter"];

// What each program plausibly wears. A shop is glass at street level; an office is a ribbon or a
// curtain wall; a house is small windows and a plain door.
const BY_PROGRAM = {
  shop: {
    windows: ["square", "tall", "grid"],
    balconies: ["french"],
    doors: ["shopfront", "shopfront", "double", "shutter"],
  },
  office: {
    windows: ["ribbon", "grid", "ribbon", "tall"],
    balconies: ["slab"],
    doors: ["double", "flush", "recessed"],
  },
  apartments: {
    windows: ["square", "tall", "bay", "square"],
    balconies: ["slab", "cage", "corner", "french"],
    doors: ["recessed", "flush", "double"],
  },
  house: {
    windows: ["square", "bay"],
    balconies: ["french", "cage"],
    doors: ["flush", "recessed"],
  },
};

/**
 * Draw one building's look.
 *
 * @param {string} program
 * @param {number} storeys  how tall it stands, which is what decides a roof sign from a fascia one
 * @param {object} rng
 * @returns {{ window:string, balcony:string, mount:string, door:string }}
 */
export function styleFor(program, storeys, rng) {
  const table = BY_PROGRAM[program] ?? BY_PROGRAM.shop;
  return {
    window: rng.pick(table.windows),
    balcony: rng.pick(table.balconies),
    // A sign on the roof only makes sense on something tall enough to see it over.
    mount: storeys >= 8 && rng.chance(0.4) ? "roof" : rng.pick(["flat", "flat", "frame"]),
    door: rng.pick(table.doors),
  };
}
