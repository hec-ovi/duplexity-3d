import { describe, it, expect } from "vitest";
import { movementVector } from "../src/controls.js";

describe("controls.movementVector", () => {
  it("moves forward along -Z at yaw 0 (three.js default forward)", () => {
    const d = movementVector({ forward: true }, 0, 3, 1);
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.z).toBeCloseTo(-3, 6);
  });

  it("strafes right along +X at yaw 0", () => {
    const d = movementVector({ right: true }, 0, 3, 1);
    expect(d.x).toBeCloseTo(3, 6);
    expect(d.z).toBeCloseTo(0, 6);
  });

  it("normalizes diagonal input so it is not faster than a straight walk", () => {
    const d = movementVector({ forward: true, right: true }, 0, 1, 1);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 6);
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(d.z).toBeCloseTo(-Math.SQRT1_2, 6);
  });

  it("rotates the movement with yaw", () => {
    const d = movementVector({ forward: true }, Math.PI / 2, 3, 1);
    expect(d.x).toBeCloseTo(-3, 6); // forward now points -X
    expect(d.z).toBeCloseTo(0, 6);
  });

  it("cancels opposite keys and returns zero for no input", () => {
    expect(movementVector({ forward: true, back: true }, 0, 3, 1)).toEqual({ x: 0, z: 0 });
    expect(movementVector({}, 0, 3, 1)).toEqual({ x: 0, z: 0 });
  });

  it("scales with speed and dt", () => {
    const d = movementVector({ forward: true }, 0, 5, 0.5);
    expect(d.z).toBeCloseTo(-2.5, 6);
  });
});
