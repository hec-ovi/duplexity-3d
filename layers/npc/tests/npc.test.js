import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import {
  authorNpcs,
  resolveInteraction,
  sanitizeDecision,
  buildInteractionPrompt,
  fallbackDecision,
  composeVoiceDesign,
} from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const selfContext = JSON.parse(readFileSync(join(HERE, "../fixtures/self-context.json"), "utf8"));

describe("npc contract", () => {
  it("the self-context fixture is schema-valid", () => {
    expect(validate(SCHEMA_ID.npc.selfContext, selfContext).ok).toBe(true);
  });

  it("a provoke gesture flips to attack (or flee) and stays within allowedModes", () => {
    const interaction = { type: "gesture", gesture: "attack", playerRef: "player-1" };
    expect(validate(SCHEMA_ID.npc.interaction, interaction).ok).toBe(true);

    const result = resolveInteraction(selfContext, interaction);
    expect(validate(SCHEMA_ID.npc.interactionResult, result).ok).toBe(true);
    expect(selfContext.allowedModes).toContain(result.newMode);
    expect(["attack", "flee"]).toContain(result.newMode);
    expect(result.target).toBe("player-1");
  });

  it("chat with a talker returns talk mode and echoes the player's text", () => {
    const talker = {
      ...selfContext,
      whoAmI: { ...selfContext.whoAmI, name: "Bruk" },
      allowedModes: ["idle", "talk"],
      myState: { mode: "idle" },
    };
    const interaction = { type: "chat", text: "who are you?", playerRef: "player-1" };
    const result = resolveInteraction(talker, interaction);
    expect(validate(SCHEMA_ID.npc.interactionResult, result).ok).toBe(true);
    expect(result.newMode).toBe("talk");
    expect(result.utterance).toMatch(/who are you/);
  });

  it("never returns a mode the NPC is not allowed, even when provoked", () => {
    const pacifist = { ...selfContext, allowedModes: ["idle", "flee"], myState: { mode: "idle" } };
    const result = resolveInteraction(pacifist, {
      type: "gesture",
      gesture: "attack",
      playerRef: "p",
    });
    expect(pacifist.allowedModes).toContain(result.newMode);
    expect(result.newMode).not.toBe("attack");
  });

  it("authorNpcs builds schema-valid NpcDefs whose startMode is within allowedModes", () => {
    const ctx = { id: "inst-001", theme: "dungeon", rooms: [{ id: "room-1" }] };
    const roster = {
      count: 2,
      roles: [{ role: "guard", disposition: "hostile" }, { role: "smith" }],
    };
    expect(validate(SCHEMA_ID.npc.rosterSpec, roster).ok).toBe(true);

    const npcs = authorNpcs(ctx, roster);
    expect(npcs).toHaveLength(2);
    for (const n of npcs) {
      expect(validate(SCHEMA_ID.npc.npcDef, n).ok, JSON.stringify(n)).toBe(true);
      expect(n.allowedModes).toContain(n.startMode);
    }
  });
});

describe("npc.authorNpcs - author-time with a real body (Phase 5)", () => {
  const registryQuery = (q) => {
    const chars = [
      { id: "kaykit.character.skeleton", kind: "character", theme: "dungeon", animations: ["idle", "walk", "attack", "hit", "die"] },
      { id: "kaykit.character.dwarf", kind: "character", theme: "dungeon", animations: ["idle", "walk", "talk"] },
    ];
    return chars.filter((c) => (!q.kind || c.kind === q.kind) && (!q.theme || c.theme === q.theme));
  };
  const ctx = {
    id: "inst-001",
    theme: "dungeon",
    rooms: [
      { id: "room-0", position: [0, 0, 0], size: [6, 3, 6] },
      { id: "room-1", position: [6, 0, 6], size: [6, 3, 6] },
    ],
  };

  it("picks a real registry body and bounds allowedModes by that body's animation clips", () => {
    const roster = { count: 2, roles: [{ role: "guard", disposition: "hostile" }, { role: "smith", disposition: "friendly" }] };
    const npcs = authorNpcs(ctx, roster, { assetQuery: registryQuery });
    expect(npcs).toHaveLength(2);
    for (const n of npcs) {
      expect(validate(SCHEMA_ID.npc.npcDef, n).ok, JSON.stringify(n)).toBe(true);
      expect(n.allowedModes).toContain(n.startMode);
    }
    // npc 0 -> skeleton: has an attack clip but no talk clip
    expect(npcs[0].bodyRef).toBe("kaykit.character.skeleton");
    expect(npcs[0].allowedModes).not.toContain("talk");
    // npc 1 -> dwarf: has a talk clip but no attack clip, so it can never get an attack mode
    expect(npcs[1].bodyRef).toBe("kaykit.character.dwarf");
    expect(npcs[1].allowedModes).not.toContain("attack");
  });

  it("spawns each NPC inside its home room rather than at the world origin", () => {
    const npcs = authorNpcs(ctx, { count: 2, roles: [{ role: "guard" }] }, { assetQuery: registryQuery });
    for (const n of npcs) {
      const home = ctx.rooms.find((r) => r.id === n.homeRoom);
      expect(home).toBeTruthy();
      const [x, , z] = n.spawn.position;
      expect(Math.abs(x - home.position[0])).toBeLessThanOrEqual(home.size[0] / 2);
      expect(Math.abs(z - home.position[2])).toBeLessThanOrEqual(home.size[2] / 2);
    }
  });

  it("scatters a cast over a big room instead of piling it on one spot", () => {
    // One open room the size of a city block: everyone standing on the same tile would be wrong.
    const street = {
      id: "street",
      theme: "city",
      rooms: [{ id: "ground", position: [0, 0, 0], size: [80, 6, 80] }],
      goal: { type: "survive", seconds: 30 },
    };
    const npcs = authorNpcs(street, { count: 6, roles: [{ role: "passer-by" }] }, {});
    const spots = new Set(npcs.map((n) => n.spawn.position.slice(0, 3).join(",")));
    expect(spots.size).toBe(6);

    // and they are spread, not huddled: some pair is more than a few metres apart
    const far = npcs.some((a) =>
      npcs.some((b) => Math.hypot(a.spawn.position[0] - b.spawn.position[0], a.spawn.position[2] - b.spawn.position[2]) > 10)
    );
    expect(far).toBe(true);
    // same input, same places: no clock, no random
    expect(authorNpcs(street, { count: 6, roles: [{ role: "passer-by" }] }, {}).map((n) => n.spawn)).toEqual(
      npcs.map((n) => n.spawn)
    );
  });

  it("never stands an NPC inside a building on open ground", () => {
    const block = { id: "m1", position: [0, 0, 0], size: [40, 20, 40] }; // most of the room is solid
    const street = {
      id: "street",
      theme: "city",
      rooms: [{ id: "ground", position: [0, 0, 0], size: [60, 6, 60], blocks: [block] }],
      goal: { type: "survive", seconds: 30 },
    };
    for (const n of authorNpcs(street, { count: 8, roles: [{ role: "passer-by" }] }, {})) {
      const [x, , z] = n.spawn.position;
      const insideX = Math.abs(x - block.position[0]) <= block.size[0] / 2;
      const insideZ = Math.abs(z - block.position[2]) <= block.size[2] / 2;
      expect(insideX && insideZ).toBe(false);
    }
  });

  it("still authors valid NpcDefs with no assetQuery (offline fallback body)", () => {
    const npcs = authorNpcs({ id: "i", theme: "dungeon", rooms: [{ id: "room-1" }] }, { count: 1, roles: [{ role: "villager" }] });
    expect(validate(SCHEMA_ID.npc.npcDef, npcs[0]).ok).toBe(true);
    expect(npcs[0].bodyRef).toBe("kaykit.character.humanoid");
    expect(npcs[0].spawn.position).toEqual([0, 0, 0]);
  });
});

describe("npc - play-time brain via an injected model (Phase 6)", () => {
  // Vex: hostile skeleton, allowedModes patrol/idle/attack/flee, current mode patrol, player-1 nearby.
  const CHAT = { type: "chat", playerRef: "player-1", text: "who goes there?" };

  it("drives the decision through an injected brain and re-validates it to a schema-valid result", () => {
    const brain = () => ({ newMode: "attack", target: "player-1", utterance: "You will not pass." });
    const result = resolveInteraction(selfContext, CHAT, { brain });
    expect(validate(SCHEMA_ID.npc.interactionResult, result).ok, JSON.stringify(result)).toBe(true);
    expect(result.newMode).toBe("attack");
    expect(result.target).toBe("player-1");
    expect(result.utterance).toBe("You will not pass.");
  });

  it("rejects an off-contract mode from the model and falls back to the current mode", () => {
    // 'talk' is not in Vex's allowedModes -> the whole decision is rejected, mode stays 'patrol'.
    const result = resolveInteraction(selfContext, CHAT, { brain: () => ({ newMode: "talk", utterance: "hi" }) });
    expect(result).toEqual({ newMode: "patrol" });
  });

  it("drops a target the model invented but keeps the (valid) mode and line", () => {
    const result = sanitizeDecision({ newMode: "attack", target: "ghost-999", utterance: "Halt." }, selfContext);
    expect(result.newMode).toBe("attack");
    expect(result.target).toBeUndefined();
    expect(result.utterance).toBe("Halt.");
  });

  it("accepts a world-position target as a vec3, and a real entity/id target", () => {
    expect(sanitizeDecision({ newMode: "attack", target: [6, 0, 8] }, selfContext).target).toEqual([6, 0, 8]);
    expect(sanitizeDecision({ newMode: "attack", target: "player-1" }, selfContext).target).toBe("player-1");
  });

  it("passes a named story flag through when the model sets one (for an unlock_dialog goal)", () => {
    const result = sanitizeDecision({ newMode: "idle", flag: "gave-key" }, selfContext);
    expect(result.flag).toBe("gave-key");
    expect(validate(SCHEMA_ID.npc.interactionResult, result).ok).toBe(true);
  });

  it("parses a JSON-string completion and scrubs leaked markup out of the utterance", () => {
    const result = sanitizeDecision('{"newMode":"idle","utterance":"Hold <break> there"}', selfContext);
    expect(result.newMode).toBe("idle");
    expect(result.utterance).toBe("Hold there");
  });

  it("collapses to the fallback on malformed JSON, a non-object, or a thrown model", () => {
    expect(sanitizeDecision("{not json", selfContext)).toEqual(fallbackDecision(selfContext));
    expect(sanitizeDecision(null, selfContext)).toEqual({ newMode: "patrol" });
    expect(sanitizeDecision(42, selfContext)).toEqual({ newMode: "patrol" });
    const thrown = resolveInteraction(selfContext, CHAT, {
      brain: () => {
        throw new Error("model timeout");
      },
    });
    expect(thrown).toEqual({ newMode: "patrol" });
  });

  it("the deterministic stand-in never emits a mode outside allowedModes, even if the current mode is forged", () => {
    // self-context validates myState.mode against the enum only, so a client can forge a current mode
    // its NPC is not allowed. The stand-in must clamp it, not echo it (regression for the smuggle bug).
    const forged = { ...selfContext, allowedModes: ["idle", "wander"], myState: { mode: "attack", memory: [] } };
    // a gesture other than 'attack' hits no explicit branch -> previously echoed the forged current
    const r1 = resolveInteraction(forged, { type: "gesture", gesture: "wave", playerRef: "p" });
    expect(forged.allowedModes).toContain(r1.newMode);
    expect(r1.newMode).not.toBe("attack");
    // chat when 'talk' is not allowed -> falls through to the (clamped) current, still within allowedModes
    const r2 = resolveInteraction(forged, { type: "chat", playerRef: "p", text: "hi" });
    expect(forged.allowedModes).toContain(r2.newMode);
  });

  it("buildInteractionPrompt carries the persona, the allowed modes, and the player's words", () => {
    const prompt = buildInteractionPrompt(selfContext, CHAT);
    expect(prompt.system).toContain("Vex");
    expect(prompt.system).toContain("skeleton guard");
    for (const m of selfContext.allowedModes) expect(prompt.system).toContain(m);
    expect(prompt.user).toContain("who goes there?");
  });
});

describe("npc - deterministic voice-design composer (Phase 6)", () => {
  it("is deterministic, schema-valid, and re-salts to stay distinct under an exclude set", () => {
    const a = composeVoiceDesign("npc-alpha");
    const again = composeVoiceDesign("npc-alpha");
    expect(again).toEqual(a); // same id -> same voice (no Math.random / Date)
    expect(validate(SCHEMA_ID.voice.voiceDesign, a).ok, JSON.stringify(a)).toBe(true);

    const distinct = composeVoiceDesign("npc-alpha", { exclude: new Set([a.description]) });
    expect(distinct.description).not.toBe(a.description);
  });

  it("authorNpcs stamps every NPC a distinct, schema-valid voice design", () => {
    const npcs = authorNpcs(
      { id: "inst-001", theme: "dungeon", rooms: [{ id: "room-1" }] },
      { count: 3, roles: [{ role: "guard" }, { role: "smith" }, { role: "villager" }] },
    );
    for (const n of npcs) expect(validate(SCHEMA_ID.voice.voiceDesign, n.voiceDesign).ok).toBe(true);
    const descriptions = npcs.map((n) => n.voiceDesign.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  // Two metres from where the player walks in, a body fills the screen and a small room becomes
  // unreadable. A cast keeps its distance from the door you come through.
  it("nobody is standing on the spot the player arrives at", () => {
    const room = { id: "entry", position: [0, 0, 0], size: [9, 3, 9], objects: [], inventory: [] };
    const npcs = authorNpcs(
      { id: "f1", theme: "city", rooms: [room], spawn: { position: [0, 0, 0], facing: 0 } },
      { count: 4, roles: [{ role: "resident", disposition: "neutral" }] },
      {}
    );
    expect(npcs).toHaveLength(4);
    for (const npc of npcs) {
      const [x, , z] = npc.spawn.position;
      expect(Math.hypot(x, z), `${npc.id} is on the doorstep`).toBeGreaterThanOrEqual(2.5);
    }
  });
});
