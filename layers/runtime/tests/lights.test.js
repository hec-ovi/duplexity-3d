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
    const rig = createLightRig(scene, { lights: lamps(30), open: true });
    expect(rig.points).toHaveLength(30);
    expect(pooled(scene)).toHaveLength(10);
  });

  // Let a fade run to the end, the way a second of play would.
  const settle = (rig, at, seconds = 2) => {
    for (let i = 0; i < seconds * 60; i++) rig.update(at, 1 / 60);
  };

  it("hands the pool to whatever is nearest the player, and follows them down the street", () => {
    const scene = fakeScene();
    const rig = createLightRig(scene, { lights: lamps(30), open: true });

    settle(rig, new THREE.Vector3(0, 1.6, 0));
    const near = pooled(scene);
    expect(near.every((p) => p.intensity > 0)).toBe(true);
    expect(Math.max(...near.map((p) => p.position.x))).toBeLessThanOrEqual(36);
    // and a lamp burns above head height, not on the pavement
    expect(near[0].position.y).toBeGreaterThan(3);

    settle(rig, new THREE.Vector3(116, 1.6, 0));
    expect(Math.min(...pooled(scene).map((p) => p.position.x))).toBeGreaterThanOrEqual(80);
  });

  // Walking down a street used to switch lamps on and off in front of you: a slot jumped straight
  // from one lamp to the next. It goes out first, then takes the new one.
  it("brings a light up and takes it down over time, never in one frame", () => {
    const scene = fakeScene();
    const rig = createLightRig(scene, { lights: lamps(30), open: true });

    rig.update(new THREE.Vector3(0, 1.6, 0), 1 / 60);
    const first = pooled(scene)[0].intensity;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(28); // on its way up, not there yet

    settle(rig, new THREE.Vector3(0, 1.6, 0));
    expect(pooled(scene)[0].intensity).toBeCloseTo(28, 5);

    // step far away: the lights fade out rather than vanishing between one frame and the next
    rig.update(new THREE.Vector3(116, 1.6, 0), 1 / 60);
    const dimming = pooled(scene).map((p) => p.intensity);
    expect(dimming.some((i) => i > 0 && i < 28)).toBe(true);
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
