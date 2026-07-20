import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { authorNpcs, resolveInteraction } from "../src/index.js";

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
      expect(Math.abs(n.spawn.position[0] - home.position[0])).toBeLessThanOrEqual(1);
      expect(n.spawn.position[2]).toBe(home.position[2]);
    }
  });

  it("still authors valid NpcDefs with no assetQuery (offline fallback body)", () => {
    const npcs = authorNpcs({ id: "i", theme: "dungeon", rooms: [{ id: "room-1" }] }, { count: 1, roles: [{ role: "villager" }] });
    expect(validate(SCHEMA_ID.npc.npcDef, npcs[0]).ok).toBe(true);
    expect(npcs[0].bodyRef).toBe("kaykit.character.humanoid");
    expect(npcs[0].spawn.position).toEqual([0, 0, 0]);
  });
});
