// Full goal evaluation at play-time (no LLM): reach_exit, defeat, survive, unlock_dialog, and the
// sequence/all composites, on top of the existing discover_item. Each is driven through the real
// runtime and latches once met. Also guards the review's edge cases: a spawn-adjacent exit does not
// auto-fire, a start-mode does not satisfy unlock_dialog, an empty composite never auto-wins, and a
// flag goal is winnable via an interaction that sets the flag.
import { describe, it, expect } from "vitest";
import { createRuntime } from "../src/index.js";

const EXIT = { id: "exit-1", roomA: "room-0", roomB: "EXIT", position: [4, 0, 0], axis: "x", size: [1.5, 2.4] };

function npc(over = {}) {
  return {
    id: "npc-1",
    name: "Warden",
    persona: "A warden.",
    disposition: "neutral",
    allowedModes: ["idle", "talk", "dead"],
    bodyRef: "kit.body",
    homeRoom: "room-0",
    spawn: { position: [2, 0, 2], facing: 0 },
    startMode: "idle",
    ...over,
  };
}

function makeAdventure(goal, { npcs = [], portals = [], items = [], id = "inst-1" } = {}) {
  const room = { id: "room-0", position: [0, 0, 0], size: [8, 3, 8], floorKit: "f", wallKit: "w", inventory: items };
  return {
    meta: { id: `adv-${id}`, seed: 1 },
    instances: [{ id, theme: "dungeon", rooms: [room], portals, npcs, goal, spawn: { position: [0, 0, 0], facing: 0 } }],
  };
}

function load(goal, opts) {
  const rt = createRuntime({});
  rt.load(makeAdventure(goal, opts), "inst-1");
  return rt;
}

// Walk the player up to the EXIT portal at x=4: one tick at spawn (far enough to ARM the exit), then
// step in close. The spawn is 4m away, well clear of the 1.5m reach radius.
function reachExit(rt) {
  rt.step(0.016); // at spawn, clear of the exit: arms it
  rt.getPlayer().position.x = 3; // within PORTAL_REACH (1.5m) of the exit centre at x=4
  rt.step(0.016);
}

describe("runtime goal evaluation (Phase 9)", () => {
  it("reach_exit: met once the player walks up to an armed EXIT portal, latched", () => {
    const rt = load({ type: "reach_exit" }, { portals: [EXIT] });
    expect(rt.evaluateGoal()).toBe(false);
    reachExit(rt);
    expect(rt.getScene().goalMet).toBe(true);
    // moving away does not un-meet it
    rt.getPlayer().position.x = 0;
    rt.step(0.016);
    expect(rt.getScene().goalMet).toBe(true);
  });

  it("reach_exit does not fire at spawn when an exit sits next to the spawn point", () => {
    const near = { id: "exit-near", roomA: "room-0", roomB: "EXIT", position: [1, 0, 0], axis: "x", size: [1.5, 2.4] };
    const rt = load({ type: "reach_exit" }, { portals: [near] });
    rt.step(0.016); // spawn [0,0,0] is within 1.5m of the exit centre [1,0,0], but it is not armed yet
    expect(rt.getScene().goalMet).toBe(false);
    rt.getPlayer().position.x = 4;
    rt.step(0.016); // move clear -> arm
    rt.getPlayer().position.x = 1;
    rt.step(0.016); // return -> reached
    expect(rt.getScene().goalMet).toBe(true);
  });

  it("reach_exit with a specific portalId only counts that exit", () => {
    const other = { ...EXIT, id: "exit-2" };
    const rt = load({ type: "reach_exit", portalId: "exit-2" }, { portals: [EXIT, other] });
    reachExit(rt);
    expect(rt.getScene().reachedExits.has("exit-2")).toBe(true);
    expect(rt.evaluateGoal()).toBe(true);
  });

  it("survive: met after enough sim time accrues (never a wall clock)", () => {
    const rt = load({ type: "survive", seconds: 5 });
    for (let i = 0; i < 9; i++) rt.step(0.5); // 4.5s
    expect(rt.getScene().goalMet).toBe(false);
    for (let i = 0; i < 2; i++) rt.step(0.5); // 5.5s
    expect(rt.getScene().goalMet).toBe(true);
  });

  it("defeat: met when the target NPC reaches dead", () => {
    const rt = load({ type: "defeat", npcId: "npc-1" }, { npcs: [npc()] });
    expect(rt.evaluateGoal()).toBe(false);
    rt.applyInteractionResult("npc-1", { newMode: "dead" });
    expect(rt.getScene().goalMet).toBe(true);
  });

  it("unlock_dialog: met once an interaction drives the NPC into the required mode", () => {
    const rt = load({ type: "unlock_dialog", npcId: "npc-1", requiredMode: "talk" }, { npcs: [npc()] });
    expect(rt.evaluateGoal()).toBe(false);
    rt.applyInteractionResult("npc-1", { newMode: "talk", utterance: "Well met." });
    expect(rt.getScene().goalMet).toBe(true);
  });

  it("unlock_dialog does not auto-complete when the required mode is the NPC's start mode", () => {
    const rt = load({ type: "unlock_dialog", npcId: "npc-1", requiredMode: "talk" }, { npcs: [npc({ startMode: "talk" })] });
    expect(rt.evaluateGoal()).toBe(false); // a seeded start mode is not counted
    rt.step(0.016);
    expect(rt.getScene().goalMet).toBe(false); // the passive sim mode is not counted either
    rt.applyInteractionResult("npc-1", { newMode: "idle" });
    rt.applyInteractionResult("npc-1", { newMode: "talk" }); // an interaction now drives it into talk
    expect(rt.getScene().goalMet).toBe(true);
  });

  it("unlock_dialog with a flag is met when an interaction sets that flag", () => {
    const rt = load({ type: "unlock_dialog", npcId: "npc-1", flag: "gave-key" }, { npcs: [npc()] });
    rt.step(0.016);
    expect(rt.getScene().goalMet).toBe(false);
    rt.applyInteractionResult("npc-1", { newMode: "talk", flag: "gave-key" });
    expect(rt.getScene().goalMet).toBe(true);
  });

  it("all: met only when every sub-goal is met, order-independent", () => {
    const rt = load(
      { type: "all", of: [{ type: "discover_item", itemId: "i1" }, { type: "reach_exit" }] },
      { portals: [EXIT], items: [{ itemId: "i1", assetRef: "x", position: [1, 0.5, 1] }] },
    );
    reachExit(rt);
    expect(rt.getScene().goalMet).toBe(false); // item still missing
    rt.discover("i1");
    expect(rt.getScene().goalMet).toBe(true);
  });

  it("sequence: advances a step only when the current one is met, so order matters", () => {
    const rt = load(
      { type: "sequence", steps: [{ type: "discover_item", itemId: "i1" }, { type: "reach_exit" }] },
      { portals: [EXIT], items: [{ itemId: "i1", assetRef: "x", position: [1, 0.5, 1] }] },
    );
    // reaching the exit first (step 2) does NOT complete the sequence while step 1 is unmet
    reachExit(rt);
    expect(rt.getScene().goalMet).toBe(false);
    expect(rt.getScene().seqProgress.get(rt.getScene().goal)).toBe(0);
    // now discover the item (step 1): both steps met, the sequence completes
    rt.discover("i1");
    expect(rt.getScene().goalMet).toBe(true);
  });

  it("an empty composite goal never auto-wins on frame 1", () => {
    const rtAll = load({ type: "all", of: [] });
    rtAll.step(0.016);
    expect(rtAll.getScene().goalMet).toBe(false);
    const rtSeq = load({ type: "sequence", steps: [] });
    rtSeq.step(0.016);
    expect(rtSeq.getScene().goalMet).toBe(false);
  });

  it("interact() archives the interaction under the CURRENT instance even if the goal advance reloads the next", () => {
    const history = [];
    let nextLoaded = false;
    const rt = createRuntime({
      onInteraction: () => ({ newMode: "dead" }),
      onHistoryAppend: (rec) => history.push(rec),
      onRequestNextInstance: () => {
        if (nextLoaded) return;
        nextLoaded = true;
        rt.load(makeAdventure({ type: "survive", seconds: 99 }, { npcs: [npc({ id: "npc-2" })], id: "inst-2" }), "inst-2");
      },
    });
    rt.load(makeAdventure({ type: "defeat", npcId: "npc-1" }, { npcs: [npc()] }), "inst-1");

    rt.interact("npc-1", { type: "gesture", gesture: "attack", playerRef: "player-1" });

    expect(history).toHaveLength(1);
    expect(history[0].instanceId).toBe("inst-1"); // not the synchronously-reloaded inst-2
    expect(history[0].id).toBe("inst-1:npc-1:1");
  });
});
