// cityscape - what stands on a roof.
//
// A city read from street level is read by its skyline, and a skyline of flat parapets is a skyline
// of boxes. Every tall building here carries something: a mast with a warning light on it, a frame
// of girders, a dish, a spire, a run of vents. Five shapes, all boxes, all cheap.

import * as THREE from "three";

const COLOUR = { steel: 0x2b3038, warn: "#ff4d4d", lit: "#8fd6ff" };
const GUY = 0.06; // a guy wire or a girder, in metres

// Every roof in a city wears the same steel and the same warning light, so both are made once.
const made = new Map();
const once = (key, make) => {
  if (!made.has(key)) {
    const material = make();
    material.userData.shared = true; // outlives any one scene, so nothing may dispose it
    made.set(key, material);
  }
  return made.get(key);
};

const matte = (color) => once(`m${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.5 }));

const burning = (colour, intensity) =>
  once(`b${colour}${intensity}`, () =>
    new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: new THREE.Color(colour),
      emissiveIntensity: intensity,
      roughness: 0.5,
    })
  );

/**
 * @param {{kind,position,width,height}} topper  in the building's own frame
 * @param {{x,y,z}} foot  where that frame's origin stands in the world
 * @returns {THREE.Group}
 */
export function buildTopper(topper, foot) {
  const { kind, width: w, height: h } = topper;
  const group = new THREE.Group();
  group.name = `topper:${kind}`;
  group.position.set(foot.x + topper.position[0], foot.y + topper.position[1], foot.z + topper.position[2]);
  const steel = matte(COLOUR.steel);

  const put = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  if (kind === "mast" || kind === "spire") {
    // A pole with a warning light on top, and for a spire a taper rather than a shaft.
    const thin = kind === "spire" ? w * 0.25 : w;
    put(new THREE.CylinderGeometry(thin * 0.15, w * 0.5, h, kind === "spire" ? 6 : 4), steel, 0, h / 2, 0);
    const lamp = put(new THREE.BoxGeometry(w * 0.5, w * 0.5, w * 0.5), burning(COLOUR.warn, 2.2), 0, h + w * 0.3, 0);
    lamp.userData = { kind: "light" };
    // Guys down to the roof, which is what says it is a mast and not a stick.
    if (kind === "mast") {
      for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const guy = put(new THREE.BoxGeometry(GUY, h * 0.75, GUY), steel, (dx * w * 1.6) / 2, h * 0.38, (dz * w * 1.6) / 2);
        guy.rotation.set(dz * 0.16, 0, -dx * 0.16);
      }
    }
    return group;
  }

  if (kind === "frame") {
    // Four legs and two rings of girders: a service frame over the plant on the roof.
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      put(new THREE.BoxGeometry(GUY * 2, h, GUY * 2), steel, (dx * w) / 2, h / 2, (dz * w) / 2);
    }
    for (const level of [0.45, 0.98]) {
      for (const along of [0, 1]) {
        const bar = along
          ? new THREE.BoxGeometry(w + GUY * 2, GUY * 2, GUY * 2)
          : new THREE.BoxGeometry(GUY * 2, GUY * 2, w + GUY * 2);
        for (const side of [-1, 1]) {
          put(bar.clone(), steel, along ? 0 : (side * w) / 2, h * level, along ? (side * w) / 2 : 0);
        }
      }
    }
    const beacon = put(new THREE.BoxGeometry(w * 0.3, w * 0.3, w * 0.3), burning(COLOUR.warn, 2), 0, h + w * 0.15, 0);
    beacon.userData = { kind: "light" };
    return group;
  }

  if (kind === "dish") {
    // A pedestal with a dish tipped off it, and a lit rim so it reads after dark.
    put(new THREE.BoxGeometry(w * 0.4, h * 0.55, w * 0.4), steel, 0, h * 0.28, 0);
    const dish = put(new THREE.CylinderGeometry(w * 0.5, w * 0.5, w * 0.08, 12), steel, 0, h * 0.75, 0);
    dish.rotation.x = 0.6;
    const rim = put(new THREE.TorusGeometry(w * 0.5, w * 0.03, 6, 14), burning(COLOUR.lit, 1.4), 0, h * 0.75, 0);
    rim.rotation.x = 0.6 + Math.PI / 2;
    rim.userData = { kind: "light" };
    return group;
  }

  // vents: a run of boxes and stacks, the plant every real roof carries
  const units = 3;
  for (let i = 0; i < units; i++) {
    const across = ((i - (units - 1) / 2) * w) / units;
    put(new THREE.BoxGeometry(w / units - 0.2, h * (0.5 + (i % 2) * 0.5), w * 0.5), steel, across, h * (0.25 + (i % 2) * 0.25), 0);
  }
  put(new THREE.CylinderGeometry(w * 0.09, w * 0.09, h * 1.6, 8), steel, w * 0.42, h * 0.8, w * 0.2);
  return group;
}
