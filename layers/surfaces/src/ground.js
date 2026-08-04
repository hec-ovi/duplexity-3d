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

/**
 * Asphalt: aggregate, a few repair patches, and the tar seams between them. Wet, it goes darker and
 * keeps standing water in its low spots, which is what the lamps come back off.
 */
export function paintRoad(ctx, rng, size, wet = 0) {
  const p = PALETTE.road;
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, size, size);
  if (wet > 0) {
    ctx.globalAlpha = Math.min(0.8, wet);
    ctx.fillStyle = p.wet;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
  }

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

  // puddles: smoother and darker than what is round them, so they catch the lamps
  if (wet > 0) {
    ctx.globalAlpha = Math.min(0.65, 0.3 + wet * 0.4);
    ctx.fillStyle = p.puddle;
    for (let i = 0; i < Math.round(2 + wet * 4); i++) {
      const w = rng.range(size * 0.12, size * 0.34);
      const h = rng.range(size * 0.08, size * 0.2);
      ctx.fillRect(rng.range(0, size - w), rng.range(0, size - h), w, h);
    }
    ctx.globalAlpha = 1;
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

/**
 * What BURNS in a pavement: the joints between the slabs, and nothing else. Cold light coming out of
 * the ground under warm lamps is most of what a night city looks like.
 */
export function paintSlabGlow(ctx, size, kind) {
  const p = PALETTE[kind] ?? PALETTE.pavement;
  const cells = 4;
  const cell = size / cells;
  ctx.fillStyle = PALETTE.off;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = p.glow;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.55;
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
  ctx.globalAlpha = 1;
}

/** Poured concrete: no joints, just tone and dirt. Indoors this is the floor, the wall and the ceiling. */
export function paintConcrete(ctx, rng, size, kind = "concrete") {
  const p = PALETTE[kind] ?? PALETTE.concrete;
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
