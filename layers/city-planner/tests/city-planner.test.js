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

  it("a block carries several different premises on a pavement, with roads between blocks", () => {
    const { instance } = build({ sizeHint: "large", lots: undefined });
    const ground = instance.rooms[0];
    const pavements = ground.zones.filter((z) => z.kind === "sidewalk");
    expect(ground.zones.some((z) => z.kind === "road")).toBe(true);
    expect(pavements.length).toBeGreaterThan(1);
    // more premises than blocks: a block is not one slab
    expect(ground.blocks.length).toBeGreaterThan(pavements.length);

    const boxOf = (b) => ({
      minX: b.position[0] - b.size[0] / 2,
      maxX: b.position[0] + b.size[0] / 2,
      minZ: b.position[2] - b.size[2] / 2,
      maxZ: b.position[2] + b.size[2] / 2,
    });
    const inside = (a, o) => a.minX >= o.minX && a.maxX <= o.maxX && a.minZ >= o.minZ && a.maxZ <= o.maxZ;

    for (let i = 0; i < ground.blocks.length; i++) {
      const a = boxOf(ground.blocks[i]);
      // every premises stands on some block's pavement, never in the road
      expect(pavements.some((p) => inside(a, boxOf({ position: p.position, size: [p.size[0], 0, p.size[1]] })))).toBe(true);
      for (let j = i + 1; j < ground.blocks.length; j++) {
        const b = boxOf(ground.blocks[j]);
        const apart = Math.max(a.minX - b.maxX, b.minX - a.maxX, a.minZ - b.maxZ, b.minZ - a.maxZ);
        expect(apart).toBeGreaterThan(0); // never touching, on the same block or across the road
      }
    }
    // and the premises differ: a block of identical boxes is what this replaced
    expect(new Set(ground.blocks.map((b) => `${b.size[0]}x${b.size[1]}x${b.size[2]}`)).size).toBeGreaterThan(1);
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

  it("a sealed building is scenery: it stands there with no door and nothing behind it", () => {
    const { instance, lots } = build({ sizeHint: "large", lots: 6, accessibleRatio: 0.5 });
    expect(instance.rooms[0].blocks).toHaveLength(6);
    expect(lots).toHaveLength(3);

    const withDoors = new Set(instance.portals.filter((p) => p.blockId).map((p) => p.blockId));
    expect(withDoors.size).toBe(3);
    for (const lot of lots) expect(withDoors.has(`mass-${lot.lotId}`)).toBe(true);
    // a city with no way into anything would open its gate at once, so one always opens
    expect(build({ lots: 4, accessibleRatio: 0 }).lots).toHaveLength(1);
  });

  it("a pinned building is built as asked, and the rest is generated around it", () => {
    const pinned = {
      ...spec,
      lots: 5,
      buildings: [
        { block: 1, slot: 2, label: "The Vault", program: "office", floors: 6, quest: { itemId: "ledger" } },
        { block: 0, slot: 0, label: "Boarded up", accessible: false },
      ],
    };
    expect(validate(SCHEMA_ID.cityPlanner.citySpec, pinned).ok).toBe(true);

    const { instance, lots } = createStreets(pinned, assetQuery, { validateInstance: passing });
    expect(lots).toHaveLength(4); // five premises, one of them sealed

    const vault = lots.find((l) => l.label === "The Vault");
    expect(vault).toMatchObject({ floors: 6, program: "office", quest: { itemId: "ledger", floor: 6 } });
    expect(validate(SCHEMA_ID.cityPlanner.lotPlan, vault).ok).toBe(true);

    // the sealed one is a mass on the ground, and nothing else
    const sealed = instance.rooms[0].blocks.find((b) => b.label === "Boarded up");
    expect(sealed).toBeDefined();
    expect(instance.portals.some((p) => p.blockId === sealed.id)).toBe(false);
    expect(lots.some((l) => l.label === "Boarded up")).toBe(false);
  });

  it("refuses a pin it cannot honour", () => {
    const pin = (buildings, over = {}) =>
      createStreets({ ...spec, ...over, buildings }, assetQuery, { validateInstance: passing });
    expect(() => pin([{ block: 99, slot: 0 }])).toThrowError(CitySpecInvalidError);
    expect(() => pin([{ block: 0, slot: 0 }, { block: 0, slot: 0 }])).toThrowError(CitySpecInvalidError);
    // a quest nobody can walk to, and less room than the pins need
    expect(() => pin([{ block: 0, slot: 0, accessible: false, quest: { itemId: "x" } }])).toThrowError(
      CitySpecInvalidError
    );
    expect(() => pin([{ block: 0, slot: 0 }, { block: 1, slot: 1 }], { lots: 1 })).toThrowError(
      CitySpecInvalidError
    );
    expect(() => pin([{ block: 0, slot: 0, floors: 2, quest: { itemId: "x", floor: 4 } }])).toThrowError(
      CitySpecInvalidError
    );
  });

  it("the same spec and seed lay out the same city every time", () => {
    expect(build({ seed: 7 })).toEqual(build({ seed: 7 }));
  });

  it("refuses more buildings than the lattice has places, and a theme with no kit", () => {
    expect(() => createStreets({ ...spec, sizeHint: "small", lots: 999 }, assetQuery)).toThrowError(
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
