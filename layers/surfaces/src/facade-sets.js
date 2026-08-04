// What a building's walls are CLAD in.
//
// Five sets, drawn from the building's seed: precast panels, small tile, corrugated sheet, brick, and
// a dark glass curtain. Each carries its own colours and its own pattern, so two buildings side by
// side never wear the same wall. This is the thing that stops a street reading as one texture tiled
// across everything standing on it.

export const FACADE_SETS = ["panel", "tile", "corrugated", "brick", "curtain"];

// Base tone, the grain over it, and what the ledges and parapet are cut from.
const SET = {
  panel: {
    base: "#2c3037",
    grain: ["#282c33", "#31363d", "#24282e"],
    ledge: "#3b414a",
    parapet: "#464c56",
    line: "#1c2026",
  },
  tile: {
    base: "#333a3c",
    grain: ["#2e3537", "#3a4144", "#2a3133"],
    ledge: "#434b4d",
    parapet: "#4d5558",
    line: "#232a2c",
  },
  corrugated: {
    base: "#34343c",
    grain: ["#2f2f37", "#3b3b44", "#2b2b32"],
    ledge: "#43434d",
    parapet: "#4d4d58",
    line: "#232329",
  },
  brick: {
    base: "#3a2f2c",
    grain: ["#352b28", "#413531", "#302724"],
    ledge: "#4a3d38",
    parapet: "#544640",
    line: "#2a211e",
  },
  curtain: {
    base: "#1c2430",
    grain: ["#1a2029", "#222b38", "#161c25"],
    ledge: "#2a3340",
    parapet: "#333d4c",
    line: "#0f141b",
  },
};

/** The colours one set is painted in. */
export const setColours = (set) => SET[set] ?? SET.panel;

/**
 * Draw the cladding pattern over a wall that is already based in its own colour.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} plan  the facade plan: width, height, bayW, rowH
 * @param {string} set   one of FACADE_SETS
 */
export function paintCladding(ctx, plan, set) {
  const { width, height, bayW, rowH } = plan;
  const colours = setColours(set);

  if (set === "corrugated") {
    // vertical ribs, close enough together to read as sheet from across the street
    const rib = Math.max(3, Math.round(bayW / 8));
    ctx.globalAlpha = 0.5;
    for (let x = 0; x < width; x += rib * 2) {
      ctx.fillStyle = colours.line;
      ctx.fillRect(x, 0, rib, height);
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (set === "brick") {
    // courses, every other one offset by half a brick
    const course = Math.max(4, Math.round(rowH / 9));
    const brick = course * 2.4;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = colours.grain[2];
    for (let y = 0, row = 0; y < height; y += course, row++) {
      ctx.fillRect(0, y, width, 1);
      for (let x = (row % 2) * (brick / 2); x < width; x += brick) ctx.fillRect(x, y, 1, course);
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (set === "tile") {
    const tile = Math.max(4, Math.round(bayW / 6));
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = colours.line;
    for (let x = 0; x < width; x += tile) ctx.fillRect(x, 0, 1, height);
    for (let y = 0; y < height; y += tile) ctx.fillRect(0, y, width, 1);
    ctx.globalAlpha = 1;
    return;
  }

  if (set === "curtain") {
    // a glass curtain wall: mullions at every bay, and nothing else
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = colours.parapet;
    for (let bay = 0; bay <= plan.bays; bay++) ctx.fillRect(bay * bayW - 1, 0, 3, height);
    ctx.globalAlpha = 1;
    return;
  }

  // panel: precast units, one joint per bay and one per storey
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = colours.line;
  for (let bay = 1; bay < plan.bays; bay++) ctx.fillRect(bay * bayW - 1, 0, 2, height);
  for (let row = 1; row < plan.rows; row++) ctx.fillRect(0, row * rowH - 1, width, 2);
  ctx.globalAlpha = 1;
}
