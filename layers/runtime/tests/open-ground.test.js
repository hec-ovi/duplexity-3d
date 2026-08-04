// Open ground: a street level is one floor with buildings standing on it, not a set of walled rooms.
// The edge of the world stops you without being a wall, and a building is solid.
import { describe, it, expect } from "vitest";
import { buildSceneModel } from "../src/scene-model.js";
import { isBlocked } from "../src/collision.js";
import { createRuntime } from "../src/index.js";

const GROUND = {
  id: "ground",
  position: [0, 0, 0],
  size: [40, 20, 40],
  floorKit: "kit.road",
  wallKit: "kit.facade",
  open: true,
  objects: [],
  inventory: [],
  blocks: [
    { id: "mass-1", position: [10, 0, 0], size: [12, 15, 12], label: "Tower" },
  ],
};

const DOOR = {
  id: "door-1",
  roomA: "ground",
  roomB: "LINK",
  blockId: "mass-1",
  position: [4, 0, 0], // the tower's west face
  axis: "x",
  size: [2, 3],
  link: { instanceId: "tower-f1", spawnRoomId: "entry", kind: "enter" },
};

const street = {
  id: "city",
  theme: "city",
  rules: { mapKind: "street", label: "Downtown" },
  rooms: [GROUND],
  portals: [DOOR],
  npcs: [],
  goal: { type: "survive", seconds: 10 },
  spawn: { position: [-15, 0, 0], facing: 0 },
};

const model = buildSceneModel(street);

describe("runtime - open ground", () => {
  it("the edge of an open room stops you, but nothing is drawn there", () => {
    const perimeter = model.walls.filter((w) => Math.abs(Math.abs(w.plane) - 20) < 1e-6);
    expect(perimeter.length).toBeGreaterThan(0);
    expect(perimeter.every((w) => w.renders === false)).toBe(true);
    expect(perimeter.every((w) => w.collides)).toBe(true);

    // you cannot walk out past it
    expect(isBlocked(model.colliders, 0, 19.9, 0.3)).toBe(true);
  });

  it("a building is solid: you walk around it, never through it", () => {
    expect(isBlocked(model.colliders, 10, 0, 0.3)).toBe(true); // dead centre of the tower
    expect(isBlocked(model.colliders, 0, 0, 0.3)).toBe(false); // the street beside it
    expect(model.blocks).toHaveLength(1);
    expect(model.blocks[0].label).toBe("Tower");
  });

  it("a door on a building's face cuts no opening in the ground's own edge", () => {
    // the door sits at x=4, well inside the ground: no wall piece was split around it
    const nearDoor = model.walls.filter((w) => Math.abs(w.plane - 4) < 1e-6);
    expect(nearDoor).toEqual([]);
  });

  it("walking up to a building's door still crosses to the instance inside it", () => {
    const transits = [];
    const rt = createRuntime({ onTransit: (t) => transits.push(t) });
    rt.load({ instances: [street] }, "city");

    rt.setYaw(-Math.PI / 2); // face east, toward the tower
    for (let i = 0; i < 400 && transits.length === 0; i++) rt.step(1 / 60, { forward: true });

    expect(transits).toHaveLength(1);
    expect(transits[0].link.instanceId).toBe("tower-f1");
  });

  it("the blueprint shows the buildings on the ground you are standing on", () => {
    const rt = createRuntime({});
    rt.load({ instances: [street] }, "city");
    const plan = rt.blueprint();
    expect(plan.rooms.map((r) => r.id)).toEqual(["ground"]);
    expect(plan.blocks).toEqual([
      { id: "mass-1", min: { x: 4, z: -6 }, max: { x: 16, z: 6 }, label: "Tower" },
    ]);
  });
});
