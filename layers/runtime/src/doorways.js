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
  frame: 0x8c7f6a, // painted timber, light enough to read against a dark wall
  leaf: 0x6b5a45,
  glass: 0x2a3138,
  handle: 0xd8c08a,
  step: 0x5b6068,
};
const PORCH = { size: [0.5, 0.14, 0.34], colour: 0xffe6c0, glow: 1.6, lift: 0.24 };

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

const ROOM_SIGN = { colour: "#9fb4c2" };

/**
 * What the signs over this door say. A door that leaves the place says so (EXIT, UP, LIFT DOWN); a
 * door between two rooms says what is through it, one plate each side, so you can read a floor
 * without walking into every wall.
 *
 * @param {object} portal
 * @param {Map<string,string>} [names] roomId -> what that room is called
 * @returns {Array<{text:string, colour:string, side:1|-1}>}
 */
export function signOver(portal, rooms) {
  const leaving = OVER_DOOR[portal.roomB === "EXIT" ? "EXIT" : portal.link?.kind];
  if (leaving) return [{ ...leaving, side: 1 }];
  if (!rooms) return [];
  const a = rooms.get(portal.roomA);
  const b = rooms.get(portal.roomB);
  if (!a || !b) return [];
  // You read the name of the room you are walking INTO, from the room you are standing in. So the
  // plate naming B hangs on A's side of the wall, and the other way round.
  const towards = (room) =>
    Math.sign(
      (portal.axis === "x" ? room.center.x - portal.center.x : room.center.z - portal.center.z) || 1
    );
  return [
    { text: b.name.toUpperCase(), colour: ROOM_SIGN.colour, side: towards(a) },
    { text: a.name.toUpperCase(), colour: ROOM_SIGN.colour, side: towards(b) },
  ];
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
export function buildDoorway(portal, block, groundY = 0, { signMaterial, names } = {}) {
  const [width, height] = portal.size;
  const { axis } = portal;
  const out = outward(portal, block);
  const solid = Boolean(block); // a door on a building has a leaf; a cut doorway is a hole
  const PLATE_TEXT = 0.19; // metres of plate per letter

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

  // The signs over it, lit, so a way out and a way on are things you can see across a room.
  for (const says of signOver(portal, names)) {
    // Never wider than the door it hangs over: a room name is a plate, not a billboard.
    const plateWidth = Math.min(width + FRAME.margin * 2, Math.max(0.8, says.text.length * 0.19));
    const part = {
      kind: "sign",
      orientation: "flat",
      size: [plateWidth, PLATE.height, PLATE.depth],
      text: says.text,
      colour: says.colour,
    };
    // Modelled with its face on +z and then turned, so the lettering ends up pointing out of the wall.
    const facing = solid ? out * says.side : says.side;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(plateWidth, PLATE.height, PLATE.depth),
      signMaterial?.(part) ?? [glowing(says.colour)]
    );
    plate.rotation.y = axis === "x" ? facing * (Math.PI / 2) : facing > 0 ? 0 : Math.PI;
    place(plate, portal, facing, FRAME.proud + PLATE.depth, groundY + height + FRAME.margin + PLATE.lift);
    plate.name = `doorway:${portal.id}:sign${says.side > 0 ? "" : ":back"}`;
    group.add(plate);
  }

  if (!solid) return group;

  const leaf = new THREE.Mesh(slab(width, height, LEAF.thickness, axis), matte(COLOURS.leaf, { roughness: 0.5 }));
  place(leaf, portal, out, -LEAF.recess, groundY + height / 2);
  leaf.name = `doorway:${portal.id}:leaf`;
  group.add(leaf);

  // A glazed panel in the top half, lit from inside: what tells you at a glance that this is a door
  // into somewhere rather than a dark patch on a wall.
  const pane = new THREE.Mesh(
    slab(width * 0.62, height * 0.42, 0.04, axis),
    new THREE.MeshStandardMaterial({
      color: COLOURS.glass,
      emissive: new THREE.Color(0xffe0b0),
      emissiveIntensity: 1.15,
      roughness: 0.25,
      metalness: 0.1,
    })
  );
  place(pane, portal, out, -LEAF.recess + LEAF.thickness * 0.6, groundY + height * 0.66);
  pane.userData = { kind: "light" }; // it is a source, so it neither casts nor takes a shadow
  group.add(pane);

  // A porch lamp over it. A door on an unlit wall is a dark patch; a door with a light over it is a
  // door from the other side of the street.
  const porch = new THREE.Mesh(
    new THREE.BoxGeometry(...(axis === "x" ? [PORCH.size[2], PORCH.size[1], PORCH.size[0]] : PORCH.size)),
    new THREE.MeshStandardMaterial({
      color: 0x14171c,
      emissive: new THREE.Color(PORCH.colour),
      emissiveIntensity: PORCH.glow,
      roughness: 0.5,
    })
  );
  place(porch, portal, out, FRAME.proud + PORCH.size[2] / 2, groundY + height + FRAME.margin + PORCH.lift);
  porch.userData = { kind: "light" };
  porch.name = `doorway:${portal.id}:porch`;
  group.add(porch);

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
