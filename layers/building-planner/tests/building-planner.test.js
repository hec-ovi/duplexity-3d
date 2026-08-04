import { describe, it, expect } from "vitest";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createBuilding, LotPlanInvalidError, NoAssetForKindError } from "../src/index.js";

const assetQuery = ({ kind, theme }) => [{ id: `${theme}.${kind}` }];
const passing = () => ({ ok: true, checks: [{ name: "stub", ok: true }] });

function lotPlan(over = {}) {
  const floors = over.floors ?? 1;
  return {
    lotId: "ashgate-b1",
    label: "Ashgate 12",
    theme: "city",
    program: "apartments",
    floors,
    floorInstanceIds: Array.from({ length: floors }, (_, i) => `ashgate-b1-f${i + 1}`),
    entryRoomId: "entry",
    returnInstanceId: "ashgate",
    returnRoomId: "st-1-0",
    doorPortalId: "door-ashgate-b1",
    footprint: { width: 10, depth: 10 },
    ...over,
  };
}

const build = (over) => createBuilding(lotPlan(over), assetQuery, { validateInstance: passing });

describe("building-planner contract", () => {
  it("builds one schema-valid Instance per floor, under the ids the lot plan fixed", () => {
    const lot = lotPlan({ floors: 3 });
    expect(validate(SCHEMA_ID.cityPlanner.lotPlan, lot).ok).toBe(true);

    const { instances } = createBuilding(lot, assetQuery, { validateInstance: passing });
    expect(instances.map((i) => i.id)).toEqual(lot.floorInstanceIds);
    for (const instance of instances) {
      const r = validate(SCHEMA_ID.persistence.instance, instance);
      expect(r.ok, JSON.stringify(r.errors, null, 2)).toBe(true);
    }
    expect(instances.map((i) => i.rules.floor)).toEqual([1, 2, 3]);
    expect(instances[1].rules.label).toBe("Ashgate 12, floor 2");
  });

  it("the ground floor holds the room the street door opens into, and a way back out", () => {
    const { instances } = build({ floors: 2 });
    const ground = instances[0];
    expect(ground.rooms.some((r) => r.id === "entry")).toBe(true);

    const out = ground.portals.find((p) => p.link?.kind === "leave");
    expect(out.roomA).toBe("entry");
    expect(out.link).toEqual({
      instanceId: "ashgate",
      spawnRoomId: "st-1-0",
      kind: "leave",
    });
  });

  it("stairs pair up: what goes up on one floor comes down into the same room on the other", () => {
    const { instances } = build({ floors: 3 });
    for (let i = 0; i < instances.length - 1; i++) {
      const up = instances[i].portals.find((p) => p.link?.kind === "stairs_up");
      const down = instances[i + 1].portals.find((p) => p.link?.kind === "stairs_down");

      expect(up.link.instanceId).toBe(instances[i + 1].id);
      expect(down.link.instanceId).toBe(instances[i].id);
      // each lands the player in the other floor's stairwell, and that room exists there
      expect(instances[i + 1].rooms.some((r) => r.id === up.link.spawnRoomId)).toBe(true);
      expect(instances[i].rooms.some((r) => r.id === down.link.spawnRoomId)).toBe(true);
      expect(up.roomA).toBe(down.link.spawnRoomId);
      expect(down.roomA).toBe(up.link.spawnRoomId);
    }
    // the top floor has no way further up, the ground floor no way further down
    expect(instances.at(-1).portals.some((p) => p.link?.kind === "stairs_up")).toBe(false);
    expect(instances[0].portals.some((p) => p.link?.kind === "stairs_down")).toBe(false);
  });

  it("doors that leave a floor never share a wall face", () => {
    const { instances } = build({ floors: 3 });
    for (const instance of instances) {
      const leaving = instance.portals.filter((p) => p.roomB === "LINK");
      const faces = leaving.map((p) => `${p.axis}:${p.position[0]},${p.position[2]}`);
      expect(new Set(faces).size).toBe(faces.length);
    }
  });

  it("every floor has something to find, in a room of that floor", () => {
    const { instances } = build({ floors: 2 });
    for (const instance of instances) {
      expect(instance.goal.type).toBe("discover_item");
      const room = instance.rooms.find((r) =>
        (r.inventory ?? []).some((i) => i.itemId === instance.goal.itemId)
      );
      expect(room).toBeDefined();
    }
  });

  it("a caller can set the win condition instead, and then nothing is planted", () => {
    const goal = { type: "survive", seconds: 30 };
    const { instances } = createBuilding(lotPlan(), assetQuery, {
      validateInstance: passing,
      goalFor: () => goal,
    });
    expect(instances[0].goal).toEqual(goal);
    expect(instances[0].rooms.every((r) => r.inventory.length === 0)).toBe(true);
  });

  it("a lot with nowhere to go back to gets a plain way out instead of a link", () => {
    const alone = lotPlan();
    delete alone.returnInstanceId;
    delete alone.returnRoomId;
    expect(validate(SCHEMA_ID.cityPlanner.lotPlan, alone).ok).toBe(true);

    const { instances } = createBuilding(alone, assetQuery, { validateInstance: passing });
    const out = instances[0].portals.find((p) => p.id.endsWith("-out"));
    expect(out.roomB).toBe("EXIT");
    expect(out.link).toBeUndefined();
  });

  it("a one-floor house is a house on the map; a taller lot is floors", () => {
    expect(build({ floors: 1, program: "house" }).instances[0].rules.mapKind).toBe("house");
    expect(build({ floors: 2 }).instances[0].rules.mapKind).toBe("floor");
  });

  it("the same lot plan builds the same building every time", () => {
    expect(build({ floors: 2 })).toEqual(build({ floors: 2 }));
  });

  it("refuses a footprint too small for its program, and a theme with no kit", () => {
    expect(() =>
      createBuilding(lotPlan({ program: "office", footprint: { width: 4, depth: 4 } }), assetQuery)
    ).toThrowError(LotPlanInvalidError);
    expect(() => createBuilding(lotPlan(), () => [])).toThrowError(NoAssetForKindError);
  });

  it("never ships a floor the injected validator rejects", () => {
    const rejecting = () => ({ ok: false, checks: [{ name: "portals_aligned", ok: false }] });
    expect(() =>
      createBuilding(lotPlan({ floors: 2 }), assetQuery, { validateInstance: rejecting })
    ).toThrowError(expect.objectContaining({ code: "LAYOUT_INVALID" }));
  });
});
