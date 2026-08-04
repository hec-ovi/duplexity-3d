// The shuttle: a city too big to cross on foot has something you can ride across it.
import { describe, it, expect } from "vitest";
import { createShuttle } from "../src/shuttle.js";

const line = { id: "shuttle-line", stops: [[-20, 0, 6], [0, 0, 6], [20, 0, 6]] };
const run = (shuttle, seconds) => {
  for (let i = 0; i < seconds * 60; i++) shuttle.update(1 / 60);
};

describe("the shuttle", () => {
  it("stands at a stop, drives to the next one, and turns round at the end of the line", () => {
    const shuttle = createShuttle(line);
    expect(shuttle.stopped()).toBe(true);
    expect(shuttle.seat().x).toBeCloseTo(-20, 1);

    run(shuttle, 4); // the wait, then under way
    expect(shuttle.stopped()).toBe(false);
    expect(shuttle.seat().x).toBeGreaterThan(-20);

    run(shuttle, 2); // reaches the middle stop and stands there
    expect(shuttle.seat().x).toBeCloseTo(0, 0);
    expect(shuttle.stopped()).toBe(true);

    run(shuttle, 30); // on to the end and back down the line
    expect(shuttle.seat().x).toBeLessThan(20);
    expect(shuttle.seat().z).toBeCloseTo(6, 1); // never leaves its own street
  });

  it("you can only step on while it is standing, and only from beside it", () => {
    const shuttle = createShuttle(line);
    expect(shuttle.boardable({ x: -20, y: 0, z: 7 })).toBe(true);
    expect(shuttle.boardable({ x: -20, y: 0, z: 40 })).toBe(false); // across the city

    run(shuttle, 5); // under way
    expect(shuttle.boardable({ x: shuttle.seat().x, y: 0, z: 6 })).toBe(false);
  });

  it("stepping off puts you beside it, not under it", () => {
    const shuttle = createShuttle(line);
    const off = shuttle.kerbside();
    expect(Math.hypot(off.x - shuttle.seat().x, off.z - shuttle.seat().z)).toBeGreaterThan(1.5);
    expect(off.y).toBe(0);
  });

  it("a level with no line has no shuttle", () => {
    expect(createShuttle(null)).toBeNull();
    expect(createShuttle({ id: "x", stops: [[0, 0, 0]] })).toBeNull();
  });
});
