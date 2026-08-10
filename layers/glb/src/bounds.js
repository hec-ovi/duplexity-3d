// Where a file actually stands, in metres. glTF requires every POSITION accessor to carry its own
// min and max, so the box a file occupies is arithmetic on the document: no geometry is read, and a
// forty floor tower measures as fast as a crate.

import { GlbUnmeasurableError } from "./errors.js";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major 4x4 multiply, the layout glTF stores matrices in. */
function multiply(a, b) {
  const out = new Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

/** A node's own transform: an explicit matrix, or translation * rotation * scale. */
function localMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix;

  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];

  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function applyPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** The eight corners of a box, so a rotated node still measures its true extent. */
function corners(min, max) {
  const out = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) out.push([x, y, z]);
    }
  }
  return out;
}

function trianglesOf(primitive, accessors) {
  const mode = primitive.mode ?? 4; // 4 is TRIANGLES; anything else is lines or points
  if (mode !== 4) return 0;
  const source = primitive.indices !== undefined ? primitive.indices : primitive.attributes?.POSITION;
  const count = accessors[source]?.count ?? 0;
  return Math.floor(count / 3);
}

/**
 * The box a document occupies, and what it costs to draw.
 *
 * @param {object} doc the glTF document out of the GLB
 * @returns {{ min: number[], max: number[], size: number[], nodes: number, meshes: number, materials: number, triangles: number }}
 */
export function measureDocument(doc) {
  const nodes = doc.nodes ?? [];
  const meshes = doc.meshes ?? [];
  const accessors = doc.accessors ?? [];
  const scene = doc.scenes?.[doc.scene ?? 0];
  const roots = scene?.nodes ?? nodes.map((_, i) => i);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let visited = 0;
  let drawn = 0;
  let triangles = 0;

  const walk = (index, parent) => {
    const node = nodes[index];
    if (!node) return;
    visited++;
    const world = multiply(parent, localMatrix(node));

    const mesh = node.mesh !== undefined ? meshes[node.mesh] : undefined;
    for (const primitive of mesh?.primitives ?? []) {
      const position = accessors[primitive.attributes?.POSITION];
      if (!position) continue;
      if (!Array.isArray(position.min) || !Array.isArray(position.max)) {
        throw new GlbUnmeasurableError("a POSITION accessor carries no min and max, which glTF requires");
      }
      drawn++;
      triangles += trianglesOf(primitive, accessors);
      for (const point of corners(position.min, position.max)) {
        const [x, y, z] = applyPoint(world, point);
        min[0] = Math.min(min[0], x);
        min[1] = Math.min(min[1], y);
        min[2] = Math.min(min[2], z);
        max[0] = Math.max(max[0], x);
        max[1] = Math.max(max[1], y);
        max[2] = Math.max(max[2], z);
      }
    }

    for (const child of node.children ?? []) walk(child, world);
  };

  for (const root of roots) walk(root, IDENTITY);

  if (drawn === 0) throw new GlbUnmeasurableError("nothing in the scene has geometry to measure");

  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    nodes: visited,
    meshes: drawn,
    materials: (doc.materials ?? []).length,
    triangles,
  };
}
