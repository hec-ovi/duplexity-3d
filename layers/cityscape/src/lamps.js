// runtime - what stands where the light is.
//
// The level says a lamp stands here and what kind it is; this builds the thing you can see. Only the
// glow is drawn: which of them are real lights at any moment is the rig's business (lights.js), so a
// street can carry forty and cost nothing.
//
// Boxes only, and one group per lamp. A lamp is the piece of street furniture you walk past most,
// so a city with one kind of lamp reads as a city built from one part.

import * as THREE from "three";

const POLE = 0.14;
const COLOUR = { pole: 0x1b1e23, head: 0xffd9a8 };
const GLOW = 1.1;

// Every kind of lamp, in metres. `head` is the lit box; `arms` are how far out to each side its
// heads reach, so a twin lamp lights both pavements and a reach lamp leans over the road.
const KINDS = {
  post: { height: 4.6, head: [0.5, 0.22, 0.5], arms: [0] },
  twin: { height: 5.4, head: [0.42, 0.2, 0.42], arms: [-0.85, 0.85] },
  reach: { height: 6.2, head: [0.75, 0.2, 0.4], arms: [1.7] },
  bollard: { height: 1.05, head: [0.24, 0.34, 0.24], arms: [0], pole: 0.2 },
};

// A bracket on a building's face: a stub arm out of the wall with a head on the end of it.
const BRACKET = { height: 3.4, out: 0.75, head: [0.34, 0.24, 0.5] };

const matte = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.2 });

// Something that reads as a source of light: dark, bright, and what the bloom pass catches.
function glowing(colour, intensity = GLOW) {
  return new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: new THREE.Color(colour),
    emissiveIntensity: intensity,
    roughness: 0.6,
    metalness: 0,
  });
}

/**
 * Build one lamp, standing at the level's own position for it.
 *
 * @param {object} light  a scene-model light: `{ id, kind, style?, position, facing? }`
 * @param {object} [deps]
 * @param {THREE.Material} [deps.poleMaterial] shared, so a street of lamps is one material
 * @param {THREE.Material} [deps.headMaterial] shared likewise
 * @returns {THREE.Group|null}  null for a light with nothing to stand there (a ceiling panel)
 */
export function buildLamp(light, { poleMaterial, headMaterial } = {}) {
  const [x, y, z] = light.position;
  const pole = poleMaterial ?? matte(COLOUR.pole);
  const head = headMaterial ?? glowing(COLOUR.head);
  const group = new THREE.Group();
  group.name = `lamp:${light.id}`;
  group.position.set(x, y, z);
  group.userData = { kind: "light", lightId: light.id };

  if (light.kind === "wall_lamp") {
    group.rotation.y = light.facing ?? 0;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(POLE * 0.6, POLE * 0.6, BRACKET.out), pole);
    arm.position.set(0, BRACKET.height, BRACKET.out / 2);
    group.add(arm);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(...BRACKET.head), head);
    bulb.position.set(0, BRACKET.height - 0.1, BRACKET.out);
    group.add(bulb);
    return group;
  }

  const kind = KINDS[light.style] ?? KINDS.post;
  const thickness = kind.pole ?? POLE;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(thickness, kind.height, thickness), pole);
  mast.position.y = kind.height / 2;
  group.add(mast);

  for (const reach of kind.arms) {
    if (reach !== 0) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(reach), POLE * 0.5, POLE * 0.5), pole);
      arm.position.set(reach / 2, kind.height - 0.1, 0);
      group.add(arm);
    }
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(...kind.head), head);
    bulb.position.set(reach, kind.height - (light.style === "bollard" ? kind.head[1] / 2 : 0.18), 0);
    group.add(bulb);
  }
  return group;
}

// The cone of light under a lamp head: what makes a lamp read as a lamp burning in haze rather than
// as a bright box on a pole. One shared cone, laid over every lamp in the street in one draw.
const SHAFT = { radius: 2.2, drop: 1.2, opacity: 0.018 };

/**
 * The shafts under a street's worth of lamps, as one instanced mesh. Additive and unlit, so they
 * brighten what is behind them and take no light of their own.
 *
 * @param {Array} lights  scene-model lights
 * @returns {THREE.InstancedMesh|null}
 */
export function buildLampShafts(lights) {
  const standing = (lights ?? []).filter((l) => l.kind === "street_lamp" || l.kind === "wall_lamp");
  if (standing.length === 0) return null;

  const cone = new THREE.ConeGeometry(SHAFT.radius, 1, 10, 1, true);
  const mesh = new THREE.InstancedMesh(
    cone,
    new THREE.MeshBasicMaterial({
      color: COLOUR.head,
      transparent: true,
      opacity: SHAFT.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    standing.length
  );
  mesh.name = "lamp-shafts";
  mesh.userData = { kind: "light" };
  const at = new THREE.Object3D();
  standing.forEach((light, i) => {
    const height = lampHeight(light) + SHAFT.drop;
    at.position.set(light.position[0], light.position[1] + height / 2 - SHAFT.drop / 2, light.position[2]);
    at.scale.set(1, height, 1);
    at.rotation.set(0, 0, 0);
    at.updateMatrix();
    mesh.setMatrixAt(i, at.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere?.();
  if (!mesh.boundingSphere) mesh.frustumCulled = false;
  return mesh;
}

/** The two materials a whole street of lamps shares. */
export function lampMaterials() {
  return { poleMaterial: matte(COLOUR.pole), headMaterial: glowing(COLOUR.head) };
}

/** How high off the ground this lamp actually burns, so the rig puts its light in the head. */
export function lampHeight(light) {
  if (light.kind === "wall_lamp") return BRACKET.height - 0.1;
  return (KINDS[light.style] ?? KINDS.post).height - 0.18;
}
