import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createRuntime } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const adventure = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);

function fakeRegistry() {
  return {
    get(id) {
      if (id === "kaykit.character.dwarf") return { id, animations: ["idle", "walk", "talk"] };
      if (id === "kaykit.character.skeleton") return { id, animations: ["idle", "walk", "attack", "hit", "die"] };
      const err = new Error(`asset not found: ${id}`);
      err.code = "ASSET_NOT_FOUND";
      throw err;
    },
  };
}

function load(brain) {
  const history = [];
  const rt = createRuntime({
    registry: fakeRegistry(),
    onInteraction: brain,
    onHistoryAppend: (rec) => history.push(rec),
  });
  rt.load(adventure, "inst-001");
  return { rt, history };
}

const CHAT = { type: "chat", playerRef: "player-1", text: "hello" };

describe("runtime.interact (Phase 3, canned brain)", () => {
  it("applies a valid decision: switches mode, raises a bubble, and archives the exchange", () => {
    const { rt, history } = load(() => ({ newMode: "talk", utterance: "Well met, traveler." }));
    const result = rt.interact("npc-smith", CHAT);

    expect(result.newMode).toBe("talk");
    expect(rt.getScene().npcModes["npc-smith"]).toBe("talk");
    expect(rt.getSpeech().get("npc-smith").text).toBe("Well met, traveler.");
    expect(history).toHaveLength(1);
    expect(validate(SCHEMA_ID.narrator.interactionRecord, history[0]).ok).toBe(true);
    expect(history[0].npcId).toBe("npc-smith");
  });

  it("rejects an off-contract mode and falls back to the current mode, silently", () => {
    const { rt } = load(() => ({ newMode: "attack" })); // the smith's allowedModes has no 'attack'
    const result = rt.interact("npc-smith", CHAT);

    expect(result.newMode).toBe("idle"); // fallback: unchanged startMode
    expect(rt.getScene().npcModes["npc-smith"]).toBe("idle");
    expect(rt.getSpeech().get("npc-smith")).toBeNull(); // no bubble on a rejected decision
  });

  it("rejects a target that is not in the assembled context", () => {
    const { rt } = load(() => ({ newMode: "follow", target: "ghost-999" }));
    const result = rt.interact("npc-smith", CHAT);
    expect(result.newMode).toBe("idle"); // follow is allowed, but the target does not exist -> fallback
  });

  it("accepts a valid mode with a real target and resolves it to a destination", () => {
    const { rt } = load(() => ({ newMode: "follow", target: "player-1" }));
    const result = rt.interact("npc-smith", CHAT);
    expect(result.newMode).toBe("follow");
    expect(rt.getNpcState("npc-smith").target).toEqual({ x: 0, z: 0 }); // the player's position
  });

  it("accepts targets the context actually advertises: an exit (portal) or a notable object", () => {
    // p1 is one of the smith's exits; it resolves to the doorway centre.
    const exit = load(() => ({ newMode: "follow", target: "p1" }));
    expect(exit.rt.interact("npc-smith", CHAT).newMode).toBe("follow");
    expect(exit.rt.getNpcState("npc-smith").target).toEqual({ x: 0, z: 3 });

    // obj-anvil-1 is a notable object in the smith's room; it resolves to the anvil's position.
    const obj = load(() => ({ newMode: "follow", target: "obj-anvil-1" }));
    expect(obj.rt.interact("npc-smith", CHAT).newMode).toBe("follow");
    expect(obj.rt.getNpcState("npc-smith").target).toEqual({ x: 1.5, z: 6 });
  });

  it("falls back deterministically when the brain is missing or throws", () => {
    const noBrain = createRuntime({ registry: fakeRegistry() });
    noBrain.load(adventure, "inst-001");
    expect(noBrain.interact("npc-smith", CHAT).newMode).toBe("idle");

    const { rt } = load(() => {
      throw new Error("model unavailable");
    });
    expect(rt.interact("npc-smith", CHAT).newMode).toBe("idle");
  });

  it("applyInteractionResult stays lenient: applies an allowed mode, rejects a disallowed one", () => {
    const { rt } = load(() => ({ newMode: "idle" }));
    // guard CAN attack (allowedModes: patrol/idle/attack/flee)
    rt.applyInteractionResult("npc-guard", { newMode: "attack", target: "player-1", emote: "snarl" });
    expect(rt.getScene().npcModes["npc-guard"]).toBe("attack");
    // smith CANNOT attack -> fallback keeps its current mode
    rt.applyInteractionResult("npc-smith", { newMode: "attack" });
    expect(rt.getScene().npcModes["npc-smith"]).toBe("idle");
  });
});
