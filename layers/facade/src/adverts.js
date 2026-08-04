// What the panels up the side of a building actually say.
//
// A made-up word on a five-storey panel reads as nonsense. A city advertises things: somewhere to
// eat, somewhere open at four in the morning, the way to the trains. So a panel carries a trade, or
// it carries no lettering at all and is a lit graphic, which is what most of them are.

// Across a wall, where there is room for words.
const TRADE = [
  "RAMEN", "NOODLE BAR", "24H CLINIC", "LAUNDRY", "COLD BEER", "NIGHT MARKET", "PHARMACY",
  "ARCADE", "KARAOKE", "CAPSULE HOTEL", "PARKING", "TRANSIT", "REPAIRS", "COFFEE", "STREET FOOD",
];
// Running UP a wall, one letter to a line, so only short words stay readable.
const SHORT = ["24H", "OPEN", "EAT", "BAR", "MED", "FUEL", "TEA", "NOODLES", "HOTEL", "TAXI"];
// A panel with no words on it: a lit composition, which is what a city has most of.
const GRAPHICS = ["bars", "rings", "wave", "grid", "figure"];

/**
 * What one panel carries. Most carry a graphic; the rest carry a word that means something.
 *
 * @param {boolean} portrait  running up the building rather than across it
 * @param {object} rng
 * @returns {{ text: string|null, graphic: string|null, holo: boolean }}
 */
export function advertFace(portrait, rng) {
  if (rng.chance(portrait ? 0.5 : 0.55)) {
    const graphic = rng.pick(GRAPHICS);
    // A projected figure is the one graphic that is not painted flat on the panel: it stands in the
    // air in front of it, in a cone of haze.
    return { text: null, graphic, holo: graphic === "figure" };
  }
  return { text: rng.pick(portrait ? SHORT : TRADE), graphic: null, holo: false };
}
