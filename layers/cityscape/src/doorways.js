// runtime - a door you can see is a door.
//
// A doorway on a building's face is not cut out of anything: the mass is solid and what is inside is
// another instance. So the door has to be built, not carved. A surround standing proud of the wall,
// a leaf recessed into it, a handle, and a step you cross. An interior doorway IS cut, so it only
// needs the surround round the hole.

import * as THREE from "three";

const FRAME = { proud: 0.16, margin: 0.22, thickness: 0.22 }; // stands further out than the leaf it holds
// A door on a building's face has NO hole behind it: the mass is solid and what is inside is another
// instance. So the leaf hangs on the face, not in it. Recessed, the wall simply swallows it and all
// you see is a frame with a dark wall inside.
const LEAF = { stand: 0.03, thickness: 0.09 };
const STEP = { rise: 0.1, tread: 0.55, margin: 0.3 };
const HANDLE = { size: 0.07, height: 1.05, inset: 0.28 };

const MULLION = { width: 0.1 }; // between two leaves, or between the bays of a shopfront
const RISER = { height: 0.42 }; // the solid strip under a shop window
const REVEAL = { depth: 0.42, thickness: 0.16 }; // the niche a recessed door stands in
const SHUTTER = { box: 0.34, guide: 0.1, depth: 0.3, margin: 0.12 };

const COLOURS = {
  frame: 0x8c7f6a, // painted timber, light enough to read against a dark wall
  leaf: 0x6b5a45,
  glass: 0x2a3138,
  panel: 0x53442f,
  handle: 0xd8c08a,
  step: 0x5b6068,
  shutter: 0x5a5f66,
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
 * @param {Map<string,string>} [rooms] roomId -> what that room is called
 * @returns {Array<{text:string, colour:string, side:1|-1}>}
 */
function signOver(portal, rooms) {
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

// Every door in a city is painted from the same short list, so the materials are made once and
// shared. One per door was sixty-odd pipeline switches a frame for the doors alone.
const made = new Map();
const matte = (color, extra = {}) => {
  const key = `${color}:${JSON.stringify(extra)}`;
  if (!made.has(key)) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08, ...extra });
    material.userData.shared = true; // outlives any one scene, so nothing may dispose it
    made.set(key, material);
  }
  return made.get(key);
};

// A lit plate, for when there is no painter to letter it: still visible, just wordless.
const glowing = (colour) =>
  matte(0x14171c, { emissive: new THREE.Color(colour), emissiveIntensity: 1.1, roughness: 0.6 });

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
 * @param {Map} [deps.names] roomId -> what that room is called, for the plates between rooms
 * @param {string} [deps.style] which kind of door the facade asked for: shopfront, flush, recessed,
 *   double or shutter. Anything unknown is a flush door.
 * @returns {THREE.Group}
 */
export function buildDoorway(portal, block, groundY = 0, { signMaterial, names, style = "flush" } = {}) {
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

  // Everything from here on hangs off the wall in the door's own terms: `along` runs across the face,
  // `deep` out of it, `y` up from the pavement.
  const put = (mesh, { along = 0, deep, y }) => {
    place(mesh, portal, out, deep, groundY + y);
    if (axis === "x") mesh.position.z += out * along;
    else mesh.position.x += along;
    group.add(mesh);
    return mesh;
  };
  const box = (across, up, deep, material) => new THREE.Mesh(slab(across, up, deep, axis), material);
  const ctx = { portal, axis, width, height, put, box, group };

  (BY_STYLE[style] ?? BY_STYLE.flush)(ctx);

  // A porch lamp over it. A door on an unlit wall is a dark patch; a door with a light over it is a
  // door from the other side of the street.
  const porch = new THREE.Mesh(
    new THREE.BoxGeometry(...(axis === "x" ? [PORCH.size[2], PORCH.size[1], PORCH.size[0]] : PORCH.size)),
    matte(0x14171c, { emissive: new THREE.Color(PORCH.colour), emissiveIntensity: PORCH.glow, roughness: 0.5 })
  );
  porch.userData = { kind: "light" };
  porch.name = `doorway:${portal.id}:porch`;
  put(porch, { deep: FRAME.proud + PORCH.size[2] / 2, y: height + FRAME.margin + PORCH.lift });

  put(box(width + STEP.margin * 2, STEP.rise, STEP.tread, matte(COLOURS.step, { roughness: 0.9 })), {
    deep: STEP.tread / 2,
    y: STEP.rise / 2,
  });

  return group;
}

// --- the five kinds of front door ---
//
// Each builds what hangs on the wall between the jambs. They share the frame, the step, the lamp and
// the sign over the top; what differs is what you walk through.

const FACE = LEAF.stand + LEAF.thickness; // the front of a leaf, out from the wall

/** A leaf standing on the face, and a handle on its opening edge. */
function leaf(ctx, { across, along = 0, colour = COLOURS.leaf }) {
  ctx.put(ctx.box(across, ctx.height, LEAF.thickness, matte(colour, { roughness: 0.5 })), {
    along,
    deep: LEAF.stand + LEAF.thickness / 2,
    y: ctx.height / 2,
  }).name = `doorway:${ctx.portal.id}:leaf`;
}

function handle(ctx, along) {
  ctx.put(
    new THREE.Mesh(
      new THREE.BoxGeometry(HANDLE.size, HANDLE.size, HANDLE.size),
      matte(COLOURS.handle, { roughness: 0.3, metalness: 0.7 })
    ),
    { along, deep: FACE + HANDLE.size / 2, y: HANDLE.height }
  );
}

/** Glass with a light behind it: what tells you this is a way in and not a dark patch on a wall. */
const GLAZED = () =>
  matte(COLOURS.glass, { emissive: new THREE.Color(0xffe0b0), emissiveIntensity: 1.15, roughness: 0.25, metalness: 0.1 });

function glazing(ctx, { across, up, y, along = 0, deep = FACE + 0.01 }) {
  const pane = ctx.box(across, up, 0.04, GLAZED());
  pane.userData = { kind: "light" }; // a source: it neither casts a shadow nor takes one
  ctx.put(pane, { along, deep, y });
}

const BY_STYLE = {
  // One leaf: a panel below, glass above.
  flush(ctx) {
    leaf(ctx, { across: ctx.width });
    ctx.put(ctx.box(ctx.width * 0.72, ctx.height * 0.34, 0.02, matte(COLOURS.panel, { roughness: 0.6 })), {
      deep: FACE + 0.01,
      y: ctx.height * 0.22,
    });
    glazing(ctx, { across: ctx.width * 0.62, up: ctx.height * 0.42, y: ctx.height * 0.66 });
    handle(ctx, ctx.width / 2 - HANDLE.inset);
  },

  // Two leaves meeting at a mullion, with a handle each side of it.
  double(ctx) {
    const half = ctx.width / 2 - MULLION.width;
    for (const side of [-1, 1]) {
      leaf(ctx, { across: half, along: side * (ctx.width / 4 + MULLION.width / 2) });
      glazing(ctx, {
        across: half * 0.7,
        up: ctx.height * 0.5,
        y: ctx.height * 0.62,
        along: side * (ctx.width / 4 + MULLION.width / 2),
      });
      handle(ctx, side * MULLION.width * 1.6);
    }
    ctx.put(ctx.box(MULLION.width, ctx.height, LEAF.thickness + 0.03, matte(COLOURS.frame)), {
      deep: LEAF.stand + LEAF.thickness / 2,
      y: ctx.height / 2,
    });
  },

  // A shop: glass from the stall riser up, in three bays, with the door in the middle one.
  shopfront(ctx) {
    const bay = ctx.width / 3;
    ctx.put(ctx.box(ctx.width, RISER.height, LEAF.thickness + 0.02, matte(COLOURS.panel, { roughness: 0.8 })), {
      deep: LEAF.stand + LEAF.thickness / 2,
      y: RISER.height / 2,
    });
    for (const side of [-1, 1]) {
      glazing(ctx, {
        across: bay * 0.92,
        up: ctx.height - RISER.height,
        y: RISER.height + (ctx.height - RISER.height) / 2,
        along: side * bay,
        deep: LEAF.stand + 0.02,
      });
      ctx.put(ctx.box(MULLION.width, ctx.height, LEAF.thickness + 0.03, matte(COLOURS.frame)), {
        along: side * (bay / 2),
        deep: LEAF.stand + LEAF.thickness / 2,
        y: ctx.height / 2,
      });
    }
    leaf(ctx, { across: bay * 0.9 });
    glazing(ctx, { across: bay * 0.66, up: ctx.height * 0.62, y: ctx.height * 0.58 });
    handle(ctx, bay * 0.34);
  },

  // Set back in a niche: two returns and a soffit standing out of the wall, the leaf at the back.
  recessed(ctx) {
    const mat = matte(COLOURS.frame, { roughness: 0.85 });
    for (const side of [-1, 1]) {
      ctx.put(ctx.box(REVEAL.thickness, ctx.height + FRAME.margin, REVEAL.depth, mat), {
        along: side * (ctx.width + REVEAL.thickness) / 2,
        deep: REVEAL.depth / 2,
        y: (ctx.height + FRAME.margin) / 2,
      });
    }
    ctx.put(ctx.box(ctx.width + REVEAL.thickness * 2, REVEAL.thickness, REVEAL.depth, mat), {
      deep: REVEAL.depth / 2,
      y: ctx.height + FRAME.margin - REVEAL.thickness / 2,
    });
    leaf(ctx, { across: ctx.width });
    glazing(ctx, { across: ctx.width * 0.5, up: ctx.height * 0.3, y: ctx.height * 0.7 });
    handle(ctx, ctx.width / 2 - HANDLE.inset);
  },

  // A roller shutter box over the head, its guides down each side, and a plain leaf under it.
  shutter(ctx) {
    const mat = matte(COLOURS.shutter, { roughness: 0.55, metalness: 0.45 });
    ctx.put(ctx.box(ctx.width + SHUTTER.margin * 2, SHUTTER.box, SHUTTER.depth, mat), {
      deep: SHUTTER.depth / 2,
      y: ctx.height + FRAME.margin + SHUTTER.box / 2,
    });
    for (const side of [-1, 1]) {
      ctx.put(ctx.box(SHUTTER.guide, ctx.height + FRAME.margin, SHUTTER.depth * 0.6, mat), {
        along: side * (ctx.width + SHUTTER.guide) / 2,
        deep: SHUTTER.depth * 0.3,
        y: (ctx.height + FRAME.margin) / 2,
      });
    }
    BY_STYLE.flush(ctx);
  },
};
