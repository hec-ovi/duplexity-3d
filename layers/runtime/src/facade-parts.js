// runtime - build what is bolted to a building.
//
// The parts themselves are decided by another box and arrive as data in the building's own frame: a
// position, a size, and the way each one faces. This turns them into meshes, standing them at the
// building's position and turned the way they said.
//
// A part's size is read as [across the wall, up, out from the wall], so it is modelled facing +z and
// then turned.

import * as THREE from "three";

const PARAPET = 0.08; // a solid balcony front rather than a railing: four boxes, not forty

const COLOURS = { slab: 0x3a3f47, rail: 0x2a2e35 };

const matte = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1, ...extra });

/**
 * @param {object[]} parts   from facade.dressFacade
 * @param {{x:number,y:number,z:number}} at  where the building stands (its footprint centre, on the ground)
 * @param {object} [deps]
 * @param {Function} [deps.signMaterial]  (part) -> Material for a lettered cartel; absent, a plain board
 * @returns {THREE.Group}
 */
export function buildFacadeParts(parts, at, { signMaterial, windowMaterial, advertMaterial } = {}) {
  const group = new THREE.Group();
  group.name = "facade-parts";
  const slabMat = matte(COLOURS.slab);
  const railMat = matte(COLOURS.rail, { roughness: 0.5, metalness: 0.4 });

  // Windows are their own objects, and there are hundreds of them, so the ones that look alike are
  // drawn together: one instanced mesh per kind of window, not one mesh each.
  const windows = (parts ?? []).filter((p) => p.kind === "window");
  if (windows.length && windowMaterial) group.add(...buildWindows(windows, at, windowMaterial));

  for (const part of parts ?? []) {
    if (part.kind === "window") continue;
    const piece =
      part.kind === "balcony"
        ? balcony(part, slabMat, railMat)
        : part.kind === "sign"
          ? board(part, signMaterial)
          : part.kind === "advert"
            ? holo(part, advertMaterial)
            : part.kind === "neon"
              ? new THREE.Mesh(new THREE.BoxGeometry(...part.size), burning(part.colour, 1.6))
              : new THREE.Mesh(new THREE.BoxGeometry(...part.size), matte(new THREE.Color(part.colour ?? "#4c5b6b")));

    piece.position.set(at.x + part.position[0], at.y + part.position[1], at.z + part.position[2]);
    piece.rotation.y = part.facing;
    piece.name = `${part.kind}:${part.text ?? ""}`;
    // What burns is a source, not a shadow caster: a neon strip casting its own shadow looks wrong.
    piece.userData = { kind: part.kind === "advert" || part.kind === "neon" ? "light" : part.kind };
    group.add(piece);
  }
  return group;
}

// A slab standing out of the wall, with a solid parapet round its three open sides.
function balcony(part, slabMat, railMat) {
  const [width, thickness, depth] = part.size;
  const height = part.rail ?? 0.95;
  const out = new THREE.Group();

  out.add(new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth), slabMat));

  const front = new THREE.Mesh(new THREE.BoxGeometry(width, height, PARAPET), railMat);
  front.position.set(0, height / 2, depth / 2);
  out.add(front);
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(PARAPET, height, depth), railMat);
    end.position.set((side * width) / 2, height / 2, 0);
    out.add(end);
  }
  return out;
}

// Every window of one kind, in one draw. Each still stands in its own hole with its own light on or
// off; what they share is the material, which is what makes hundreds of them affordable.
function buildWindows(windows, at, windowMaterial) {
  const byKind = new Map();
  for (const win of windows) {
    const key = `${win.lit ? win.colour : "dark"}:${win.blind ? "blind" : "open"}:${win.size.join()}`;
    if (!byKind.has(key)) byKind.set(key, []);
    byKind.get(key).push(win);
  }

  const meshes = [];
  const dummy = new THREE.Object3D();
  for (const [key, group] of byKind) {
    const [width, height, depth] = group[0].size;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.InstancedMesh(geometry, windowMaterial(group[0]), group.length);
    mesh.name = `windows:${key}`;
    mesh.userData = { kind: "light" }; // a window is a source, not a shadow caster
    group.forEach((win, i) => {
      dummy.position.set(at.x + win.position[0], at.y + win.position[1], at.z + win.position[2]);
      dummy.rotation.set(0, win.facing, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    // The bounds of an instanced mesh are the geometry's, at the origin, until they are worked out
    // from the instances. Left alone, a whole building's windows vanish the moment the origin is off
    // screen.
    mesh.computeBoundingSphere?.();
    if (!mesh.boundingSphere) mesh.frustumCulled = false;
    meshes.push(mesh);
  }
  return meshes;
}

// Something that burns: a neon line, a lit edge. Bright enough for the bloom pass to catch.
const burning = (colour, intensity) =>
  new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: new THREE.Color(colour ?? "#ff5f9e"),
    emissiveIntensity: intensity,
    roughness: 0.6,
  });

// A holo advert: one lit face on a thin box, bolted flat to the wall.
function holo(part, advertMaterial) {
  const faces = advertMaterial?.(part);
  return new THREE.Mesh(
    new THREE.BoxGeometry(...part.size),
    faces ?? burning(part.colour, 1.6)
  );
}

// A board with the name on it. The lettering is a texture, so the sign is one quad on a box.
function board(part, signMaterial) {
  const [width, height, depth] = part.size;
  const plain = matte(new THREE.Color(part.colour ?? "#ddc87e"), {
    emissive: new THREE.Color(part.colour ?? "#ddc87e"),
    emissiveIntensity: 1.2,
  });
  const faces = signMaterial?.(part);
  const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), faces ?? plain);
  return box;
}
