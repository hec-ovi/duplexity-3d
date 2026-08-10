// glb - what is inside a GLB file, without opening a renderer. Leaf layer; imports no other layer's
// src, and no three.js: it reads the document, not the geometry.

import { readContainer } from "./container.js";
import { measureDocument } from "./bounds.js";

export { GlbInvalidError, GlbUnmeasurableError } from "./errors.js";

/** Millimetre precision, so the same file always measures to the same numbers. */
const round = (n) => Math.round(n * 1000) / 1000 + 0;

/**
 * Measure a GLB.
 *
 * `anchor` is the move that puts the piece where a city expects it: centred over its own footprint
 * with its base on the ground. A file already written that way anchors at `[0, 0, 0]`.
 *
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {{ size: number[], min: number[], max: number[], anchor: number[], nodes: number, meshes: number, materials: number, triangles: number, bytes: number }}
 */
export function measure(bytes) {
  const { json, bytes: byteLength } = readContainer(bytes);
  const facts = measureDocument(json);

  return {
    size: facts.size.map(round),
    min: facts.min.map(round),
    max: facts.max.map(round),
    anchor: [
      round(-(facts.min[0] + facts.max[0]) / 2),
      round(-facts.min[1]),
      round(-(facts.min[2] + facts.max[2]) / 2),
    ],
    nodes: facts.nodes,
    meshes: facts.meshes,
    materials: facts.materials,
    triangles: facts.triangles,
    bytes: byteLength,
  };
}
