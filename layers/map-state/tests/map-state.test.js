import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import {
  buildWorldMap,
  createProgress,
  enterInstance,
  clearInstance,
  visitRoom,
  isVisited,
  doorState,
  exitState,
  unlockedInstances,
  win,
} from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const city = JSON.parse(readFileSync(join(HERE, "../fixtures/city.adventure.json"), "utf8"));

const REQUIRED = ["bldg-a-f1", "bldg-a-f2", "bldg-b-f1"];
const clearAll = (map) => REQUIRED.reduce((p, id) => clearInstance(p, map, id), createProgress(map));

describe("map-state contract", () => {
  it("the city fixture is a schema-valid Adventure and derives a schema-valid WorldMap", () => {
    expect(validate(SCHEMA_ID.persistence.adventure, city).ok).toBe(true);
    const map = buildWorldMap(city);
    const r = validate(SCHEMA_ID.mapState.worldMap, map);
    expect(r.ok, JSON.stringify(r.errors, null, 2)).toBe(true);
  });

  it("derives entry, nodes, cross-instance doors and the exit gate from the Adventure alone", () => {
    const map = buildWorldMap(city);
    expect(map.entry).toBe("street-main");
    expect(map.nodes.map((n) => n.instanceId)).toEqual([
      "street-main",
      "bldg-a-f1",
      "bldg-a-f2",
      "bldg-b-f1",
    ]);
    expect(map.nodes[0].kind).toBe("street");
    expect(map.doors.find((d) => d.portalId === "door-a")).toMatchObject({
      from: "street-main",
      to: "bldg-a-f1",
      kind: "enter",
      lock: null,
    });
    expect(map.doors.find((d) => d.portalId === "stairs-a-up").kind).toBe("stairs_up");
    expect(map.exits).toEqual([
      { portalId: "gate-out", instanceId: "street-main", lock: { rule: "all_cleared" } },
    ]);
  });

  it("the instance holding an all_cleared gate is never required to clear itself", () => {
    expect(buildWorldMap(city).required).toEqual(REQUIRED);
  });

  it("a fresh run is a schema-valid progress standing in the entry instance", () => {
    const map = buildWorldMap(city);
    const p = createProgress(map);
    expect(validate(SCHEMA_ID.mapState.mapProgress, p).ok).toBe(true);
    expect(p).toMatchObject({ entered: ["street-main"], cleared: [], won: false });
  });

  it("the exit gate stays shut until the last required instance is cleared, naming what is left", () => {
    const map = buildWorldMap(city);
    let p = createProgress(map);
    expect(exitState(map, p)).toEqual({ open: false, remaining: REQUIRED, portalId: "gate-out" });

    p = clearInstance(p, map, "bldg-a-f1");
    p = clearInstance(p, map, "bldg-b-f1");
    expect(exitState(map, p)).toEqual({
      open: false,
      remaining: ["bldg-a-f2"],
      portalId: "gate-out",
    });

    p = clearInstance(p, map, "bldg-a-f2");
    expect(exitState(map, p)).toEqual({ open: true, remaining: [], portalId: "gate-out" });
  });

  it("walking into the shut gate refuses with EXIT_LOCKED; the open gate wins the run", () => {
    const map = buildWorldMap(city);
    expect(() => win(createProgress(map), map, "gate-out")).toThrowError(
      expect.objectContaining({ code: "EXIT_LOCKED" })
    );
    expect(win(clearAll(map), map, "gate-out").won).toBe(true);
  });

  it("unlockedInstances lists what the open doors reach, in map order", () => {
    const map = buildWorldMap(city);
    expect(unlockedInstances(map, createProgress(map))).toEqual([
      "street-main",
      "bldg-a-f1",
      "bldg-a-f2",
      "bldg-b-f1",
    ]);
  });

  it("a door locked behind another instance opens only once that instance is cleared", () => {
    const gated = structuredClone(city);
    const doorB = gated.instances[0].portals.find((p) => p.id === "door-b");
    doorB.lock = { rule: "cleared", instanceId: "bldg-a-f1" };
    const map = buildWorldMap(gated);

    let p = createProgress(map);
    expect(doorState(map, p, "door-b")).toEqual({
      open: false,
      rule: "cleared",
      remaining: ["bldg-a-f1"],
    });
    expect(unlockedInstances(map, p)).toEqual(["street-main", "bldg-a-f1", "bldg-a-f2"]);

    p = clearInstance(p, map, "bldg-a-f1");
    expect(doorState(map, p, "door-b").open).toBe(true);
    expect(unlockedInstances(map, p)).toContain("bldg-b-f1");
  });

  it("writes add without mutating the progress they were given", () => {
    const map = buildWorldMap(city);
    const p0 = createProgress(map);
    const p1 = visitRoom(enterInstance(p0, map, "bldg-a-f1"), "bldg-a-f1", "a1-lobby");

    expect(isVisited(p1, "bldg-a-f1", "a1-lobby")).toBe(true);
    expect(isVisited(p1, "bldg-a-f1", "a1-back")).toBe(false);
    expect(p0.entered).toEqual(["street-main"]);
    expect(p0.visitedRooms).toEqual({});
    expect(validate(SCHEMA_ID.mapState.mapProgress, p1).ok).toBe(true);
    expect(visitRoom(p1, "bldg-a-f1", "a1-lobby")).toBe(p1); // already seen: same object back
  });

  it("rejects an unknown instance, an unknown portal, and an Adventure that cannot form a map", () => {
    const map = buildWorldMap(city);
    expect(() => enterInstance(createProgress(map), map, "nowhere")).toThrowError(
      expect.objectContaining({ code: "UNKNOWN_NODE" })
    );
    expect(() => doorState(map, createProgress(map), "no-such-portal")).toThrowError(
      expect.objectContaining({ code: "UNKNOWN_PORTAL" })
    );

    const broken = structuredClone(city);
    broken.instances[0].portals.find((p) => p.id === "door-a").link.instanceId = "bldg-ghost";
    expect(() => buildWorldMap(broken)).toThrowError(
      expect.objectContaining({ code: "MAP_INVALID" })
    );

    const reused = structuredClone(city);
    reused.instances[1].portals.find((p) => p.id === "door-a-out").id = "door-a";
    expect(() => buildWorldMap(reused)).toThrowError(
      expect.objectContaining({ code: "MAP_INVALID" })
    );
  });
});
