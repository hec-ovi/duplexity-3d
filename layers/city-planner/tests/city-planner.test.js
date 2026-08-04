import { describe, it, expect } from "vitest";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createStreets, CitySpecInvalidError, NoAssetForKindError } from "../src/index.js";

// The registry handle is injected, never imported: any object with a `kind` answers.
const assetQuery = ({ kind, theme }) => [{ id: `${theme}.${kind}` }];

const spec = { id: "ashgate", theme: "city", label: "Ashgate", sizeHint: "medium", lots: 3 };

// Stand-in for the injected scenario-creator validator, so these tests can prove the layer calls it
// and refuses to ship what it rejects.
const passing = () => ({ ok: true, checks: [{ name: "stub", ok: true }] });

describe("city-planner contract", () => {
  it("the spec fixture is schema-valid and the street is a valid persistence Instance", () => {
    expect(validate(SCHEMA_ID.cityPlanner.citySpec, spec).ok).toBe(true);
    const { instance } = createStreets(spec, assetQuery, { validateInstance: passing });
    const withNpcs = { ...instance, npcs: [] };
    const r = validate(SCHEMA_ID.persistence.instance, withNpcs);
    expect(r.ok, JSON.stringify(r.errors, null, 2)).toBe(true);
    expect(instance.rules).toEqual({ mapKind: "street", label: "Ashgate" });
  });

  it("segments are packed on a grid, so every join is a shared full wall", () => {
    const { instance } = createStreets(spec, assetQuery, { validateInstance: passing });
    const byId = new Map(instance.rooms.map((r) => [r.id, r]));
    const joins = instance.portals.filter((p) => p.roomB !== "EXIT" && p.roomB !== "LINK");
    expect(joins.length).toBeGreaterThan(0);

    for (const p of joins) {
      const a = byId.get(p.roomA);
      const b = byId.get(p.roomB);
      const axis = p.axis === "x" ? 0 : 2;
      // the two rooms touch exactly on the portal plane
      const gap = Math.abs(a.position[axis] - b.position[axis]);
      expect(gap).toBeCloseTo(a.size[axis], 9);
      expect(p.position[axis]).toBeCloseTo((a.position[axis] + b.position[axis]) / 2, 9);
    }
  });

  it("every lot gets a door of its own that exists in the street", () => {
    const { instance, lots } = createStreets(spec, assetQuery, { validateInstance: passing });
    expect(lots).toHaveLength(3);

    const doors = new Set();
    for (const lot of lots) {
      expect(validate(SCHEMA_ID.cityPlanner.lotPlan, lot).ok).toBe(true);
      const portal = instance.portals.find((p) => p.id === lot.doorPortalId);
      expect(portal).toBeDefined();
      expect(portal.roomB).toBe("LINK");
      expect(portal.link).toEqual({
        instanceId: lot.floorInstanceIds[0],
        spawnRoomId: lot.entryRoomId,
        kind: "enter",
      });
      expect(instance.rooms.some((r) => r.id === lot.returnRoomId)).toBe(true);
      expect(doors.has(lot.doorPortalId)).toBe(false);
      doors.add(lot.doorPortalId);
    }
  });

  it("floorsPerLot sets how tall each building is, repeating its last value", () => {
    const { lots } = createStreets(
      { ...spec, lots: 4, floorsPerLot: [3, 1] },
      assetQuery,
      { validateInstance: passing }
    );
    expect(lots.map((l) => l.floors)).toEqual([3, 1, 1, 1]);
    expect(lots[0].floorInstanceIds).toEqual(["ashgate-b1-f1", "ashgate-b1-f2", "ashgate-b1-f3"]);
  });

  it("there is one entry and one exit, and the gate is locked until the map is cleared", () => {
    const { instance } = createStreets(spec, assetQuery, { validateInstance: passing });
    const exits = instance.portals.filter((p) => p.roomB === "EXIT");
    expect(exits).toHaveLength(1);
    expect(exits[0].lock).toEqual({ rule: "all_cleared" });
    expect(instance.goal).toEqual({ type: "reach_exit", portalId: exits[0].id });
    // the spawn stands inside a real street room
    const room = instance.rooms.find((r) => r.id === "st-0-0");
    expect(instance.spawn.position).toEqual(room.position);
  });

  it("the same spec and seed lay out the same street every time", () => {
    const a = createStreets({ ...spec, seed: 7 }, assetQuery, { validateInstance: passing });
    const b = createStreets({ ...spec, seed: 7 }, assetQuery, { validateInstance: passing });
    expect(b).toEqual(a);
  });

  it("refuses more lots than the road has walls, and a theme with no kit", () => {
    expect(() => createStreets({ ...spec, sizeHint: "small", lots: 99 }, assetQuery)).toThrowError(
      CitySpecInvalidError
    );
    expect(() => createStreets(spec, () => [])).toThrowError(NoAssetForKindError);
  });

  it("never ships a street the injected validator rejects", () => {
    const rejecting = () => ({ ok: false, checks: [{ name: "portals_aligned", ok: false }] });
    expect(() => createStreets(spec, assetQuery, { validateInstance: rejecting })).toThrowError(
      expect.objectContaining({ code: "LAYOUT_INVALID" })
    );
  });
});
