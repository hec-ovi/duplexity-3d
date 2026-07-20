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

// A stand-in asset-registry that knows the dwarf body's animations (injected, never imported).
function fakeRegistry() {
  return {
    get(id) {
      if (id === "kaykit.character.dwarf") return { id, animations: ["idle", "walk", "talk"] };
      const err = new Error(`asset not found: ${id}`);
      err.code = "ASSET_NOT_FOUND";
      throw err;
    },
  };
}

describe("runtime.assembleSelfContext", () => {
  it("assembles a schema-valid SelfContext with body, place, state and allowed modes", () => {
    const rt = createRuntime({ registry: fakeRegistry() });
    rt.load(adventure, "inst-001");
    const ctx = rt.assembleSelfContext("npc-smith");

    expect(validate(SCHEMA_ID.npc.selfContext, ctx).ok).toBe(true);
    expect(ctx.whoAmI.name).toBe("Bruk Ironhand");
    expect(ctx.whoAmI.disposition).toBe("neutral");
    expect(ctx.allowedModes).toContain("talk");
    expect(ctx.myBody.animations).toEqual(["idle", "walk", "talk"]); // pulled from the registry
    expect(ctx.whereIAm.roomId).toBe("room-hall");
    expect(ctx.whereIAm.exits).toEqual(expect.arrayContaining(["p1", "p2"])); // the hall's two doorways
    expect(ctx.myState.mode).toBe("idle");
  });

  it("degrades gracefully to no body animations when the asset is unregistered, still schema-valid", () => {
    const rt = createRuntime(); // no registry
    rt.load(adventure, "inst-001");
    const ctx = rt.assembleSelfContext("npc-guard");

    expect(validate(SCHEMA_ID.npc.selfContext, ctx).ok).toBe(true);
    expect(ctx.myBody.animations).toEqual([]);
    expect(ctx.whereIAm.roomId).toBe("room-vault");
  });

  it("lists nearby entities: it sees the player when the player is close", () => {
    const rt = createRuntime({ registry: fakeRegistry() });
    rt.load(adventure, "inst-001");
    // player spawns at (0,0); the smith is at (0,6), within the 8m nearby radius
    const ctx = rt.assembleSelfContext("npc-smith");
    const player = ctx.whereIAm.nearbyEntities.find((e) => e.kind === "player");
    expect(player).toBeTruthy();
    expect(player.id).toBe("player-1");
  });
});
