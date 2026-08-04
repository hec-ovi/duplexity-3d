// Everything you stand on or brush past: roadway, pavement, square, plain concrete.
//
// Each is painted so its edges tile: a mark that runs off one side is not drawn back on the other,
// it simply stops short of the border. Enough grain to break up a large flat area, nothing more.

import { PALETTE } from "./palette.js";

const GRAIN = 900; // speckles per tile: coarse enough to read as material, cheap enough to paint

function speckle(ctx, rng, colours, size, count, alpha) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rng.pick(colours);
    const w = rng.range(1, 3);
    ctx.fillRect(rng.range(0, size - w), rng.range(0, size - w), w, w);
  }
  ctx.globalAlpha = 1;
}

/** Asphalt: aggregate, a few repair patches, and the tar seams between them. */
export function paintRoad(ctx, rng, size) {
  const p = PALETTE.road;
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, size, size);

  // patches laid at some point and never quite matching
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = p.patch;
    const w = rng.range(size * 0.15, size * 0.4);
    const h = rng.range(size * 0.12, size * 0.35);
    ctx.fillRect(rng.range(0, size - w), rng.range(0, size - h), w, h);
  }
  ctx.globalAlpha = 1;

  speckle(ctx, rng, p.grain, size, GRAIN, 0.55);

  // seams: straight, off-centre, never touching an edge so the tile still joins
  ctx.strokeStyle = p.seam;
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    const y = rng.range(size * 0.2, size * 0.8);
    ctx.beginPath();
    ctx.moveTo(size * 0.08, y);
    ctx.lineTo(size * 0.92, y + rng.range(-3, 3));
    ctx.stroke();
  }
}

/** Slabs: a grid of paving stones, each a slightly different tone, with a worn joint between. */
export function paintSlabs(ctx, rng, size, kind) {
  const p = PALETTE[kind];
  const cells = 4;
  const cell = size / cells;

  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.6;
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      ctx.fillStyle = rng.pick(p.grain);
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = p.joint;
  ctx.lineWidth = 2;
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }

  speckle(ctx, rng, p.grain, size, GRAIN / 2, 0.35);

  // damp patches, so a large pavement is not one flat grey
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = p.stain;
    const w = rng.range(cell * 0.5, cell * 1.6);
    ctx.fillRect(rng.range(0, size - w), rng.range(0, size - w), w, w);
  }
  ctx.globalAlpha = 1;
}

/** Poured concrete: no joints, just tone and dirt. Indoors this is the floor and the wall. */
export function paintConcrete(ctx, rng, size) {
  const p = PALETTE.concrete;
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = p.stain;
    const w = rng.range(size * 0.1, size * 0.45);
    const h = rng.range(size * 0.1, size * 0.45);
    ctx.fillRect(rng.range(0, size - w), rng.range(0, size - h), w, h);
  }
  ctx.globalAlpha = 1;

  speckle(ctx, rng, p.grain, size, GRAIN, 0.4);
}
