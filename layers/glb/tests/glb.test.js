import { describe, it, expect } from "vitest";
import { measure } from "../src/index.js";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";

// A GLB, byte for byte: the 12 byte header, the JSON chunk padded with spaces, then the binary
// chunk padded with zeros. Building them here (rather than checking one in) keeps the test honest
// about the container itself, which is half of what this layer does.
function glb(doc, { binBytes = 0, magic = 0x46546c67, version = 2 } = {}) {
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const jsonPad = (4 - (json.length % 4)) % 4;
  const binPad = (4 - (binBytes % 4)) % 4;
  const total = 12 + 8 + json.length + jsonPad + (binBytes ? 8 + binBytes + binPad : 0);

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, magic, true);
  view.setUint32(4, version, true);
  view.setUint32(8, total, true);
  view.setUint32(12, json.length + jsonPad, true);
  view.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(json, 20);
  out.fill(0x20, 20 + json.length, 20 + json.length + jsonPad);
  if (binBytes) {
    const at = 20 + json.length + jsonPad;
    view.setUint32(at, binBytes + binPad, true);
    view.setUint32(at + 4, 0x004e4942, true); // BIN
  }
  return out;
}

// One mesh, one primitive, the box glTF requires on every POSITION accessor.
function boxDoc({ min, max, nodes, materials = 1, indices = 36 }) {
  return {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    accessors: [
      { type: "VEC3", componentType: 5126, count: 8, min, max },
      { type: "SCALAR", componentType: 5123, count: indices },
    ],
    materials: Array.from({ length: materials }, (_, i) => ({ name: `finish-${i}` })),
  };
}

describe("glb - what is inside a file", () => {
  it("measures a building to its true size in metres, and validates as GlbFacts", () => {
    // 18 x 40 x 14 m, centred on its footprint and standing on the ground: what the buildings
    // toolkit writes.
    const bytes = glb(boxDoc({ min: [-9, 0, -7], max: [9, 40, 7], nodes: [{ mesh: 0 }] }), { binBytes: 64 });

    const facts = measure(bytes);

    expect(facts.size).toEqual([18, 40, 14]);
    expect(facts.min).toEqual([-9, 0, -7]);
    expect(facts.anchor).toEqual([0, 0, 0]); // already where a city stands a building
    expect(facts.materials).toBe(1);
    expect(facts.triangles).toBe(12);
    expect(facts.bytes).toBe(bytes.byteLength);
    expect(validate(SCHEMA_ID.glb.facts, facts).ok).toBe(true);
  });

  it("reports the move that stands a file on the ground over its own footprint", () => {
    // Modelled in a corner, sunk under the ground: the anchor is what puts it right.
    const bytes = glb(boxDoc({ min: [0, -2, 0], max: [10, 30, 8], nodes: [{ mesh: 0 }] }));

    expect(measure(bytes).anchor).toEqual([-5, 2, -4]);
  });

  it("measures a node where its parents put it, turned as they turn it", () => {
    // A 4 x 2 slab, quarter turn about Y (so it reads 2 x 4), lifted 10 m by its parent.
    const half = Math.SQRT1_2;
    const bytes = glb(
      boxDoc({
        min: [-2, 0, -1],
        max: [2, 3, 1],
        nodes: [
          { children: [1], translation: [0, 10, 0] },
          { mesh: 0, rotation: [0, half, 0, half] },
        ],
      })
    );

    const facts = measure(bytes);

    expect(facts.size).toEqual([2, 3, 4]);
    expect(facts.min[1]).toBe(10);
    expect(facts.nodes).toBe(2);
  });

  it("refuses a file that is not a GLB (GLB_INVALID)", () => {
    const notGlb = glb(boxDoc({ min: [0, 0, 0], max: [1, 1, 1], nodes: [{ mesh: 0 }] }), { magic: 0x12345678 });

    expect(() => measure(notGlb)).toThrow(expect.objectContaining({ code: "GLB_INVALID" }));
  });

  it("refuses to guess at a file it cannot measure (GLB_UNMEASURABLE)", () => {
    const noBox = glb({
      asset: { version: "2.0" },
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ type: "VEC3", componentType: 5126, count: 8 }], // no min/max
    });

    expect(() => measure(noBox)).toThrow(expect.objectContaining({ code: "GLB_UNMEASURABLE" }));
  });
});
