// cityscape - the solids a building is stacked from.
//
// A box cannot lean. Everything in the reference city batters inward as it rises, or flares out into
// a crown, and a stack of plain boxes is exactly what reads as "made of boxes" however well it is
// textured. So a tier is a TAPERED box: same six faces and same six material groups as a
// `BoxGeometry`, so a facade material array still lands on it, but the top may be a different size
// from the bottom.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export { mergeGeometries };

// The six faces in three.js's own order, so material[0] is +x and material[4] is +z exactly as a
// BoxGeometry would give. Each is [corner indices, normal], corners wound anticlockwise seen from
// outside. 0-3 are the bottom, 4-7 the top, both starting at -x -z and going round.
const FACES = [
  [[1, 2, 6, 5], [1, 0, 0]], // +x
  [[3, 0, 4, 7], [-1, 0, 0]], // -x
  [[4, 5, 6, 7], [0, 1, 0]], // +y
  [[3, 2, 1, 0], [0, -1, 0]], // -y
  [[2, 3, 7, 6], [0, 0, 1]], // +z
  [[0, 1, 5, 4], [0, 0, -1]], // -z
];

/**
 * A box whose top may be a different size from its bottom.
 *
 * @param {number} w  width at the bottom
 * @param {number} h
 * @param {number} d  depth at the bottom
 * @param {number} [taperX]  the top's width as a share of the bottom's. 1 is a box, 0.7 batters in,
 *   1.2 flares out into a crown.
 * @param {number} [taperZ]  the same for depth. Defaults to taperX.
 * @returns {THREE.BufferGeometry}
 */
export function taperedBox(w, h, d, taperX = 1, taperZ = taperX) {
  if (taperX === 1 && taperZ === 1) return new THREE.BoxGeometry(w, h, d);

  const hw = w / 2;
  const hd = d / 2;
  const tw = (w * taperX) / 2;
  const td = (d * taperZ) / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const corner = [
    [-hw, y0, -hd], [hw, y0, -hd], [hw, y0, hd], [-hw, y0, hd],
    [-tw, y1, -td], [tw, y1, -td], [tw, y1, td], [-tw, y1, td],
  ];

  const position = [];
  const normal = [];
  const uv = [];
  const index = [];
  const geometry = new THREE.BufferGeometry();

  FACES.forEach(([quad, n], face) => {
    const base = face * 4;
    for (const c of quad) {
      position.push(...corner[c]);
      normal.push(...n);
    }
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    geometry.addGroup(face * 6, 6, face);
  });

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals(); // the sloped sides need their own, not the box's
  return geometry;
}

/**
 * Bake a texture repeat into a geometry's own UVs, so many pieces at many scales can share ONE
 * material. A repeat lives on the texture, and a texture is shared; a UV lives on the mesh.
 */
export function scaleUv(geometry, x, y) {
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * x, uv.getY(i) * y);
  uv.needsUpdate = true;
  return geometry;
}
