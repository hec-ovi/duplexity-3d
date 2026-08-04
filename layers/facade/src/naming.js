// What a place is called, so its sign says what it is.
//
// A name is a house word and a trade word, drawn from the seed. It is what goes on the cartel over
// the door, and what the map calls the building.

const HOUSE = [
  "NOMI", "KESTREL", "MARU", "OKA", "HALVERD", "EAST 9", "BLUE", "TANNER",
  "SIX BELLS", "VESPER", "ASHGROVE", "KANE", "HOLLOW", "SABLE",
];

const TRADE = {
  shop: ["RAMEN", "LAUNDRY", "NOODLES", "GROCER", "PHARMACY", "RECORDS", "TEA", "HARDWARE", "BAKERY"],
  office: ["& CO", "OFFICES", "CHAMBERS", "BUREAU", "WORKS", "HOLDINGS"],
  apartments: ["COURT", "HOUSE", "RESIDENCES", "TOWER", "MANSIONS"],
  house: [],
};

/**
 * Name one place. A house has no sign, so it gets no name.
 * @returns {string|null}
 */
export function nameFor(program, rng) {
  const trades = TRADE[program] ?? TRADE.shop;
  if (trades.length === 0) return null;
  return `${rng.pick(HOUSE)} ${rng.pick(trades)}`;
}
