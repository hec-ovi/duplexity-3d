// A distant tower's whole front, painted on one sheet.
//
// Up close a window is its own object. At a distance that is thousands of objects nobody can see, so
// a tower in the skyline wears ONE sheet with its windows painted into it: rows of lit and dark
// panes, the same trick a matte painting uses. One material, one draw, and from three hundred metres
// it reads exactly the same.

import { PALETTE } from "./palette.js";

const CELL = 24; // pixels per window on the sheet
const COLS = 10;
const ROWS = 16;

export function planTower({ litRatio }, rng) {
  const width = COLS * CELL;
  const height = ROWS * CELL;
  const panes = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      panes.push({
        x: col * CELL + CELL * 0.22,
        y: row * CELL + CELL * 0.24,
        w: CELL * 0.56,
        h: CELL * 0.52,
        lit: rng.chance(litRatio),
        colour: rng.pick(PALETTE.windows),
      });
    }
  }
  return { width, height, panes, storeys: ROWS };
}

export function paintTowerAlbedo(ctx, plan, rng) {
  const p = PALETTE.facade;
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, plan.width, plan.height);

  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rng.pick(p.grain);
    ctx.fillRect(rng.range(0, plan.width - 3), rng.range(0, plan.height - 3), 3, 3);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = p.glass;
  for (const pane of plan.panes) ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
}

export function paintTowerEmissive(ctx, plan) {
  ctx.fillStyle = PALETTE.off;
  ctx.fillRect(0, 0, plan.width, plan.height);
  for (const pane of plan.panes) {
    if (!pane.lit) continue;
    ctx.fillStyle = pane.colour;
    ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
  }
}
