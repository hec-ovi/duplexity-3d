// One building's outside, painted as a single sheet: a window per storey per bay, a ledge under each
// storey, a shopfront along the ground and a parapet across the top.
//
// The sheet is planned first and painted twice, so the lit windows in the emissive map are exactly
// the windows in the albedo map and can never drift apart.

import { PALETTE } from "./palette.js";

const BAY = 3; // metres of frontage per window bay
const CELL = 72; // pixels per bay, before the sheet is capped
const MAX = 1024;
const MIN_BAYS = 2;
const MAX_BAYS = 14;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Work out where every window, ledge and band goes.
 * @param {object} opts { metresWide, floors, storeyHeight, litRatio, program }
 * @param {object} rng
 */
export function planFacade({ metresWide, floors, storeyHeight, litRatio, program }, rng) {
  const bays = clamp(Math.round(metresWide / BAY), MIN_BAYS, MAX_BAYS);
  const rows = Math.max(1, floors);
  const width = Math.min(MAX, bays * CELL);
  const height = Math.min(MAX, rows * CELL);
  const bayW = width / bays;
  const rowH = height / rows;

  // A shop has its whole ground floor glazed; a house keeps a door and a window like any other storey.
  const shopfront = program !== "house" && rows >= 1;
  const windows = [];
  for (let row = 0; row < rows; row++) {
    const storey = rows - row; // 1 is the ground floor, painted at the bottom of the sheet
    if (storey === 1 && shopfront) continue;
    for (let bay = 0; bay < bays; bay++) {
      const w = bayW * 0.4;
      const h = rowH * 0.34;
      windows.push({
        x: bay * bayW + (bayW - w) / 2,
        y: row * rowH + rowH * 0.3,
        w,
        h,
        storey,
        lit: rng.chance(litRatio),
        colour: rng.pick(PALETTE.windows),
      });
    }
  }

  // A sign is fixed to part of the fascia, not painted across the whole of it.
  const signW = width * rng.range(0.3, 0.66);
  const sign = {
    lit: shopfront && rng.chance(0.72),
    colour: rng.pick(PALETTE.signs),
    x: rng.range(width * 0.05, width * 0.95 - signW),
    w: signW,
  };

  return {
    bays,
    rows,
    width,
    height,
    bayW,
    rowH,
    shopfront,
    sign,
    windows,
    metres: [bays * BAY, rows * storeyHeight],
  };
}

/** The daylight colour of the building: concrete, ledges, frames, the dark glass in them. */
export function paintFacadeAlbedo(ctx, plan, rng) {
  const p = PALETTE.facade;
  const { width, height, bayW, rowH, rows } = plan;

  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, width, height);

  // vertical bays, each cast a little differently
  ctx.globalAlpha = 0.5;
  for (let bay = 0; bay < plan.bays; bay++) {
    ctx.fillStyle = rng.pick(p.grain);
    ctx.fillRect(bay * bayW, 0, bayW, height);
  }
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = rng.pick(p.grain);
    ctx.fillRect(rng.range(0, width - 2), rng.range(0, height - 2), 2, 2);
  }
  ctx.globalAlpha = 1;

  // a ledge under every storey, so the building reads in layers from across the street
  ctx.fillStyle = p.ledge;
  for (let row = 1; row < rows; row++) ctx.fillRect(0, row * rowH - 3, width, 4);

  // A frame deep enough to read as a hole punched in the wall rather than a sticker on it.
  const frame = Math.max(3, bayW * 0.06);
  for (const win of plan.windows) {
    ctx.fillStyle = p.frame;
    ctx.fillRect(win.x - frame, win.y - frame, win.w + frame * 2, win.h + frame * 2);
    ctx.fillStyle = p.glass;
    ctx.fillRect(win.x, win.y, win.w, win.h);
  }

  if (plan.shopfront) {
    const top = height - rowH;
    ctx.fillStyle = p.shopfront;
    ctx.fillRect(0, top, width, rowH);
    ctx.fillStyle = p.fascia; // the band a sign is fixed to
    ctx.fillRect(0, top, width, rowH * 0.22);
    ctx.fillStyle = p.glass;
    for (let bay = 0; bay < plan.bays; bay++) {
      ctx.fillRect(bay * bayW + bayW * 0.1, top + rowH * 0.34, bayW * 0.8, rowH * 0.52);
    }
  }

  // parapet: the wall carries past the top floor
  ctx.fillStyle = p.parapet;
  ctx.fillRect(0, 0, width, Math.max(4, rowH * 0.1));
}

/** What of it glows: the lit windows, and the shop sign over the door. */
export function paintFacadeEmissive(ctx, plan) {
  const { width, height, bayW, rowH } = plan;
  ctx.fillStyle = PALETTE.off;
  ctx.fillRect(0, 0, width, height);

  for (const win of plan.windows) {
    if (!win.lit) continue;
    ctx.fillStyle = win.colour;
    ctx.fillRect(win.x, win.y, win.w, win.h);
  }

  if (plan.sign.lit) {
    const top = height - rowH;
    ctx.fillStyle = plan.sign.colour;
    ctx.fillRect(plan.sign.x, top + rowH * 0.05, plan.sign.w, rowH * 0.12);
    // light spilling out of the shop itself: a whole pane of it, so it stays well under the sign
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = PALETTE.spill;
    for (let bay = 0; bay < plan.bays; bay++) {
      ctx.fillRect(bay * bayW + bayW * 0.1, top + rowH * 0.34, bayW * 0.8, rowH * 0.52);
    }
    ctx.globalAlpha = 1;
  }
}
