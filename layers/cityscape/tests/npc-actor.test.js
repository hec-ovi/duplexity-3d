import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as THREE from "three";
import { buildInstanceObject3D } from "../src/scene.js";
import { createNpcActors } from "../src/npc-actor.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(
  readFileSync(join(HERE, "../../runtime/fixtures/scene-model.example.json"), "utf8"),
);
const npcDescriptors = model.npcs.map((n) => ({ id: n.id, name: n.name }));

function buildActors() {
  const group = buildInstanceObject3D(model, { warn: () => {} });
  return { group, actors: createNpcActors(group, npcDescriptors) };
}

describe("the NPC groups a city is built with", () => {
  it("wraps each NPC in a feet-anchored group with a named body child and a height", () => {
    const group = buildInstanceObject3D(model, { warn: () => {} });
    const smith = group.getObjectByName("npc:npc-smith");
    expect(smith.type).toBe("Group");
    expect(smith.userData.height).toBeGreaterThan(0);
    expect(group.getObjectByName("npc:npc-smith:body")).toBeTruthy();
  });
});

describe("npc-actor", () => {
  it("drives group position and facing from state", () => {
    const { group, actors } = buildActors();
    actors.sync(
      [{ id: "npc-smith", position: { x: 5, y: 0, z: 4 }, facing: 2.0, mode: "wander", animation: "walk" }],
      null,
      0.1
    );

    const smithGroup = group.getObjectByName("npc:npc-smith");
    expect(smithGroup.position.x).toBeCloseTo(5);
    expect(smithGroup.position.z).toBeCloseTo(4);
    expect(smithGroup.rotation.y).toBeCloseTo(2.0);
  });

  it("topples the body when the NPC is dead", () => {
    const { actors } = buildActors();
    actors.sync([{ id: "npc-guard", position: { x: 6, y: 0, z: 8 }, facing: 0, mode: "dead", animation: "die" }], null, 0.1, null);
    const guard = actors.actors.find((a) => a.id === "npc-guard");
    expect(guard.body.rotation.z).toBeCloseTo(Math.PI / 2);
  });
});
