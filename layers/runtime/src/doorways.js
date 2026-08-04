// runtime - a door you can see is a door.
//
// A doorway on a building's face is not cut out of anything: the mass is solid and what is inside is
// another instance. So the door has to be built, not carved. A surround standing proud of the wall,
// a leaf recessed into it, a handle, and a step you cross. An interior doorway IS cut, so it only
// needs the surround round the hole.

import * as THREE from "three";

const FRAME = { proud: 0.12, margin: 0.22, thickness: 0.16 };
const LEAF = { recess: 0.1, thickness: 0.08 };
const STEP = { rise: 0.1, tread: 0.55, margin: 0.3 };
const HANDLE = { size: 0.07, height: 1.05, inset: 0.28 };

const COLOURS = {
  frame: 0x30353d,
  leaf: 0x1d2126,
  handle: 0xb9a06a,
  step: 0x4a4f57,
};

const matte = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08, ...extra });

// Which way the door faces: away from the middle of the mass it is on. Sign only, never zero.
function outward(portal, block) {
  if (!block) return 1;
  const along = portal.axis === "x" ? portal.center.x - block.center.x : portal.center.z - block.center.z;
  return along >= 0 ? 1 : -1;
}

// A box laid on the wall plane: `across` runs along the face, `deep` through it.
function slab(across, height, deep, axis) {
  return axis === "x"
    ? new THREE.BoxGeometry(deep, height, across)
    : new THREE.BoxGeometry(across, height, deep);
}

function place(mesh, portal, out, offset, y) {
  const { x, z } = portal.center;
  mesh.position.set(portal.axis === "x" ? x + out * offset : x, y, portal.axis === "x" ? z : z + out * offset);
  return mesh;
}

/**
 * Build the door standing at a portal.
 *
 * @param {object} portal  scene-model portal (center, axis, size, blockId)
 * @param {object|null} block  the mass it is on, when it is on one
 * @param {number} groundY
 * @returns {THREE.Group}
 */
export function buildDoorway(portal, block, groundY = 0) {
  const [width, height] = portal.size;
  const { axis } = portal;
  const out = outward(portal, block);
  const solid = Boolean(block); // a door on a building has a leaf; a cut doorway is a hole

  const group = new THREE.Group();
  group.name = `doorway:${portal.id}`;
  group.userData = { kind: "doorway", portalId: portal.id };

  const frameMat = matte(COLOURS.frame);
  const jamb = width + FRAME.margin * 2;

  // The surround: two jambs and a head, so the opening keeps its hole.
  const headGeo = slab(jamb, FRAME.margin, FRAME.thickness, axis);
  group.add(place(new THREE.Mesh(headGeo, frameMat), portal, out, FRAME.proud, groundY + height + FRAME.margin / 2));
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(slab(FRAME.margin, height + FRAME.margin, FRAME.thickness, axis), frameMat);
    const shift = side * (width + FRAME.margin) / 2;
    place(post, portal, out, FRAME.proud, groundY + (height + FRAME.margin) / 2);
    if (axis === "x") post.position.z += shift;
    else post.position.x += shift;
    group.add(post);
  }

  if (!solid) return group;

  const leaf = new THREE.Mesh(slab(width, height, LEAF.thickness, axis), matte(COLOURS.leaf, { roughness: 0.5 }));
  place(leaf, portal, out, -LEAF.recess, groundY + height / 2);
  leaf.name = `doorway:${portal.id}:leaf`;
  group.add(leaf);

  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(HANDLE.size, HANDLE.size, HANDLE.size),
    matte(COLOURS.handle, { roughness: 0.3, metalness: 0.7 })
  );
  place(handle, portal, out, -LEAF.recess + LEAF.thickness, groundY + HANDLE.height);
  if (axis === "x") handle.position.z += width / 2 - HANDLE.inset;
  else handle.position.x += width / 2 - HANDLE.inset;
  group.add(handle);

  const step = new THREE.Mesh(
    slab(width + STEP.margin * 2, STEP.rise, STEP.tread, axis),
    matte(COLOURS.step, { roughness: 0.9 })
  );
  place(step, portal, out, STEP.tread / 2, groundY + STEP.rise / 2);
  group.add(step);

  return group;
}
