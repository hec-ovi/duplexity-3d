// runtime - build what is bolted to the buildings.
//
// The parts themselves are decided by another box and arrive as data in each building's own frame: a
// position, a size, and the way each one faces. This turns the WHOLE CITY'S worth of them into
// meshes in one pass, so anything that looks alike is drawn together however many buildings it is
// spread over. Instancing per building is what turned one street into three thousand draws.
//
// A part's size is read as [across the wall, up, out from the wall], so it is modelled facing +z and
// then turned.

import * as THREE from "three";

const PARAPET = 0.08; // a solid balcony front rather than a railing: three boxes, not forty
const COLOURS = { slab: 0x3a3f47, rail: 0x2a2e35 };

const matte = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1, ...extra });

// Something that burns: a neon line, a lit edge. Bright enough for the bloom pass to catch.
const burning = (colour, intensity) =>
  new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: new THREE.Color(colour ?? "#ff5f9e"),
    emissiveIntensity: intensity,
    roughness: 0.6,
  });

const round = (n) => Math.round(n * 100) / 100;

/**
 * @param {object[]} parts  every part of every building, each `position` already in world metres
 * @param {object} [deps]
 * @param {Function} [deps.signMaterial]   (part) -> Material[] for a lettered cartel
 * @param {Function} [deps.windowMaterial] (part) -> Material for one kind of window
 * @param {Function} [deps.advertMaterial] (part) -> Material[] for a holo advert
 * @returns {THREE.Group}
 */
export function buildFacadeParts(parts, { signMaterial, windowMaterial, advertMaterial } = {}) {
  const group = new THREE.Group();
  group.name = "facade-parts";

  const batches = new Map(); // one instanced mesh per look: same geometry, same material
  const batch = (key, size, material, part) => {
    if (!batches.has(key)) batches.set(key, { size, material, parts: [] });
    batches.get(key).parts.push(part);
  };

  const slabMat = matte(COLOURS.slab);
  const railMat = matte(COLOURS.rail, { roughness: 0.5, metalness: 0.4 });

  for (const part of parts ?? []) {
    const [w, h, d] = part.size;
    const shape = `${round(w)}x${round(h)}x${round(d)}`;

    if (part.kind === "window") {
      const look = `${part.lit ? part.colour : "dark"}:${part.blind ? "blind" : "open"}`;
      batch(`window:${look}:${shape}`, part.size, () => windowMaterial?.(part) ?? matte(0x2a3138), part);
      continue;
    }
    if (part.kind === "neon") {
      batch(`neon:${part.colour}:${shape}`, part.size, () => burning(part.colour, 1.6), part);
      continue;
    }
    if (part.kind === "balcony") {
      const rail = part.rail ?? 0.95;
      batch(`balcony:${shape}`, part.size, () => slabMat, part);
      batch(`balcony-front:${round(w)}:${round(rail)}`, [w, rail, PARAPET], () => railMat, {
        ...part,
        position: [part.position[0], part.position[1] + rail / 2, part.position[2]],
        offset: [0, 0, d / 2],
      });
      for (const side of [-1, 1]) {
        batch(`balcony-end:${round(rail)}:${round(d)}`, [PARAPET, rail, d], () => railMat, {
          ...part,
          position: [part.position[0], part.position[1] + rail / 2, part.position[2]],
          offset: [(side * w) / 2, 0, 0],
        });
      }
      continue;
    }
    if (part.kind === "awning") {
      batch(`awning:${part.colour}:${shape}`, part.size, () => matte(new THREE.Color(part.colour)), part);
      continue;
    }

    // A sign and an advert each say something of their own, so each gets its own material and mesh.
    const one = new THREE.Mesh(
      new THREE.BoxGeometry(...part.size),
      part.kind === "sign"
        ? (signMaterial?.(part) ?? burning(part.colour, 1.2))
        : (advertMaterial?.(part) ?? burning(part.colour, 1.2))
    );
    one.position.set(part.position[0], part.position[1], part.position[2]);
    one.rotation.y = part.facing;
    one.name = `${part.kind}:${part.text ?? ""}`;
    one.userData = { kind: "light" };
    group.add(one);
  }

  const dummy = new THREE.Object3D();
  for (const [key, { size, material, parts: batched }] of batches) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), material(), batched.length);
    mesh.name = key;
    // A window and a neon strip are sources, not shadow casters.
    mesh.userData = { kind: key.startsWith("window") || key.startsWith("neon") ? "light" : "part" };
    batched.forEach((part, i) => {
      const [ox, oy, oz] = part.offset ?? [0, 0, 0];
      const sin = Math.sin(part.facing);
      const cos = Math.cos(part.facing);
      dummy.rotation.set(0, part.facing, 0);
      dummy.position.set(
        part.position[0] + ox * cos + oz * sin,
        part.position[1] + oy,
        part.position[2] - ox * sin + oz * cos
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    // The bounds of an instanced mesh are the geometry's, at the origin, until they are worked out
    // from the instances. Left alone, a city's worth of them vanishes when the origin goes off screen.
    mesh.computeBoundingSphere?.();
    if (!mesh.boundingSphere) mesh.frustumCulled = false;
    group.add(mesh);
  }

  return group;
}
