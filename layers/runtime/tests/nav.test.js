import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSceneModel } from "../src/scene-model.js";
import { createPortalNav } from "../src/nav.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const adventure = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);
const model = buildSceneModel(adventure.instances[0]);
const nav = createPortalNav(model);

describe("portal-graph navigation", () => {
  it("routes straight to the target within a single room", () => {
    expect(nav.findPath({ x: 0, z: 0 }, { x: 1, z: 1 })).toEqual([{ x: 1, z: 1 }]);
  });

  it("routes across two rooms through both doorway centres in order", () => {
    // entry (0,0) -> vault (6,6): out through p1 at (0,3), then p2 at (3,6), then the goal.
    const path = nav.findPath({ x: 0, z: 0 }, { x: 6, z: 6 });
    expect(path).toEqual([
      { x: 0, z: 3 },
      { x: 3, z: 6 },
      { x: 6, z: 6 },
    ]);
  });

  it("routes one room over through the single connecting doorway", () => {
    const path = nav.findPath({ x: 0, z: 0 }, { x: 0, z: 6 }); // entry -> hall via p1
    expect(path[0]).toEqual({ x: 0, z: 3 });
    expect(path[path.length - 1]).toEqual({ x: 0, z: 6 });
  });

  it("always ends the path at the requested point, even for a point outside every room", () => {
    const path = nav.findPath({ x: 0, z: 0 }, { x: 100, z: 100 });
    expect(path[path.length - 1]).toEqual({ x: 100, z: 100 });
  });
});
