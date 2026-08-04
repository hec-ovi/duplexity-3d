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
export function buildFacadeParts(parts, at, { signMaterial } = {}) {
  const group = new THREE.Group();
  group.name = "facade-parts";
  const slabMat = matte(COLOURS.slab);
  const railMat = matte(COLOURS.rail, { roughness: 0.5, metalness: 0.4 });

  for (const part of parts ?? []) {
    const piece =
      part.kind === "balcony"
        ? balcony(part, slabMat, railMat)
        : part.kind === "sign"
          ? board(part, signMaterial)
          : new THREE.Mesh(new THREE.BoxGeometry(...part.size), matte(new THREE.Color(part.colour ?? "#4c5b6b")));

    piece.position.set(at.x + part.position[0], at.y + part.position[1], at.z + part.position[2]);
    piece.rotation.y = part.facing;
    piece.name = `${part.kind}:${part.text ?? ""}`;
    piece.userData = { kind: part.kind };
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
