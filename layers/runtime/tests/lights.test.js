import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createLightRig } from "../src/lights.js";

function fakeScene() {
  return {
    children: [],
    add(object) {
      this.children.push(object);
    },
    remove(object) {
      this.children = this.children.filter((c) => c !== object);
    },
  };
}

const lamps = (count, spacing = 4) =>
  Array.from({ length: count }, (_, i) => ({
    id: `lamp-${i}`,
    kind: "street_lamp",
    position: [i * spacing, 0, 0],
  }));

const pooled = (scene) => scene.children.filter((c) => c.isPointLight);

describe("the night rig", () => {
  it("lights the sky even where the city has no lamps of its own", () => {
    const scene = fakeScene();
    createLightRig(scene, { lights: [], open: false });
    expect(scene.children.some((c) => c.isHemisphereLight)).toBe(true);
    expect(scene.children.some((c) => c.isDirectionalLight)).toBe(true);
    expect(pooled(scene)).toHaveLength(0);
  });

  it("keeps a small pool of real lights, however many the street has", () => {
    const scene = fakeScene();
    const rig = createLightRig(scene, { lights: lamps(20), open: true });
    expect(rig.points).toHaveLength(20);
    expect(pooled(scene)).toHaveLength(6);
  });

  it("hands the pool to whatever is nearest the player, and follows them down the street", () => {
    const scene = fakeScene();
    const rig = createLightRig(scene, { lights: lamps(20), open: true });

    rig.update(new THREE.Vector3(0, 1.6, 0));
    const near = pooled(scene);
    expect(near.every((p) => p.intensity > 0)).toBe(true);
    expect(Math.max(...near.map((p) => p.position.x))).toBeLessThanOrEqual(20);
    // and a lamp burns above head height, not on the pavement
    expect(near[0].position.y).toBeGreaterThan(3);

    rig.update(new THREE.Vector3(76, 1.6, 0));
    expect(Math.min(...pooled(scene).map((p) => p.position.x))).toBeGreaterThanOrEqual(56);
  });

  it("a sign burns the colour of the building it is fixed to", () => {
    const scene = fakeScene();
    const rig = createLightRig(scene, {
      open: true,
      lights: [{ id: "sign-1", kind: "sign", blockId: "mass-1", position: [0, 0, 0] }],
      tintFor: (light) => (light.blockId === "mass-1" ? "#e8899f" : null),
    });
    rig.update(new THREE.Vector3(0, 1.6, 0));
    expect(pooled(scene)[0].color.getHexString()).toBe(new THREE.Color("#e8899f").getHexString());
  });

  it("takes every light back out when the scene it lit is torn down", () => {
    const scene = fakeScene();
    createLightRig(scene, { lights: lamps(4), open: true }).dispose();
    expect(scene.children).toHaveLength(0);
  });
});
