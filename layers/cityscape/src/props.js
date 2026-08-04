// runtime - what is standing on the street.
//
// The level says a van is parked here and how much room it takes; this builds the thing you can see
// and walk around. Everything alike is drawn together, so a city's worth of parked vehicles is a
// handful of draws.
//
// Boxes only, and each one modelled facing +z, so a prop is turned to the way the level says.

import * as THREE from "three";

const COLOURS = {
  body: [0x3c4e63, 0x513843, 0x2f4150, 0x4a4a55, 0x3c5044],
  glass: 0x121821,
  trim: 0x1a1d22,
  head: 0xfff0cf,
  tail: 0xff5a4a,
  signal: 0x4dff8a,
};

const matte = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.35, ...extra });

const burning = (colour, intensity) =>
  new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: new THREE.Color(colour),
    emissiveIntensity: intensity,
    roughness: 0.5,
  });

// FNV-1a over the prop's id: the same van is the same colour every time the city is loaded.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h | 0);
}

// What each kind is made of, in fractions of its own box: a body, a cabin over it, and whatever it
// lights up with. `parts` are [across, up, along, y, z] as fractions, added in order.
const SHAPE = {
  car: { body: [1, 0.5, 1], cabin: [0.86, 0.34, 0.5, 0.66, -0.05], lights: true },
  van: { body: [1, 0.72, 1], cabin: [0.9, 0.28, 0.34, 0.83, -0.28], lights: true },
  bike: { body: [1, 0.45, 1], cabin: [0.5, 0.4, 0.3, 0.62, -0.1], lights: true },
  bin: { body: [1, 1, 1], cabin: [1.02, 0.06, 1.02, 0.98, 0] },
  bollard: { body: [1, 1, 1], cabin: [1.1, 0.08, 1.1, 0.96, 0] },
};

const SIGNAL = { head: [0.34, 1.0, 0.3], lampSize: 0.16 };

/**
 * Build every prop on the street, batched by look.
 *
 * @param {Array} props  scene-model props: `{ id, kind, center, size, facing }`
 * @returns {THREE.Group|null}
 */
export function buildStreetProps(props) {
  if (!props?.length) return null;
  const group = new THREE.Group();
  group.name = "street-props";

  const bodies = new Map(); // one instanced mesh per (kind, colour, size)
  const at = new THREE.Object3D();
  const shared = {
    // A cabin with a little light in it: at night a parked vehicle reads by its glass, not its paint.
    glass: matte(COLOURS.glass, {
      roughness: 0.2,
      metalness: 0.1,
      emissive: new THREE.Color(0x2b3c52),
      emissiveIntensity: 0.55,
    }),
    trim: matte(COLOURS.trim, { metalness: 0.5 }),
    head: burning(COLOURS.head, 1.4),
    tail: burning(COLOURS.tail, 1.2),
  };
  const paint = COLOURS.body.map((c) => matte(c));

  const batch = (key, size, material, place) => {
    if (!bodies.has(key)) bodies.set(key, { size, material, places: [] });
    bodies.get(key).places.push(place);
  };
  const round = (n) => Math.round(n * 100) / 100;

  for (const prop of props) {
    const { x: w, y: h, z: d } = prop.size;
    const { x, y, z } = prop.center;
    const facing = prop.facing ?? 0;

    if (prop.kind === "traffic_light") {
      // A post with a head on it, and three lamps down the head: the one thing on a street that is
      // always the same, so it is worth building the same way every time.
      batch(`signal-post:${round(h)}`, [0.16, h, 0.16], shared.trim, { x, y, z, facing });
      batch(`signal-head`, SIGNAL.head, shared.trim, { x, y: y + h / 2 + SIGNAL.head[1] / 2, z, facing, out: 0.22 });
      const lamps = [shared.tail, shared.head, burning(COLOURS.signal, 1.3)];
      lamps.forEach((material, i) => {
        batch(`signal-lamp:${i}`, [SIGNAL.lampSize, SIGNAL.lampSize, 0.06], material, {
          x,
          y: y + h / 2 + SIGNAL.head[1] * (0.78 - i * 0.3),
          z,
          facing,
          out: 0.4,
        });
      });
      continue;
    }

    const shape = SHAPE[prop.kind] ?? SHAPE.bin;
    const colour = paint[hash(prop.id) % paint.length];
    const body = [w * shape.body[0], h * shape.body[1], d * shape.body[2]];
    batch(`${prop.kind}-body:${round(body[0])}:${round(body[1])}:${round(body[2])}`, body, colour, {
      x,
      y: y - h / 2 + body[1] / 2,
      z,
      facing,
    });

    const [cw, ch, cd, cy, cz] = shape.cabin;
    batch(`${prop.kind}-cabin:${round(w * cw)}:${round(h * ch)}`, [w * cw, h * ch, d * cd], shared.glass, {
      x,
      y: y - h / 2 + h * cy,
      z,
      facing,
      along: d * cz,
    });

    if (!shape.lights) continue;
    for (const [material, end, key] of [[shared.head, 1, "head"], [shared.tail, -1, "tail"]]) {
      batch(`${prop.kind}-${key}:${round(w)}`, [w * 0.7, 0.1, 0.06], material, {
        x,
        y: y - h / 2 + h * 0.42,
        z,
        facing,
        along: (end * d) / 2,
      });
    }
  }

  for (const [key, { size, material, places }] of bodies) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), material, places.length);
    mesh.name = key;
    mesh.userData = { kind: key.includes("lamp") || key.endsWith("head") || key.endsWith("tail") ? "light" : "prop" };
    places.forEach((place, i) => {
      const sin = Math.sin(place.facing);
      const cos = Math.cos(place.facing);
      const along = place.along ?? 0;
      const out = place.out ?? 0;
      at.rotation.set(0, place.facing, 0);
      at.position.set(place.x + along * sin + out * sin, place.y, place.z + along * cos + out * cos);
      at.updateMatrix();
      mesh.setMatrixAt(i, at.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere?.();
    if (!mesh.boundingSphere) mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}
