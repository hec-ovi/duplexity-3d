import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSceneModel } from "../src/scene-model.js";
import { resolveMove, isBlocked } from "../src/collision.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const adventure = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);
const model = buildSceneModel(adventure.instances[0]);
const R = 0.3;

describe("collision", () => {
  it("stops the player at a solid wall instead of passing through it", () => {
    // From the entry centre, drive straight into the south wall (collider z in [-3.1,-2.9]).
    const out = resolveMove(model.colliders, { x: 0, z: 0 }, { x: 0, z: -3 }, R);
    expect(out.z).toBeCloseTo(-2.6, 5); // -2.9 + radius
    expect(out.z).toBeGreaterThan(-2.9);
  });

  it("slides along a wall: blocked on one axis, free on the other", () => {
    const out = resolveMove(model.colliders, { x: 0, z: 0 }, { x: 1, z: -3 }, R);
    expect(out.x).toBeCloseTo(1, 5); // free in x
    expect(out.z).toBeCloseTo(-2.6, 5); // blocked in z
  });

  it("lets the player walk through a portal opening unobstructed", () => {
    // Move north across the p1 doorway (x=0, z=3) from entry into hall.
    const out = resolveMove(model.colliders, { x: 0, z: 2 }, { x: 0, z: 4 }, R);
    expect(out).toEqual({ x: 0, z: 4 });
  });

  it("isBlocked distinguishes a doorway from a wall", () => {
    expect(isBlocked(model.colliders, 0, 3, R)).toBe(false); // doorway
    expect(isBlocked(model.colliders, 2.9, 3, R)).toBe(true); // wall beside it
  });
});
