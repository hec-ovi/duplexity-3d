// The city at night, with the saturation taken off: dark concrete and asphalt, warm lamps, and only
// the windows and signs carrying colour. Everything here is a plain CSS colour string, so a painter
// never computes one.

export const PALETTE = {
  road: {
    base: "#22252a",
    grain: ["#1b1e22", "#282c32", "#191c20"],
    seam: "#16181c",
    patch: "#272b31",
    wet: "#14171b",
    puddle: "#0d1014",
  },
  pavement: {
    base: "#5f646d",
    grain: ["#575c65", "#686d77", "#525761"],
    joint: "#3f434b",
    stain: "#4c5058",
  },
  plaza: {
    base: "#6b707a",
    grain: ["#646973", "#747a85", "#5d626b"],
    joint: "#4a4e57",
    stain: "#565b64",
  },
  concrete: {
    base: "#585d66",
    grain: ["#525762", "#5f646e", "#4d525b"],
    joint: "#484d56",
    stain: "#4f545d",
  },
  facade: {
    base: "#2c3037",
    grain: ["#282c33", "#31363d", "#24282e"],
    ledge: "#3b414a",
    parapet: "#464c56",
    shopfront: "#1a1d22",
    fascia: "#343941",
    frame: "#141619",
    glass: "#1b2028",
  },
  // What a lit window looks like from the street. Mostly warm, the odd cold office or a bar sign.
  windows: ["#ffd7a0", "#ffe9c4", "#f6c98a", "#bfe0ff", "#a8f0e0"],
  // Shopfronts and signs glow harder than a window and pick a colour, but they are paint and gas on
  // a wet street, not a screen: kept short of full saturation so bloom does not turn them into neon.
  signs: ["#e8899f", "#dda368", "#7cc3d4", "#a892c8", "#ddc87e"],
  spill: "#ffe6c0", // what a lit shop throws out through its glass, behind the sign
  off: "#000000",
};
