import { describe, it, expect } from "vitest";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createStreets, CitySpecInvalidError, NoAssetForKindError } from "../src/index.js";
import { BLOCK, STREET } from "../src/lattice.js";

// The registry handle is injected, never imported: any object with a `kind` answers.
const assetQuery = ({ kind, theme }) => [{ id: `${theme}.${kind}` }];

const spec = { id: "ashgate", theme: "city", label: "Ashgate", sizeHint: "medium", lots: 3 };

// Stand-in for the injected scenario-creator validator, so these tests can prove the layer calls it
// and refuses to ship what it rejects.
const passing = () => ({ ok: true, checks: [{ name: "stub", ok: true }] });
const build = (over = {}, opts = {}) =>
  createStreets({ ...spec, ...over }, assetQuery, { validateInstance: passing, ...opts });

describe("city-planner contract", () => {
  it("the spec fixture is schema-valid and the level is a valid persistence Instance", () => {
    expect(validate(SCHEMA_ID.cityPlanner.citySpec, spec).ok).toBe(true);
    const { instance } = build();
    const r = validate(SCHEMA_ID.persistence.instance, { ...instance, npcs: [] });
    expect(r.ok, JSON.stringify(r.errors, null, 2)).toBe(true);
    expect(instance.rules).toEqual({ mapKind: "street", label: "Ashgate" });
  });

  it("the outdoors is one open floor, not a set of rooms", () => {
    const { instance } = build();
    expect(instance.rooms).toHaveLength(1);
    expect(instance.rooms[0].open).toBe(true);
    // no room-to-room doorways exist out here: there is only open ground
    expect(instance.portals.every((p) => p.roomB === "LINK" || p.roomB === "EXIT")).toBe(true);
  });

  it("buildings stand as separate masses with streets between them", () => {
    const { instance } = build({ sizeHint: "large", lots: 16 });
    const blocks = instance.rooms[0].blocks;
    expect(blocks).toHaveLength(16);

    const boxOf = (b) => ({
      minX: b.position[0] - b.size[0] / 2,
      maxX: b.position[0] + b.size[0] / 2,
      minZ: b.position[2] - b.size[2] / 2,
      maxZ: b.position[2] + b.size[2] / 2,
    });
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = boxOf(blocks[i]);
        const b = boxOf(blocks[j]);
        const gapX = Math.max(a.minX - b.maxX, b.minX - a.maxX);
        const gapZ = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ);
        // never touching, and where they line up the gap is a full street wide
        expect(Math.max(gapX, gapZ)).toBeGreaterThanOrEqual(STREET - 1e-9);
      }
    }
    // and each one sits inside the ground
    const ground = instance.rooms[0];
    for (const b of blocks) {
      expect(Math.abs(b.position[0]) + BLOCK / 2).toBeLessThanOrEqual(ground.size[0] / 2);
      expect(Math.abs(b.position[2]) + BLOCK / 2).toBeLessThanOrEqual(ground.size[2] / 2);
    }
  });

  it("taller lots get taller masses, so a building's height shows from the street", () => {
    const { instance } = build({ lots: 2, floorsPerLot: [1, 8] });
    const [low, high] = instance.rooms[0].blocks;
    expect(high.size[1]).toBeGreaterThan(low.size[1]);
  });

  it("every lot gets a door of its own, on the face of its own building", () => {
    const { instance, lots } = build();
    expect(lots).toHaveLength(3);

    const doors = new Set();
    for (const lot of lots) {
      expect(validate(SCHEMA_ID.cityPlanner.lotPlan, lot).ok).toBe(true);
      const portal = instance.portals.find((p) => p.id === lot.doorPortalId);
      expect(portal.roomB).toBe("LINK");
      expect(portal.link).toEqual({
        instanceId: lot.floorInstanceIds[0],
        spawnRoomId: lot.entryRoomId,
        kind: "enter",
      });
      // it names a real building, and that building is the one this lot is about
      expect(instance.rooms[0].blocks.some((b) => b.id === portal.blockId)).toBe(true);
      expect(portal.blockId).toContain(lot.lotId);
      expect(lot.returnRoomId).toBe(instance.rooms[0].id);
      expect(doors.has(lot.doorPortalId)).toBe(false);
      doors.add(lot.doorPortalId);
    }
  });

  it("floorsPerLot sets how tall each building is, repeating its last value", () => {
    const { lots } = build({ lots: 4, floorsPerLot: [3, 1], sizeHint: "large" });
    expect(lots.map((l) => l.floors)).toEqual([3, 1, 1, 1]);
    expect(lots[0].floorInstanceIds).toEqual(["ashgate-b1-f1", "ashgate-b1-f2", "ashgate-b1-f3"]);
  });

  it("there is one spawn and one exit, and the gate is locked until the map is cleared", () => {
    const { instance } = build();
    const exits = instance.portals.filter((p) => p.roomB === "EXIT");
    expect(exits).toHaveLength(1);
    expect(exits[0].lock).toEqual({ rule: "all_cleared" });
    expect(instance.goal).toEqual({ type: "reach_exit", portalId: exits[0].id });
    // the spawn stands on the ground, in the street, not inside a building
    const ground = instance.rooms[0];
    expect(Math.abs(instance.spawn.position[0])).toBeLessThan(ground.size[0] / 2);
    for (const b of ground.blocks) {
      const insideX = Math.abs(instance.spawn.position[0] - b.position[0]) < b.size[0] / 2;
      const insideZ = Math.abs(instance.spawn.position[2] - b.position[2]) < b.size[2] / 2;
      expect(insideX && insideZ).toBe(false);
    }
  });

  it("the same spec and seed lay out the same city every time", () => {
    expect(build({ seed: 7 })).toEqual(build({ seed: 7 }));
  });

  it("refuses more buildings than the lattice has places, and a theme with no kit", () => {
    expect(() => createStreets({ ...spec, sizeHint: "small", lots: 99 }, assetQuery)).toThrowError(
      CitySpecInvalidError
    );
    expect(() => createStreets(spec, () => [])).toThrowError(NoAssetForKindError);
  });

  it("never ships a level the injected validator rejects", () => {
    const rejecting = () => ({ ok: false, checks: [{ name: "doors_walkable", ok: false }] });
    expect(() => createStreets(spec, assetQuery, { validateInstance: rejecting })).toThrowError(
      expect.objectContaining({ code: "LAYOUT_INVALID" })
    );
  });
});
