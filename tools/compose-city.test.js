// Composition-root test: a generated city, held to the REAL geometry validator, the REAL map rules
// and the REAL runtime. The layer tests prove each generator keeps its own promises; this proves the
// level they make together is a level you can actually play and win.
import { describe, it, expect } from "vitest";
import { validate, SCHEMA_ID } from "../harness/schemas.js";
import { composeCity } from "./src/compose-city.js";
import { validateLayout } from "../layers/scenario-creator/src/index.js";
import { createRuntime } from "../layers/runtime/src/index.js";
import {
  buildWorldMap,
  createProgress,
  clearInstance,
  enterInstance,
  doorState,
  exitState,
  unlockedInstances,
  win,
} from "../layers/map-state/src/index.js";

const spec = {
  id: "ashgate",
  theme: "city",
  label: "Ashgate",
  sizeHint: "medium",
  lots: 3,
  floorsPerLot: [2, 1, 3],
  seed: 11,
};

const city = () => composeCity(spec);

// Walk the player toward a world point, one 60th of a second at a time, and say whether they got
// there. At yaw 0 the camera looks down -Z, so this yaw aims "forward" straight at the target.
function walkTo(rt, x, z, seconds = 20) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const p = rt.getPlayer().position;
    const dx = x - p.x;
    const dz = z - p.z;
    if (Math.hypot(dx, dz) < 0.35) return true;
    rt.setYaw(Math.atan2(-dx, -dz));
    rt.step(1 / 60, { forward: true });
  }
  return false;
}

describe("a generated city is a valid, connected, winnable level", () => {
  it("assembles a schema-valid Adventure: one street plus every floor behind its doors", () => {
    const { adventure, lots } = city();
    const r = validate(SCHEMA_ID.persistence.adventure, adventure);
    expect(r.ok, JSON.stringify(r.errors?.slice(0, 4), null, 2)).toBe(true);

    // 1 street + (2 + 1 + 3) floors
    expect(adventure.instances).toHaveLength(7);
    expect(lots.map((l) => l.floors)).toEqual([2, 1, 3]);
    expect(adventure.progression.start).toBe("ashgate");
  });

  it("every instance passes the geometry validator that scenario-creator owns", () => {
    for (const instance of city().adventure.instances) {
      const report = validateLayout(instance);
      const failed = report.checks.filter((c) => !c.ok);
      expect(failed, `${instance.id}: ${JSON.stringify(failed)}`).toEqual([]);
    }
  });

  it("every door leads somewhere real, and every way in has a way back out", () => {
    const { adventure, worldMap } = city();
    const byId = new Map(adventure.instances.map((i) => [i.id, i]));

    for (const door of worldMap.doors) {
      const target = byId.get(door.to);
      expect(target, `${door.portalId} -> ${door.to}`).toBeDefined();
      // the room it drops you in exists on the far side
      const portal = byId.get(door.from).portals.find((p) => p.id === door.portalId);
      expect(target.rooms.some((r) => r.id === portal.link.spawnRoomId)).toBe(true);
    }
    // each building's ground floor can be entered from the street and left again
    for (const lot of city().lots) {
      const ground = byId.get(lot.floorInstanceIds[0]);
      expect(ground.portals.some((p) => p.link?.kind === "leave")).toBe(true);
      expect(worldMap.doors.some((d) => d.to === ground.id && d.kind === "enter")).toBe(true);
    }
  });

  it("the gate opens only after every building is cleared, and then the run is won", () => {
    const { adventure } = city();
    const map = buildWorldMap(adventure);
    let run = createProgress(map);

    // everything is reachable from the start; nothing is cleared yet
    expect(unlockedInstances(map, run)).toEqual(map.nodes.map((n) => n.instanceId));
    expect(exitState(map, run).open).toBe(false);
    expect(exitState(map, run).remaining).toEqual(map.required);
    expect(map.required).not.toContain("ashgate"); // the street holds the gate

    for (const id of map.required.slice(0, -1)) run = clearInstance(run, map, id);
    expect(exitState(map, run).open).toBe(false); // one to go

    run = clearInstance(run, map, map.required.at(-1));
    expect(exitState(map, run).open).toBe(true);
    expect(win(run, map, exitState(map, run).portalId).won).toBe(true);
  });

  it("the runtime walks the street, through a door, and into the building behind it", () => {
    const { adventure } = city();
    const map = buildWorldMap(adventure);
    let run = createProgress(map);

    const transits = [];
    const rt = createRuntime({
      onTransit: (t) => transits.push(t),
      isPortalOpen: (id) => doorState(map, run, id).open,
    });
    rt.load(adventure, "ashgate");

    // Head for the first front door: down the avenue to its block, into that block, then into the
    // doorway. Each leg is axis-aligned, so it passes through the openings between segments.
    const street = adventure.instances[0];
    const door = street.portals.find((p) => p.roomB === "LINK");
    const block = street.rooms.find((r) => r.id === door.roomA);
    expect(walkTo(rt, block.position[0], 0)).toBe(true);
    expect(walkTo(rt, block.position[0], block.position[2])).toBe(true);
    walkTo(rt, door.position[0], door.position[2]);

    expect(transits.map((t) => t.portalId)).toEqual([door.id]);

    const { link } = transits[0];
    run = enterInstance(run, map, link.instanceId);
    rt.load(adventure, link.instanceId, { spawnRoomId: link.spawnRoomId });
    expect(rt.getPlayer().currentRoom).toBe(link.spawnRoomId);

    // inside, the blueprint shows the room we are standing in and nothing we have not seen
    const plan = rt.blueprint();
    expect(plan.rooms.map((r) => r.id)).toEqual([link.spawnRoomId]);
    expect(plan.instanceId).toBe(link.instanceId);
  });

  it("populates every instance with a cast that lives in its rooms", () => {
    const { adventure } = city();
    for (const instance of adventure.instances) {
      expect(instance.npcs.length).toBe(2);
      for (const npc of instance.npcs) {
        expect(instance.rooms.some((r) => r.id === npc.homeRoom)).toBe(true);
        expect(npc.allowedModes.length).toBeGreaterThan(0);
        expect(npc.voiceDesign).toBeTruthy();
      }
    }
    // the street's cast is public-facing, the floors' is not
    expect(adventure.instances[0].npcs.map((n) => n.name)).toContain("passer-by-1");
    expect(adventure.instances[1].npcs.map((n) => n.name)).toContain("resident-1");
    // and a level can be asked for empty
    expect(composeCity({ ...spec, npcs: 0 }).adventure.instances.every((i) => i.npcs.length === 0)).toBe(true);
  });

  it("the same spec builds the same city, every time", () => {
    expect(composeCity(spec).adventure).toEqual(composeCity(spec).adventure);
  });
});
