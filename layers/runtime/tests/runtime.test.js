import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createRuntime, InstanceInvalidError } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);

describe("runtime contract", () => {
  it("the load input (adventure + instanceId) is schema-valid", () => {
    const input = { adventure: fixture, instanceId: "inst-001" };
    expect(validate(SCHEMA_ID.runtime.loadInput, input).ok).toBe(true);
  });

  it("load builds a scene with the instance's rooms, portals, and NPCs", () => {
    const rt = createRuntime();
    const scene = rt.load(fixture, "inst-001");
    expect(scene.rooms).toHaveLength(3);
    expect(scene.portals).toHaveLength(2);
    expect(Object.keys(scene.npcModes)).toEqual(["npc-smith", "npc-guard"]);
    expect(scene.npcModes["npc-guard"]).toBe("patrol");
  });

  it("load of an unknown instance id throws INSTANCE_INVALID", () => {
    const rt = createRuntime();
    expect(() => rt.load(fixture, "nope")).toThrow(InstanceInvalidError);
  });

  it("applying an interaction result changes play-time mode without mutating authored data", () => {
    const rt = createRuntime();
    rt.load(fixture, "inst-001");
    const result = { newMode: "attack", target: "player-1", emote: "snarl" };
    expect(validate(SCHEMA_ID.npc.interactionResult, result).ok).toBe(true);

    rt.applyInteractionResult("npc-guard", result);
    expect(rt.getScene().npcModes["npc-guard"]).toBe("attack");
    // authored data is untouched
    const guard = fixture.instances[0].npcs.find((n) => n.id === "npc-guard");
    expect(guard.startMode).toBe("patrol");
  });

  it("a discover_item goal fires onGoalMet with a schema-valid GoalResult and requests the next instance", () => {
    const onGoalMet = vi.fn();
    const onRequestNextInstance = vi.fn();
    const rt = createRuntime({ onGoalMet, onRequestNextInstance });
    rt.load(fixture, "inst-001");

    expect(rt.evaluateGoal()).toBe(false);
    expect(rt.discover("amulet")).toBe(true);

    expect(onGoalMet).toHaveBeenCalledOnce();
    const [, goalResult] = onGoalMet.mock.calls[0];
    expect(validate(SCHEMA_ID.narrator.goalResult, goalResult).ok).toBe(true);
    expect(onRequestNextInstance).toHaveBeenCalledOnce();
  });
});
