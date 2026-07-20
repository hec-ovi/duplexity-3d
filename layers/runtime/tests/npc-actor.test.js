import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as THREE from "three";
import { buildSceneModel } from "../src/scene-model.js";
import { buildInstanceObject3D } from "../src/three-scene.js";
import { createNpcActors } from "../src/npc-actor.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const adventure = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);
const model = buildSceneModel(adventure.instances[0]);
const npcDescriptors = model.npcs.map((n) => ({ id: n.id, name: n.name }));

// A recording text factory: a real Object3D (so it parents/positions), plus a captured `text`.
function fakeText(opts = {}) {
  const o = new THREE.Object3D();
  o.text = opts.text ?? "";
  o.visible = opts.visible ?? true;
  o.sync = vi.fn();
  o.dispose = vi.fn();
  return o;
}

function buildActors() {
  const group = buildInstanceObject3D(model, { warn: () => {} });
  const actors = createNpcActors(group, npcDescriptors, { createText: fakeText });
  return { group, actors };
}

describe("three-scene NPC groups", () => {
  it("wraps each NPC in a feet-anchored group with a named body child and a height", () => {
    const group = buildInstanceObject3D(model, { warn: () => {} });
    const smith = group.getObjectByName("npc:npc-smith");
    expect(smith.type).toBe("Group");
    expect(smith.userData.height).toBeGreaterThan(0);
    expect(group.getObjectByName("npc:npc-smith:body")).toBeTruthy();
  });
});

describe("npc-actor", () => {
  it("labels each NPC with its name and starts with the bubble hidden", () => {
    const { actors } = buildActors();
    const smith = actors.actors.find((a) => a.id === "npc-smith");
    expect(smith.label.text).toBe("Bruk Ironhand");
    expect(smith.bubble.visible).toBe(false);
  });

  it("drives group position + facing from state and billboards the label to the camera in WORLD space", () => {
    const { group, actors } = buildActors();
    const camera = new THREE.PerspectiveCamera();
    camera.rotation.y = 1.0;
    camera.updateMatrixWorld(true);

    // A non-zero facing is exactly the case a naive local-quaternion copy renders backwards, since the
    // label is a child of the yaw-rotated npc group.
    actors.sync([{ id: "npc-smith", position: { x: 5, y: 0, z: 4 }, facing: 2.0, mode: "wander", animation: "walk" }], camera, 0.1, null);

    const smithGroup = group.getObjectByName("npc:npc-smith");
    expect(smithGroup.position.x).toBeCloseTo(5);
    expect(smithGroup.position.z).toBeCloseTo(4);
    expect(smithGroup.rotation.y).toBeCloseTo(2.0);

    const smith = actors.actors.find((a) => a.id === "npc-smith");
    const labelWorld = smith.label.getWorldQuaternion(new THREE.Quaternion());
    const camWorld = camera.getWorldQuaternion(new THREE.Quaternion());
    // the label's WORLD orientation matches the camera regardless of the NPC's facing
    expect(labelWorld.x).toBeCloseTo(camWorld.x);
    expect(labelWorld.y).toBeCloseTo(camWorld.y);
    expect(labelWorld.z).toBeCloseTo(camWorld.z);
    expect(labelWorld.w).toBeCloseTo(camWorld.w);
  });

  it("shows the speech bubble while the speech model has a line, then hides it", () => {
    const { actors } = buildActors();
    const states = model.npcs.map((n) => ({ id: n.id, position: n.position, facing: 0, mode: "talk", animation: "talk" }));

    actors.sync(states, null, 0, { get: (id) => (id === "npc-smith" ? { text: "Well met." } : null) });
    const smith = actors.actors.find((a) => a.id === "npc-smith");
    expect(smith.bubble.text).toBe("Well met.");
    expect(smith.bubble.visible).toBe(true);

    actors.sync(states, null, 0, { get: () => null });
    expect(smith.bubble.visible).toBe(false);
  });

  it("topples the body when the NPC is dead", () => {
    const { actors } = buildActors();
    actors.sync([{ id: "npc-guard", position: { x: 6, y: 0, z: 8 }, facing: 0, mode: "dead", animation: "die" }], null, 0.1, null);
    const guard = actors.actors.find((a) => a.id === "npc-guard");
    expect(guard.body.rotation.z).toBeCloseTo(Math.PI / 2);
  });
});
