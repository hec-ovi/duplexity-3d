import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSceneModel, roomAt } from "../src/scene-model.js";
import { isBlocked } from "../src/collision.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const adventure = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);
const instance = adventure.instances[0];
const model = buildSceneModel(instance);

describe("scene-model", () => {
  it("derives one floor per room and the world bounds", () => {
    expect(model.rooms).toHaveLength(3);
    expect(model.bounds).toEqual({ minX: -3, maxX: 9, minZ: -3, maxZ: 9 });
    expect(model.groundY).toBe(0);
  });

  it("builds full-height walls plus a header over each doorway, with shared walls deduped", () => {
    // 3 six-metre rooms sharing two walls, each shared wall split by a doorway: entry 5, hall +4,
    // vault +3 = 12 solid segments, plus a lintel over each of the 2 doorways = 14 rendered walls.
    // Only the 12 full-height segments collide (a lintel must not re-block the doorway below it).
    expect(model.walls).toHaveLength(14);
    expect(model.walls.filter((w) => w.collides)).toHaveLength(12);
    expect(model.colliders).toHaveLength(12);
    for (const w of model.walls) {
      expect(w.size.x * w.size.y * w.size.z).toBeGreaterThan(0);
      expect(w.collider.maxX).toBeGreaterThanOrEqual(w.collider.minX);
    }
  });

  it("cuts each doorway at the authored portal height, leaving a header above it", () => {
    // Portal p1 (z=3) opening height 2.4 in a 3m room -> a non-colliding lintel spanning y[2.4,3].
    const lintel = model.walls.find((w) => !w.collides && w.axis === "z" && Math.abs(w.plane - 3) < 1e-6);
    expect(lintel).toBeTruthy();
    expect(lintel.yBottom).toBeCloseTo(2.4, 6);
    expect(lintel.yTop).toBeCloseTo(3, 6);
    expect(model.walls.filter((w) => !w.collides)).toHaveLength(2); // one header per doorway
  });

  it("does not merge coincident-footprint walls that differ in height (split-level rooms)", () => {
    const twoRoom = {
      id: "t",
      theme: "t",
      rooms: [
        { id: "a", position: [0, 0, 0], size: [4, 3, 4], floorKit: "f", wallKit: "w" },
        { id: "b", position: [0, 0, 4], size: [4, 5, 4], floorKit: "f", wallKit: "w" },
      ],
      portals: [],
      npcs: [],
      goal: { type: "survive" },
      spawn: { position: [0, 0, 0], facing: 0 },
    };
    const m = buildSceneModel(twoRoom);
    const shared = m.walls.filter(
      (w) => w.axis === "z" && Math.abs(w.plane - 2) < 1e-6 && w.spanMin === -2 && w.spanMax === 2,
    );
    expect(shared.map((w) => w.size.y).sort((x, y) => x - y)).toEqual([3, 5]);
  });

  it("leaves the two doorways open and the wall segments solid", () => {
    const r = 0.3;
    // p1 doorway at (x=0, z=3) and p2 doorway at (x=3, z=6) are passable
    expect(isBlocked(model.colliders, 0, 3, r)).toBe(false);
    expect(isBlocked(model.colliders, 3, 6, r)).toBe(false);
    // the wall next to each doorway is solid
    expect(isBlocked(model.colliders, 2, 3, r)).toBe(true); // beside p1
    expect(isBlocked(model.colliders, 3, 4, r)).toBe(true); // beside p2
  });

  it("places objects, the pickup item, and npc bodies from the instance data", () => {
    expect(model.objects.map((o) => o.id).sort()).toEqual(["obj-anvil-1", "obj-chest-1", "obj-torch-1"]);
    expect(model.items).toEqual([
      expect.objectContaining({ itemId: "amulet", position: { x: 6, y: 0.6, z: 6 } }),
    ]);
    expect(model.npcs.map((n) => n.id)).toEqual(["npc-smith", "npc-guard"]);
    expect(model.npcs.find((n) => n.id === "npc-guard").disposition).toBe("hostile");
  });

  it("roomAt reports which room a point is in, and null in the void outside", () => {
    expect(roomAt(model, 0, 0)).toBe("room-entry");
    expect(roomAt(model, 0, 6)).toBe("room-hall");
    expect(roomAt(model, 6, 6)).toBe("room-vault");
    expect(roomAt(model, 20, 20)).toBe(null);
  });
});
