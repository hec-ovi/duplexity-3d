// One window: a frame, the bars across it, and what is behind the glass.
//
// A window is its own thing, not a rectangle painted into a wall, so this tile is small and is worn
// by one window at a time. Lit or unlit, blind up or down, and in whichever style its building wears,
// each is painted separately, which is what keeps a wall of them from reading as a grid.

import { PALETTE } from "./palette.js";

// How each style of window is divided up, and how much of it is frame. A ribbon runs the width of a
// wall, so it carries many mullions and a thin one; a bay is one pane in a deep surround.
const STYLE = {
  square: { cols: 2, rows: 3, edge: 0.09 },
  tall: { cols: 1, rows: 4, edge: 0.08 },
  bay: { cols: 3, rows: 2, edge: 0.13 },
  grid: { cols: 2, rows: 2, edge: 0.05 }, // a curtain wall: almost all glass
  ribbon: { cols: 9, rows: 1, edge: 0.06 },
};

export function planWindow({ lit, colour, blind, style }) {
  const shape = STYLE[style] ?? STYLE.square;
  return {
    width: 128,
    height: 128,
    style: style ?? "square",
    bars: shape,
    edge: shape.edge,
    lit: Boolean(lit),
    colour: colour ?? PALETTE.windows[0],
    blind: Boolean(blind),
  };
}

/** What it looks like by day: a painted frame, dark glass, and a blind where one is down. */
export function paintWindowAlbedo(ctx, plan) {
  const p = PALETTE.facade;
  const { width, height } = plan;
  const edge = Math.round(width * plan.edge);

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

  const edge = Math.round(width * plan.edge);
  ctx.globalAlpha = plan.blind ? 0.45 : 1;
  ctx.fillStyle = plan.colour;
  ctx.fillRect(edge, edge, width - edge * 2, height - edge * 2);
  ctx.globalAlpha = 1;
  if (!plan.blind) bars(ctx, plan, edge, PALETTE.off);
}

function bars(ctx, plan, edge, colour) {
  const { width, height, bars: grid } = plan;
  const bar = Math.max(2, Math.round(width * (plan.style === "ribbon" ? 0.02 : 0.035)));
  const inner = { w: width - edge * 2, h: height - edge * 2 };
  ctx.fillStyle = colour;
  for (let i = 1; i < grid.cols; i++) {
    ctx.fillRect(edge + (inner.w * i) / grid.cols - bar / 2, edge, bar, inner.h);
  }
  for (let i = 1; i < grid.rows; i++) {
    ctx.fillRect(edge, edge + (inner.h * i) / grid.rows - bar / 2, inner.w, bar);
  }
}
