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
  // The pavement is where the city's colour comes from after dark: slabs with light in the joints
  // between them, cold against the warm lamps over them.
  pavement: {
    base: "#243138",
    grain: ["#1f2b32", "#2a3941", "#1b262c"],
    joint: "#31474f",
    stain: "#1d282e",
    glow: "#2ad4e6", // what runs in the joints, and along the kerb
  },
  plaza: {
    base: "#28353d",
    grain: ["#233038", "#2e3d46", "#1f2a31"],
    joint: "#354c55",
    stain: "#212c33",
    glow: "#22c2d8",
  },
  concrete: {
    base: "#585d66",
    grain: ["#525762", "#5f646e", "#4d525b"],
    joint: "#484d56",
    stain: "#4f545d",
  },
  floor: {
    base: "#5c626c",
    grain: ["#565c66", "#646a74", "#525862"],
    joint: "#42474f",
    stain: "#4e535c",
  },
  wall: {
    base: "#6e737c",
    grain: ["#686d76", "#757a83", "#636871"],
    joint: "#5c616a",
    stain: "#666b74",
  },
  ceiling: {
    base: "#6a6f78",
    grain: ["#646972", "#71767f", "#5f646d"],
    joint: "#5a5f68",
    stain: "#616670",
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
  blind: "#8d8375", // a blind pulled down: pale, and it lets less light through
  spill: "#ffe6c0", // what a lit shop throws out through its glass, behind the sign
  off: "#000000",
};
