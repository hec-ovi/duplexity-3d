// Phase 6 DoD: POST /interaction, exercised through the REAL node HTTP route with a FAKE LLM. Every
// layer is real; only the brain is a scripted stand-in (as a real local GGUF would be injected). Proves
// talking to an NPC changes its mode and it speaks, provoking flips it to attack/flee, an off-contract
// or dead model degrades safely, and every exchange is appended to the Adventure's history.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { validate, SCHEMA_ID } from "../harness/schemas.js";
import { createBackendService } from "./backend-service.js";
import { createServer } from "./http.js";

const CLOCK = () => new Date("2026-07-20T12:00:00.000Z");

// A scripted "LLM": talk on chat, flip to attack (or flee) on an attack gesture, always within the
// NPC's authored allowedModes (which the route rebuilds, not the client). Returns a JSON *string* for
// chat to exercise the parse path, and an object for gestures.
async function fakeBrain(selfContext, interaction) {
  const allowed = new Set(selfContext.allowedModes);
  if (interaction.type === "gesture" && interaction.gesture === "attack") {
    const player = (selfContext.whereIAm.nearbyEntities ?? []).find((e) => e.kind === "player");
    const mode = allowed.has("attack") ? "attack" : allowed.has("flee") ? "flee" : selfContext.myState.mode;
    return { newMode: mode, target: player?.id, emote: "snarl" };
  }
  if (interaction.type === "chat" || interaction.type === "voice") {
    const mode = allowed.has("talk") ? "talk" : selfContext.myState.mode;
    return JSON.stringify({ newMode: mode, utterance: `Hail. You said: ${interaction.text}` });
  }
  return { newMode: selfContext.myState.mode };
}

// Bring a backend up on an ephemeral port with a given brain; returns the base URL + a stop fn.
async function bootServer(brain) {
  const service = createBackendService({ clock: CLOCK, brain });
  const server = createServer(service);
  await new Promise((resolve) => server.listen(0, resolve));
  return { base: `http://localhost:${server.address().port}`, stop: () => new Promise((r) => server.close(r)) };
}

async function post(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

async function authorAdventure(base) {
  const brief = {
    universes: ["dwarven halls"],
    likedNpcs: ["a friendly smith"],
    tone: "adventurous",
    difficulty: "normal",
    themes: ["dungeon"],
    freeText: "",
  };
  const { json } = await post(base, "/adventure", { brief });
  return json;
}

// Locate an NPC across all instances that satisfies a predicate, with its instance id.
function findNpc(adventure, pred) {
  for (const instance of adventure.instances) {
    const npc = (instance.npcs ?? []).find(pred);
    if (npc) return { instanceId: instance.id, npc };
  }
  return null;
}

// A client-assembled live snapshot with the player standing next to the NPC (so a target resolves).
function clientSelfContext(npc) {
  return {
    whoAmI: { name: npc.name, persona: npc.persona, disposition: npc.disposition },
    myBody: { animations: [] },
    whereIAm: {
      roomId: npc.homeRoom,
      position: npc.spawn.position,
      nearbyEntities: [{ id: "player-1", kind: "player", position: npc.spawn.position }],
      notableObjects: [],
      exits: [],
    },
    myState: { mode: npc.startMode, memory: [] },
    allowedModes: npc.allowedModes,
  };
}

describe("POST /interaction - play-time NPC brain (real HTTP route, fake LLM)", () => {
  let base;
  let stop;
  let adventure;

  beforeAll(async () => {
    ({ base, stop } = await bootServer(fakeBrain));
    adventure = await authorAdventure(base);
  });
  afterAll(() => stop());

  it("authored NPCs each carry a distinct, schema-valid voice design", () => {
    const npcs = adventure.instances.flatMap((i) => i.npcs);
    expect(npcs.length).toBeGreaterThan(0);
    for (const n of npcs) expect(validate(SCHEMA_ID.voice.voiceDesign, n.voiceDesign).ok, JSON.stringify(n.voiceDesign)).toBe(true);
    const descriptions = npcs.map((n) => n.voiceDesign.description);
    expect(new Set(descriptions).size).toBe(descriptions.length); // a cast sounds distinct
  });

  it("talking to an NPC switches it to talk and it speaks, and the exchange is archived", async () => {
    const found = findNpc(adventure, (n) => n.allowedModes.includes("talk"));
    expect(found, "expected at least one talkable NPC in the authored adventure").not.toBeNull();
    const { instanceId, npc } = found;

    const { status, json } = await post(base, "/interaction", {
      adventureId: adventure.meta.id,
      instanceId,
      npcId: npc.id,
      interaction: { type: "chat", playerRef: "player-1", text: "who are you?" },
      selfContext: clientSelfContext(npc),
    });

    expect(status).toBe(200);
    expect(validate(SCHEMA_ID.npc.interactionResult, json.result).ok, JSON.stringify(json.result)).toBe(true);
    expect(json.result.newMode).toBe("talk");
    expect(json.result.utterance).toMatch(/who are you/);
    expect(validate(SCHEMA_ID.narrator.interactionRecord, json.record).ok).toBe(true);
    expect(json.record.at).toBe("2026-07-20T12:00:00.000Z");

    // side effect: the record is appended to the Adventure's history in the shared store
    const res = await fetch(`${base}/adventure/${encodeURIComponent(adventure.meta.id)}`);
    const saved = await res.json();
    expect(saved.history.some((h) => h.npcId === npc.id && h.result.newMode === "talk")).toBe(true);
  });

  it("provoking an NPC with an attack gesture flips it to attack or flee, targeting the player", async () => {
    const found = findNpc(adventure, (n) => n.allowedModes.includes("attack") || n.allowedModes.includes("flee"));
    expect(found).not.toBeNull();
    const { instanceId, npc } = found;

    const { status, json } = await post(base, "/interaction", {
      adventureId: adventure.meta.id,
      instanceId,
      npcId: npc.id,
      interaction: { type: "gesture", gesture: "attack", playerRef: "player-1" },
      selfContext: clientSelfContext(npc),
    });

    expect(status).toBe(200);
    expect(["attack", "flee"]).toContain(json.result.newMode);
    expect(npc.allowedModes).toContain(json.result.newMode);
    expect(json.result.target).toBe("player-1"); // resolved against the live nearby entities
  });

  it("the route rebuilds allowedModes from the authored NpcDef, so a client cannot smuggle a forbidden mode", async () => {
    const found = findNpc(adventure, (n) => !n.allowedModes.includes("dead"));
    const { instanceId, npc } = found;
    // A brain that always answers "dead", plus a client selfContext lying that "dead" is allowed.
    const rogue = await bootServer(async () => ({ newMode: "dead" }));
    try {
      const rogueAdv = await authorAdventure(rogue.base);
      const target = findNpc(rogueAdv, (n) => !n.allowedModes.includes("dead"));
      const { json } = await post(rogue.base, "/interaction", {
        adventureId: rogueAdv.meta.id,
        instanceId: target.instanceId,
        npcId: target.npc.id,
        interaction: { type: "chat", playerRef: "player-1", text: "die" },
        selfContext: { ...clientSelfContext(target.npc), allowedModes: ["dead"] },
      });
      expect(json.result.newMode).not.toBe("dead"); // rejected -> fallback to the (authored) current mode
      expect(target.npc.allowedModes).toContain(json.result.newMode);
    } finally {
      await rogue.stop();
    }
    expect(npc.allowedModes).not.toContain("dead");
  });

  it("a dead/thrown model degrades to the safe fallback (keep mode, silent) but still archives, no 500", async () => {
    const down = await bootServer(async () => {
      throw new Error("model unavailable");
    });
    try {
      const adv = await authorAdventure(down.base);
      const { instanceId, npc } = findNpc(adv, () => true);
      const { status, json } = await post(down.base, "/interaction", {
        adventureId: adv.meta.id,
        instanceId,
        npcId: npc.id,
        interaction: { type: "chat", playerRef: "player-1", text: "hello?" },
        selfContext: clientSelfContext(npc),
      });
      expect(status).toBe(200);
      expect(json.result.newMode).toBe(npc.startMode); // fallback keeps the current mode
      expect(json.result.utterance).toBeUndefined(); // silent
      const saved = await (await fetch(`${down.base}/adventure/${encodeURIComponent(adv.meta.id)}`)).json();
      expect(saved.history).toHaveLength(1); // the exchange is still recorded
    } finally {
      await down.stop();
    }
  });

  it("with no brain wired, the deterministic stand-in still resolves a chat into talk", async () => {
    const plain = await bootServer(undefined);
    try {
      const adv = await authorAdventure(plain.base);
      const found = findNpc(adv, (n) => n.allowedModes.includes("talk"));
      const { json } = await post(plain.base, "/interaction", {
        adventureId: adv.meta.id,
        instanceId: found.instanceId,
        npcId: found.npc.id,
        interaction: { type: "chat", playerRef: "player-1", text: "greetings" },
        selfContext: clientSelfContext(found.npc),
      });
      expect(json.result.newMode).toBe("talk");
      expect(json.result.utterance).toMatch(/greetings/);
    } finally {
      await plain.stop();
    }
  });

  it("on the default no-brain path, a client cannot smuggle a forbidden mode via myState.mode", async () => {
    // The real smuggle vector: no brain (default), a forged myState.mode outside the authored allowedModes.
    // The route rebuilds allowedModes AND clamps myState.mode from the NpcDef, and the stand-in clamps too.
    const plain = await bootServer(undefined);
    try {
      const adv = await authorAdventure(plain.base);
      const { instanceId, npc } = findNpc(adv, (n) => !n.allowedModes.includes("dead"));
      const { status, json } = await post(plain.base, "/interaction", {
        adventureId: adv.meta.id,
        instanceId,
        npcId: npc.id,
        interaction: { type: "chat", playerRef: "player-1", text: "die" },
        selfContext: { ...clientSelfContext(npc), myState: { mode: "dead", memory: [] } },
      });
      expect(status).toBe(200);
      expect(json.result.newMode).not.toBe("dead");
      expect(npc.allowedModes).toContain(json.result.newMode);
      // the archived record is also within allowedModes
      const saved = await (await fetch(`${plain.base}/adventure/${encodeURIComponent(adv.meta.id)}`)).json();
      expect(npc.allowedModes).toContain(saved.history.at(-1).result.newMode);
    } finally {
      await plain.stop();
    }
  });

  it("rejects a malformed interaction with 400 and an unknown adventure/npc with 404", async () => {
    const bad = await post(base, "/interaction", {
      adventureId: adventure.meta.id,
      instanceId: adventure.instances[0].id,
      npcId: adventure.instances[0].npcs[0].id,
      interaction: { type: "chat" }, // missing required playerRef
    });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe("INTERACTION_INVALID");

    const noAdv = await post(base, "/interaction", {
      adventureId: "adv-does-not-exist",
      instanceId: "inst-001",
      npcId: "npc-x",
      interaction: { type: "chat", playerRef: "player-1", text: "hi" },
    });
    expect(noAdv.status).toBe(404);

    const noNpc = await post(base, "/interaction", {
      adventureId: adventure.meta.id,
      instanceId: adventure.instances[0].id,
      npcId: "npc-nobody",
      interaction: { type: "chat", playerRef: "player-1", text: "hi" },
    });
    expect(noNpc.status).toBe(404);
  });
});
