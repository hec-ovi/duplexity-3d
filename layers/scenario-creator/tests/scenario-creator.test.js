import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createInstance, validateLayout } from "../src/index.js";
import { defaultGraphGen } from "../src/graph-gen.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(HERE, "../fixtures/instance-spec.json"), "utf8"));
const generatedFixture = JSON.parse(readFileSync(join(HERE, "../fixtures/instance.generated.json"), "utf8"));

// stand-in for the injected asset-registry.query handle (a function, never an import)
const fakeQuery = (q) => [{ id: `${q.theme}.${q.kind}`, kind: q.kind }];

const portalJoins = (instance, a, b) =>
  instance.portals.some((p) => (p.roomA === a && p.roomB === b) || (p.roomA === b && p.roomB === a));

describe("scenario-creator contract", () => {
  it("the instance-spec fixture is schema-valid", () => {
    expect(validate(SCHEMA_ID.scenarioCreator.instanceSpec, spec).ok).toBe(true);
  });

  it("createInstance returns a schema-valid layout and a passing ValidationReport", () => {
    const { instance, report } = createInstance(spec, fakeQuery);
    expect(validate(SCHEMA_ID.scenarioCreator.instance, instance).ok, JSON.stringify(instance)).toBe(
      true,
    );
    expect(validate(SCHEMA_ID.scenarioCreator.validationReport, report).ok).toBe(true);
    expect(report.ok).toBe(true);
    expect(instance.id).toBe(spec.id);
  });

  it("the geometry validator rejects overlapping rooms (adversarial fixture)", () => {
    const bad = {
      id: "x",
      theme: "t",
      rooms: [
        { id: "a", position: [0, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
        { id: "b", position: [1, 0, 1], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
      ],
      portals: [],
    };
    const report = validateLayout(bad);
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === "no_room_overlap").ok).toBe(false);
  });

  it("the injected asset query drives kit selection (dependency injection, not import)", () => {
    const { instance } = createInstance(spec, fakeQuery);
    expect(instance.rooms[0].floorKit).toBe("dungeon.room-floor");
    expect(instance.rooms[0].wallKit).toBe("dungeon.wall");
  });
});

describe("scenario-creator - abstract graph (the LLM stand-in)", () => {
  it("the default graph generator emits a schema-valid room-adjacency graph", () => {
    const graph = defaultGraphGen(spec, 0);
    expect(validate(SCHEMA_ID.scenarioCreator.roomGraph, graph).ok, JSON.stringify(graph)).toBe(true);
    expect(graph.entry).toBe(graph.rooms[0].id);
    expect(graph.goalRoom).toBe(graph.rooms.at(-1).id);
  });
});

describe("scenario-creator - the four geometry invariants hold on a generated layout", () => {
  it("proves no overlap, full connectivity, aligned portals, and a reachable goal", () => {
    const { instance, report } = createInstance(spec, fakeQuery);
    const named = Object.fromEntries(report.checks.map((c) => [c.name, c.ok]));
    expect(named.no_room_overlap).toBe(true);
    expect(named.full_connectivity).toBe(true);
    expect(named.portals_aligned).toBe(true);
    expect(named.goal_reachable).toBe(true);
    // the discover_item goal target actually sits in a room the layout advertises.
    const itemRooms = instance.rooms.filter((r) => (r.inventory ?? []).some((i) => i.itemId === instance.goal.itemId));
    expect(itemRooms).toHaveLength(1);
  });

  it("is deterministic: the same spec lays out identically", () => {
    const a = createInstance(spec, fakeQuery).instance;
    const b = createInstance(spec, fakeQuery).instance;
    expect(a).toEqual(b);
  });

  it("reproduces the committed golden fixture (staleness guard)", () => {
    const { instance } = createInstance(spec, fakeQuery);
    expect(instance).toEqual(generatedFixture);
  });

  it("the committed layout is loadable as a persistence Instance once npcs are folded in", () => {
    const asInstance = { ...generatedFixture, npcs: [] };
    expect(validate(SCHEMA_ID.persistence.instance, asInstance).ok, JSON.stringify(validate(SCHEMA_ID.persistence.instance, asInstance).errors)).toBe(true);
    expect(validateLayout(generatedFixture).ok).toBe(true);
  });
});

describe("scenario-creator - the validator rejects broken geometry (adversarial fixtures)", () => {
  it("rejects a portal not aligned on a shared wall", () => {
    const bad = {
      id: "x",
      theme: "t",
      rooms: [
        { id: "a", position: [0, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
        { id: "b", position: [6, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
      ],
      // the shared wall is x=3; this portal floats at x=2, on neither room's wall.
      portals: [{ id: "p1", roomA: "a", roomB: "b", position: [2, 0, 0], axis: "x", size: [1.5, 2.4] }],
    };
    const report = validateLayout(bad);
    expect(report.checks.find((c) => c.name === "portals_aligned").ok).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("holds a one-sided door (EXIT, or LINK into another instance) to the wall it does have", () => {
    // One room, 6x6 at the origin: its west wall is x=-3. A door leading somewhere else still has to
    // sit on that wall, and still has to be a hole the runtime can cut.
    const mk = (roomB, x, extra = {}) => ({
      id: "x",
      theme: "t",
      rooms: [{ id: "a", position: [0, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" }],
      portals: [
        { id: "p1", roomA: "a", roomB, position: [x, 0, 0], axis: "x", size: [1.5, 2.4], ...extra },
      ],
      spawn: { position: [0, 0, 0], facing: 0 },
    });
    const link = { link: { instanceId: "other", kind: "enter" } };

    expect(validateLayout(mk("LINK", -3, link)).ok).toBe(true);
    expect(validateLayout(mk("EXIT", -3)).ok).toBe(true);
    // floating off the wall: rejected the same way a room-to-room portal would be.
    expect(
      validateLayout(mk("LINK", -1, link)).checks.find((c) => c.name === "portals_aligned").ok
    ).toBe(false);
    // it joins no rooms, so it can never stand in for connectivity.
    expect(validateLayout(mk("LINK", -3, link)).checks.find((c) => c.name === "full_connectivity").ok).toBe(true);
  });

  it("checks open ground: buildings inside the level, clear of each other, doors on a face you can reach", () => {
    // 40x40 of open ground with one 12x12 building at the origin, and a door on its west face.
    const ground = (over = {}) => ({
      id: "open",
      theme: "city",
      rooms: [
        {
          id: "ground",
          position: [0, 0, 0],
          size: [40, 20, 40],
          floorKit: "f",
          wallKit: "w",
          open: true,
          blocks: [{ id: "m1", position: [0, 0, 0], size: [12, 15, 12] }],
          ...over.room,
        },
      ],
      portals: [
        {
          id: "d1",
          roomA: "ground",
          roomB: "LINK",
          blockId: "m1",
          position: [-6, 0, 0],
          axis: "x",
          size: [2, 3],
          link: { instanceId: "inside", kind: "enter" },
          ...over.portal,
        },
      ],
      spawn: { position: [-18, 0, 0], facing: 0 },
      goal: { type: "survive", seconds: 5 },
    });
    const check = (inst, name) => validateLayout(inst).checks.find((c) => c.name === name).ok;

    expect(validateLayout(ground()).ok).toBe(true);

    // a building hanging over the edge of the level
    expect(
      check(ground({ room: { blocks: [{ id: "m1", position: [18, 0, 0], size: [12, 15, 12] }] } }), "blocks_inside_rooms")
    ).toBe(false);

    // two buildings in the same place
    expect(
      check(
        ground({
          room: {
            blocks: [
              { id: "m1", position: [0, 0, 0], size: [12, 15, 12] },
              { id: "m2", position: [4, 0, 0], size: [12, 15, 12] },
            ],
          },
        }),
        "blocks_do_not_overlap"
      )
    ).toBe(false);

    // a door floating beside its building instead of on it
    expect(check(ground({ portal: { position: [-9, 0, 0] } }), "block_doors_on_a_face")).toBe(false);
    // a door naming a building that is not there
    expect(check(ground({ portal: { blockId: "ghost" } }), "block_doors_on_a_face")).toBe(false);

    // a second building parked across the only way to that door: nothing is misaligned, but you
    // cannot get there, which only a walk of the open floor can tell you.
    const walled = ground({
      room: {
        blocks: [
          { id: "m1", position: [0, 0, 0], size: [12, 15, 12] },
          { id: "wall-off", position: [-10, 0, 0], size: [2, 15, 40] },
        ],
      },
    });
    expect(check(walled, "blocks_do_not_overlap")).toBe(true);
    expect(check(walled, "doors_walkable")).toBe(false);
  });

  it("rejects a one-sided door put on an interior wall, where only one side would be cut open", () => {
    // Two rooms sharing the wall at x=3. A door leading to another instance placed THERE would be
    // cut out of one room's wall and not the other's, since shared walls are deduped by geometry.
    const bad = {
      id: "x",
      theme: "t",
      rooms: [
        { id: "a", position: [0, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
        { id: "b", position: [6, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
      ],
      portals: [
        { id: "join", roomA: "a", roomB: "b", position: [3, 0, 0], axis: "x", size: [1.5, 2.4] },
        {
          id: "stairs",
          roomA: "a",
          roomB: "LINK",
          position: [3, 0, 2],
          axis: "x",
          size: [1.2, 2.4],
          link: { instanceId: "floor-2", kind: "stairs_up" },
        },
      ],
      spawn: { position: [0, 0, 0], facing: 0 },
    };
    const report = validateLayout(bad);
    expect(report.checks.find((c) => c.name === "one_sided_portals_outer").ok).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("rejects a degenerate zero-width portal the runtime would leave sealed", () => {
    // The shared wall is x=3 and the plane/span/height are all fine, but a width <= the runtime's
    // cut gate (subtractOpenings' 1e-3 EPS) means the doorway is never actually cut: a solid wall.
    const mk = (width) => ({
      id: "x",
      theme: "t",
      rooms: [
        { id: "a", position: [0, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
        { id: "b", position: [6, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
      ],
      portals: [{ id: "p1", roomA: "a", roomB: "b", position: [3, 0, 0], axis: "x", size: [width, 2.4] }],
    });
    expect(validateLayout(mk(0)).checks.find((c) => c.name === "portals_aligned").ok).toBe(false);
    expect(validateLayout(mk(0.001)).checks.find((c) => c.name === "portals_aligned").ok).toBe(false);
    // a real doorway on the same wall is still accepted (no over-rejection).
    expect(validateLayout(mk(1.5)).checks.find((c) => c.name === "portals_aligned").ok).toBe(true);
  });

  it("rejects a layout with an unreachable room", () => {
    const bad = {
      id: "x",
      theme: "t",
      rooms: [
        { id: "a", position: [0, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
        { id: "b", position: [40, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
      ],
      portals: [], // b is disconnected from the spawn room a
      spawn: { position: [0, 0, 0], facing: 0 },
      goal: { type: "reach_exit" },
    };
    const report = validateLayout(bad);
    expect(report.checks.find((c) => c.name === "full_connectivity").ok).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("rejects a goal whose target sits in an unreachable room", () => {
    const bad = {
      id: "x",
      theme: "t",
      rooms: [
        { id: "a", position: [0, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
        {
          id: "b",
          position: [40, 0, 0],
          size: [6, 3, 6],
          floorKit: "f",
          wallKit: "w",
          inventory: [{ itemId: "amulet", position: [40, 0.6, 0] }],
        },
      ],
      portals: [], // the amulet's room is unreachable
      spawn: { position: [0, 0, 0], facing: 0 },
      goal: { type: "discover_item", itemId: "amulet" },
    };
    const report = validateLayout(bad);
    expect(report.checks.find((c) => c.name === "goal_reachable").ok).toBe(false);
  });
});

describe("scenario-creator - regenerate-on-reject and the never-hard-fail fallback", () => {
  it("regenerates when the graph generator returns an invalid graph, then solves the valid one", () => {
    let calls = 0;
    const flaky = () => {
      calls += 1;
      if (calls === 1) return { rooms: [{ id: "a" }], edges: [["a", "ghost"]], entry: "a" }; // dangling edge
      return {
        rooms: [{ id: "r0", role: "entry" }, { id: "r1" }, { id: "r2", role: "goal" }],
        edges: [["r0", "r1"], ["r1", "r2"]],
        entry: "r0",
        goalRoom: "r2",
      };
    };
    const { instance, report } = createInstance(spec, fakeQuery, { graphGen: flaky });
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(report.ok).toBe(true);
    expect(instance.rooms).toHaveLength(3);
  });

  it("never hard-fails on geometry: a hopeless generator still yields a valid fallback layout", () => {
    const garbage = () => ({ nonsense: true });
    const { instance, report } = createInstance(spec, fakeQuery, { graphGen: garbage, maxAttempts: 3 });
    expect(report.ok).toBe(true);
    expect(instance.rooms.length).toBeGreaterThanOrEqual(1);
  });

  it("throws NO_ASSET_FOR_KIND when the theme lacks a required kit piece", () => {
    const noWall = (q) => (q.kind === "wall" ? [] : [{ id: `${q.theme}.${q.kind}` }]);
    let code;
    try {
      createInstance(spec, noWall);
    } catch (e) {
      code = e.code;
    }
    expect(code).toBe("NO_ASSET_FOR_KIND");
  });
});

describe("scenario-creator - loops close when the geometry allows", () => {
  it("realises a 4-cycle graph as a closed loop of doorways", () => {
    const cycle = () => ({
      rooms: [
        { id: "r0", role: "entry" },
        { id: "r1" },
        { id: "r2" },
        { id: "r3", role: "goal" },
      ],
      edges: [["r0", "r1"], ["r1", "r2"], ["r2", "r3"], ["r3", "r0"]],
      entry: "r0",
      goalRoom: "r3",
    });
    const { instance, report } = createInstance(spec, fakeQuery, { graphGen: cycle });
    expect(report.ok).toBe(true);
    // all four edges become doorways, so the ring closes (r3 back to r0).
    expect(portalJoins(instance, "r3", "r0")).toBe(true);
    expect(portalJoins(instance, "r0", "r1")).toBe(true);
  });
});
