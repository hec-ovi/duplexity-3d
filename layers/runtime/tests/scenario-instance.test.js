// The Phase 4 DoD proof, from the runtime side: a layout the scenario-creator produced must load and
// be walkable by the real runtime. Reading another layer's published fixtures/ is contract-sanctioned
// (not a cross-layer src import), so this exercises the actual wire format end to end: buildSceneModel
// parses the generated instance, and the real portal-graph router walks it spawn -> goal room.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSceneModel, roomAt } from "../src/scene-model.js";
import { createPortalNav } from "../src/nav.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const instance = JSON.parse(
  readFileSync(join(HERE, "../../scenario-creator/fixtures/instance.generated.json"), "utf8"),
);

describe("runtime loads and walks a scenario-creator layout", () => {
  it("builds a scene model from an npc-less generated instance without crashing", () => {
    const model = buildSceneModel(instance);
    expect(model.rooms.length).toBe(instance.rooms.length);
    expect(model.walls.length).toBeGreaterThan(0);
    expect(model.npcs).toEqual([]); // a fresh layout has no npcs yet
  });

  it("spawns the player inside a real room, not stuck in a wall", () => {
    const model = buildSceneModel(instance);
    const room = roomAt(model, model.spawn.position.x, model.spawn.position.z);
    expect(room).not.toBeNull();
  });

  it("cuts a real opening at every doorway (the portal centre is not sealed by a wall collider)", () => {
    const model = buildSceneModel(instance);
    for (const p of model.portals) {
      const inside = model.colliders.some(
        (c) =>
          p.center.x > c.minX + 1e-6 &&
          p.center.x < c.maxX - 1e-6 &&
          p.center.z > c.minZ + 1e-6 &&
          p.center.z < c.maxZ - 1e-6,
      );
      expect(inside, `portal ${p.id} centre is blocked by a wall collider`).toBe(false);
    }
  });

  it("routes from spawn to the goal room through the doorways (walkable end to end)", () => {
    const model = buildSceneModel(instance);
    const nav = createPortalNav(model);

    // the discover_item goal target's room, found by its inventory item.
    const goalRoom = model.rooms.find((r) => model.items.some((it) => it.room === r.id));
    expect(goalRoom).toBeTruthy();

    const from = { x: model.spawn.position.x, z: model.spawn.position.z };
    const to = { x: goalRoom.center.x, z: goalRoom.center.z };
    const path = nav.findPath(from, to);

    // a multi-room route: at least one doorway waypoint plus the goal, ending at the target.
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path.at(-1)).toEqual(to);
    // spawn and goal are genuinely different rooms, so the route actually crosses a portal.
    expect(nav.roomAt(from.x, from.z)).not.toBe(goalRoom.id);
  });
});
