// runtime - troika-three-text factory (browser only).
//
// The real text renderer behind npc-actor.js's injectable `createText`: SDF glyph geometry for name
// labels and speech bubbles that stays crisp at any distance. It is imported ONLY by the browser
// composition root (app/main.js) and injected into createApp, so the head-less test path (which uses
// npc-actor's stub) never pulls in troika's web worker or a GL context.
//
// troika-three-text 0.52.x: `new Text()` is a THREE.Object3D; set .text/.fontSize/.color/.anchor*,
// then call .sync() (glyph layout happens async in a worker). See 04-TECH-STACK.md.

import { Text } from "troika-three-text";

export function createTroikaText(opts = {}) {
  const t = new Text();
  t.text = opts.text ?? "";
  t.fontSize = opts.fontSize ?? 0.2;
  t.color = opts.color ?? 0xffffff;
  t.anchorX = opts.anchorX ?? "center";
  t.anchorY = opts.anchorY ?? "bottom";
  t.maxWidth = opts.maxWidth ?? 4;
  t.textAlign = "center";
  if (opts.outline) {
    t.outlineWidth = "7%";
    t.outlineColor = 0x000000;
  }
  // Draw labels on top of scene geometry so they are never occluded by a wall between NPC and camera.
  t.material.depthTest = false;
  t.material.transparent = true;
  t.renderOrder = 10;
  t.sync();
  return t;
}
