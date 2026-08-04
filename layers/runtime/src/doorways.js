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

// What a door says over it, so a way out is something you can see across a room rather than
// something you have to walk into every wall to find.
const OVER_DOOR = {
  EXIT: { text: "EXIT", colour: "#7ce6a0" },
  leave: { text: "EXIT", colour: "#7ce6a0" },
  enter: { text: "IN", colour: "#9fd0ff" },
  stairs_up: { text: "UP", colour: "#ffd9a8" },
  stairs_down: { text: "DOWN", colour: "#ffd9a8" },
  elevator_up: { text: "LIFT UP", colour: "#ffd9a8" },
  elevator_down: { text: "LIFT DOWN", colour: "#ffd9a8" },
};
const PLATE = { height: 0.34, depth: 0.08, lift: 0.3 };

/** What the sign over this door should say, if anything. */
export function signOver(portal) {
  return OVER_DOOR[portal.roomB === "EXIT" ? "EXIT" : portal.link?.kind] ?? null;
}

const matte = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08, ...extra });

// A lit plate, for when there is no painter to letter it: still visible, just wordless.
const glowing = (colour) =>
  new THREE.MeshStandardMaterial({
    color: 0x14171c,
    emissive: new THREE.Color(colour),
    emissiveIntensity: 1.1,
    roughness: 0.6,
  });

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
 * @param {object} [deps]
 * @param {Function} [deps.signMaterial] (part) -> Material[] for the lettered plate over the door
 * @returns {THREE.Group}
 */
export function buildDoorway(portal, block, groundY = 0, { signMaterial } = {}) {
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

  // The sign over it, lit, so a way out is something you can see across a room.
  const says = signOver(portal);
  if (says) {
    const plateWidth = Math.max(0.9, says.text.length * 0.3);
    const part = {
      kind: "sign",
      orientation: "flat",
      size: [plateWidth, PLATE.height, PLATE.depth],
      text: says.text,
      colour: says.colour,
    };
    // Modelled with its face on +z and then turned, so the lettering ends up pointing out of the wall.
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(plateWidth, PLATE.height, PLATE.depth),
      signMaterial?.(part) ?? [glowing(says.colour)]
    );
    plate.rotation.y = axis === "x" ? out * (Math.PI / 2) : out > 0 ? 0 : Math.PI;
    place(plate, portal, out, FRAME.proud + PLATE.depth, groundY + height + FRAME.margin + PLATE.lift);
    plate.name = `doorway:${portal.id}:sign`;
    group.add(plate);
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
