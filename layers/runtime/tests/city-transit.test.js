// Play-time behaviour of a multi-instance level: doors that lead to ANOTHER instance, gates that
// stay shut until the run has cleared enough, and the blueprint that only ever shows rooms the
// player has actually walked into. Driven through the real runtime against the published city
// fixture (an Adventure of one street plus the buildings on it).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRuntime } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const city = JSON.parse(
  readFileSync(join(HERE, "../../map-state/fixtures/city.adventure.json"), "utf8")
);

// Walk in a straight world direction for `seconds`, one 60th at a time. Yaw 0 looks down -Z, so
// `forward` walks -Z and `back` walks +Z.
function walk(rt, input, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) rt.step(1 / 60, input);
}

// The spawn sits at z=-2, level with the edge of the street join (whose opening spans z=-2..2), so
// the player would scrape the corner walking straight east. Step onto the centre line first.
function toStreetCentre(rt) {
  walk(rt, { back: true }, 0.6);
}

describe("runtime - cross-instance doors, locked gates, blueprint reveal", () => {
  it("walking into a linked door reports the transit once, with the far side to load", () => {
    const transits = [];
    const rt = createRuntime({ onTransit: (t) => transits.push(t) });
    rt.load(city, "street-main"); // spawns at [-3,0,-2] in street-w; door-a is at [-3,0,4]

    walk(rt, { back: true }, 3); // +Z, into the doorway of Ashgate 12
    expect(transits).toHaveLength(1);
    expect(transits[0]).toMatchObject({
      portalId: "door-a",
      from: "street-main",
      fromRoom: "street-w",
      link: { instanceId: "bldg-a-f1", spawnRoomId: "a1-lobby", kind: "enter" },
    });

    walk(rt, { back: true }, 1); // still standing in the door: reported once, not every frame
    expect(transits).toHaveLength(1);
  });

  it("arriving through a door starts the player in the room the door opens onto", () => {
    const rt = createRuntime({});
    rt.load(city, "bldg-a-f2", { spawnRoomId: "a2-landing" });
    expect(rt.getPlayer().currentRoom).toBe("a2-landing");
    expect(rt.getVisitedRooms()).toEqual(["a2-landing"]);
  });

  it("the door you arrived through does not fire again before you step clear of it", () => {
    const transits = [];
    const rt = createRuntime({ onTransit: (t) => transits.push(t) });
    // The stairwell sits on the west wall of a1-back; arriving there puts the player right by it.
    rt.load(city, "bldg-a-f1", { spawnRoomId: "a1-back" });
    walk(rt, {}, 1);
    expect(transits).toEqual([]);
  });

  it("a locked gate is scenery: reach_exit stays unmet until map-state opens it", () => {
    const shut = createRuntime({ isPortalOpen: (id) => id !== "gate-out" });
    shut.load(city, "street-main");
    toStreetCentre(shut);
    walk(shut, { right: true }, 8); // +X across both street rooms, up to the gate at x=18
    expect(shut.getScene().goalMet).toBe(false);

    const open = createRuntime({ isPortalOpen: () => true });
    open.load(city, "street-main");
    toStreetCentre(open);
    walk(open, { right: true }, 8);
    expect(open.getScene().goalMet).toBe(true);
  });

  it("an unanswerable lock fails closed rather than opening the gate", () => {
    const rt = createRuntime({
      isPortalOpen: () => {
        throw new Error("map-state unavailable");
      },
    });
    rt.load(city, "street-main");
    toStreetCentre(rt);
    walk(rt, { right: true }, 8); // reaches the gate; only the throwing lock keeps it shut
    expect(rt.getScene().goalMet).toBe(false);
  });

  it("the blueprint holds only rooms walked into, and marks each door's lock state", () => {
    const rt = createRuntime({ isPortalOpen: (id) => id !== "gate-out" });
    rt.load(city, "street-main");

    let plan = rt.blueprint();
    expect(plan.label).toBe("Ashgate Street");
    expect(plan.mapKind).toBe("street");
    expect(plan.rooms.map((r) => r.id)).toEqual(["street-w"]);
    expect(plan.rooms[0].here).toBe(true);
    expect(plan.doors.map((d) => d.id).sort()).toEqual(["door-a", "street-join"]);
    expect(plan.doors.find((d) => d.id === "door-a")).toMatchObject({
      kind: "enter",
      to: "bldg-a-f1",
      open: true,
    });

    toStreetCentre(rt);
    walk(rt, { right: true }, 4); // east across the join into street-e
    plan = rt.blueprint();
    expect(plan.rooms.map((r) => r.id).sort()).toEqual(["street-e", "street-w"]);
    expect(plan.doors.find((d) => d.id === "gate-out")).toMatchObject({ kind: "exit", open: false });
  });
});
