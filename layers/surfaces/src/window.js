// One window: a frame, the bars across it, and what is behind the glass.
//
// A window is its own thing now, not a rectangle painted into a wall, so this tile is small and is
// worn by one window at a time. Lit or unlit, blind up or down, each is painted separately, which is
// what keeps a wall of them from reading as a grid.

import { PALETTE } from "./palette.js";

const BARS = { cols: 2, rows: 3 };

export function planWindow({ lit, colour, blind }) {
  return { width: 128, height: 128, lit: Boolean(lit), colour: colour ?? PALETTE.windows[0], blind: Boolean(blind) };
}

/** What it looks like by day: a painted frame, dark glass, and a blind where one is down. */
export function paintWindowAlbedo(ctx, plan) {
  const p = PALETTE.facade;
  const { width, height } = plan;
  const edge = Math.round(width * 0.09);

  ctx.fillStyle = p.frame;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = plan.blind ? PALETTE.blind : p.glass;
  ctx.fillRect(edge, edge, width - edge * 2, height - edge * 2);

  if (!plan.blind) bars(ctx, plan, edge, p.frame);

  // the sill, along the bottom, catching whatever light there is
  ctx.fillStyle = p.ledge;
  ctx.fillRect(0, height - Math.round(edge * 0.8), width, Math.round(edge * 0.8));
}

/** What of it burns: the glass, when the light behind it is on. A blind lets less of it through. */
export function paintWindowEmissive(ctx, plan) {
  const { width, height } = plan;
  ctx.fillStyle = PALETTE.off;
  ctx.fillRect(0, 0, width, height);
  if (!plan.lit) return;

  const edge = Math.round(width * 0.09);
  ctx.globalAlpha = plan.blind ? 0.45 : 1;
  ctx.fillStyle = plan.colour;
  ctx.fillRect(edge, edge, width - edge * 2, height - edge * 2);
  ctx.globalAlpha = 1;
  if (!plan.blind) bars(ctx, plan, edge, PALETTE.off);
}

function bars(ctx, plan, edge, colour) {
  const { width, height } = plan;
  const bar = Math.max(2, Math.round(width * 0.035));
  const inner = { w: width - edge * 2, h: height - edge * 2 };
  ctx.fillStyle = colour;
  for (let i = 1; i < BARS.cols; i++) {
    ctx.fillRect(edge + (inner.w * i) / BARS.cols - bar / 2, edge, bar, inner.h);
  }
  for (let i = 1; i < BARS.rows; i++) {
    ctx.fillRect(edge, edge + (inner.h * i) / BARS.rows - bar / 2, inner.w, bar);
  }
}
