import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import {
  composeAdventure,
  initInstance,
  recordInteraction,
  nextInstance,
  progressionShape,
  validateProgression,
} from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);

// Fakes standing in for the delegated layers, at their contracts (never importing their src).
const fakeLayout = {
  id: "inst-001",
  theme: "dungeon",
  rooms: [{ id: "r1", position: [0, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" }],
  portals: [{ id: "px", roomA: "r1", roomB: "EXIT", position: [0, 0, 3], axis: "z", size: [1.5, 2.4] }],
  goal: { type: "reach_exit" },
  spawn: { position: [0, 0, 0], facing: 0 },
};
const fakeScenarioCreator = {
  createInstance: () => ({ instance: structuredClone(fakeLayout), report: { ok: true, checks: [{ name: "no_room_overlap", ok: true }] } }),
};
const fakeNpc = {
  authorNpcs: () => [
    {
      id: "npc-1",
      name: "Guard",
      persona: "A watchful guard.",
      disposition: "neutral",
      allowedModes: ["idle", "patrol"],
      bodyRef: "kit.char",
      homeRoom: "r1",
      spawn: { position: [0, 0, 0], facing: 0 },
      startMode: "idle",
    },
  ],
};

describe("narrator contract", () => {
  it("composeAdventure assembles a schema-valid Adventure and saves it through persistence", () => {
    const persistence = { save: vi.fn(() => ({ id: "adv-composed" })) };
    const brief = {
      universes: ["dungeon fantasy"],
      likedNpcs: ["a guard"],
      tone: "adventurous",
      difficulty: "normal",
      themes: ["dungeon"],
      freeText: "",
      seed: 7,
    };
    const adv = composeAdventure(brief, { scenarioCreator: fakeScenarioCreator, npc: fakeNpc, persistence });

    const r = validate(SCHEMA_ID.persistence.adventure, adv);
    expect(r.ok, JSON.stringify(r.errors, null, 2)).toBe(true);
    expect(persistence.save).toHaveBeenCalledOnce();
    expect(adv.instances[0].npcs).toHaveLength(1);
  });

  it("initInstance yields schema-valid runtime state with each NPC in its start mode", () => {
    const state = initInstance(fixture, "inst-001");
    expect(validate(SCHEMA_ID.narrator.instanceRuntimeState, state).ok).toBe(true);
    const smith = fixture.instances[0].npcs.find((n) => n.id === "npc-smith");
    const smithState = state.npcStates.find((s) => s.npcId === "npc-smith");
    expect(smithState.mode).toBe(smith.startMode);
    expect(smith.allowedModes).toContain(smithState.mode);
  });

  it("recordInteraction appends through the injected persistence", () => {
    const persistence = { appendHistory: vi.fn() };
    const record = {
      instanceId: "inst-001",
      npcId: "npc-smith",
      interaction: { type: "chat", text: "hi", playerRef: "p" },
      result: { newMode: "talk" },
    };
    recordInteraction("adv-example-001", record, { persistence });
    expect(persistence.appendHistory).toHaveBeenCalledWith("adv-example-001", record);
  });

  it("nextInstance is a pure graph read: a met goal on a terminal node ends the adventure", () => {
    const done = nextInstance(fixture, "inst-001", { instanceId: "inst-001", goalMet: true });
    expect(done).toEqual({ done: true });
  });

  it("nextInstance advances along an edge when the goal is met", () => {
    const twoNode = {
      progression: {
        nodes: ["a", "b"],
        edges: [{ from: "a", to: "b", unlock: { instanceId: "a" } }],
        start: "a",
      },
    };
    expect(nextInstance(twoNode, "a", { instanceId: "a", goalMet: true })).toEqual({ instanceId: "b" });
    expect(nextInstance(twoNode, "a", { instanceId: "a", goalMet: false })).toEqual({ instanceId: "a" });
  });

  it("the fixture progression is a valid DAG (one start in nodes, at least one terminal)", () => {
    const shape = progressionShape(fixture.progression);
    expect(shape.startInNodes).toBe(true);
    expect(shape.terminals.length).toBeGreaterThanOrEqual(1);
  });

  it("validateProgression accepts the fixture and rejects an unreachable-node (dead-end) graph", () => {
    expect(validateProgression(fixture.progression).ok).toBe(true);

    const broken = {
      nodes: ["a", "b", "c"],
      edges: [{ from: "a", to: "b", unlock: { instanceId: "a" } }],
      start: "a",
    };
    const report = validateProgression(broken);
    expect(report.ok).toBe(false);
    expect(report.unreachable).toContain("c");
  });

  it("initInstance on an unknown instance id fails with INSTANCE_BUILD_FAILED", () => {
    expect(() => initInstance(fixture, "nope")).toThrowError(
      expect.objectContaining({ code: "INSTANCE_BUILD_FAILED" }),
    );
  });
});
