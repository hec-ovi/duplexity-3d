// Phase 8 DoD: an async generation request eventually adds usable, licensed assets that the
// scenario-creator, npc, and runtime pick up. A composition-root integration test (asset-gen ->
// asset-registry -> scenario-creator + npc + runtime), not an HTTP route: asset-gen is optional,
// async, author-time enrichment, and the engine is already fully playable from kits without it.

import { describe, it, expect } from "vitest";
import { validate, SCHEMA_ID } from "../harness/schemas.js";
import { createRegistry } from "../layers/asset-registry/src/index.js";
import { createAssetGen } from "../layers/asset-gen/src/index.js";
import * as scenarioCreator from "../layers/scenario-creator/src/index.js";
import * as npc from "../layers/npc/src/index.js";
import { buildSceneModel } from "../layers/runtime/src/scene-model.js";

// A gen3d provider that returns a licensed CC0 kit for a brand-new theme the seed registry lacks.
const CRYSTAL = {
  "room-floor": { id: "gen.crystal.floor", kind: "room-floor", theme: "crystal", tags: ["crystal", "floor"], size: [2, 0.2, 2], glbUrl: "generated/crystal-floor.glb", license: "CC0-1.0" },
  wall: { id: "gen.crystal.wall", kind: "wall", theme: "crystal", tags: ["crystal", "wall"], size: [2, 3, 0.3], glbUrl: "generated/crystal-wall.glb", license: "CC0-1.0" },
  character: { id: "gen.crystal.golem", kind: "character", theme: "crystal", tags: ["crystal", "enemy"], size: [0.6, 1.8, 0.6], glbUrl: "generated/golem.glb", license: "CC0-1.0", animations: ["idle", "walk", "attack", "talk"] },
};
const crystalProvider = async (req) => CRYSTAL[req.kind];

const spec = {
  id: "inst-crystal",
  theme: "crystal",
  sizeHint: "small",
  mood: "eerie",
  goalSpec: { type: "discover_item", hint: "find the shard" },
  npcRoster: [{ role: "golem", count: 1 }],
  connectionHints: { loops: false },
};

describe("asset-gen enrichment reaches scenario-creator, npc, and the runtime", () => {
  it("a themed kit generated async unblocks a theme the registry could not build before", async () => {
    const registry = createRegistry(); // seed: dungeon kits only, no 'crystal'
    const assetQuery = (q) => registry.query(q);
    const gen = createAssetGen({ provider: crystalProvider, registry });

    // Before enrichment the crystal theme has no floor/wall, so the solver refuses it.
    expect(() => scenarioCreator.createInstance(spec, assetQuery)).toThrowError(
      expect.objectContaining({ code: "NO_ASSET_FOR_KIND" }),
    );

    // Enrich asynchronously: three generation jobs, awaited to completion.
    const jobs = await Promise.all([
      gen.generate({ kind: "room-floor", targetSpec: { bbox: [2, 0.2, 2] } }).completion,
      gen.generate({ kind: "wall", targetSpec: { bbox: [2, 3, 0.3] } }).completion,
      gen.generate({ kind: "character", targetSpec: { bbox: [0.6, 1.8, 0.6] } }).completion,
    ]);
    expect(jobs.map((j) => j.state)).toEqual(["done", "done", "done"]);

    // The generated assets are now in the catalog, licensed and schema-valid.
    const floors = registry.query({ kind: "room-floor", theme: "crystal" });
    expect(floors).toHaveLength(1);
    expect(validate(SCHEMA_ID.assetRegistry.assetEntry, floors[0]).ok).toBe(true);
    expect(floors[0].source).toBe("generated");

    // scenario-creator now builds a valid crystal instance out of the generated kit.
    const built = scenarioCreator.createInstance(spec, assetQuery);
    expect(built.report.ok, JSON.stringify(built.report)).toBe(true);
    const serialized = JSON.stringify(built.instance);
    expect(serialized).toContain("gen.crystal.floor");
    expect(serialized).toContain("gen.crystal.wall");

    // the runtime loads it (rooms build from the generated kit).
    const model = buildSceneModel(built.instance);
    expect(model.rooms.length).toBe(built.instance.rooms.length);

    // npc picks the generated character as a body and bounds allowedModes by its declared clips.
    const npcs = npc.authorNpcs(
      { id: spec.id, theme: "crystal", rooms: built.instance.rooms },
      { count: 1, roles: [{ role: "golem", disposition: "hostile" }] },
      { assetQuery },
    );
    expect(npcs[0].bodyRef).toBe("gen.crystal.golem");
    expect(npcs[0].allowedModes).toContain("attack"); // the golem declares an attack clip
    expect(validate(SCHEMA_ID.npc.npcDef, npcs[0]).ok).toBe(true);
  });

  it("a generated asset can never overwrite a curated kit asset (reserved gen. namespace)", async () => {
    const registry = createRegistry();
    const before = registry.get("kaykit.dungeon.floor");
    // a stray/hostile provider returns a kit id it must not be allowed to clobber
    const gen = createAssetGen({
      provider: async () => ({ id: "kaykit.dungeon.floor", kind: "room-floor", theme: "swamp", size: [9, 9, 9], glbUrl: "generated/EVIL.glb", license: "CC0-1.0" }),
      registry,
    });

    const status = await gen.generate({ kind: "room-floor", targetSpec: { bbox: [2, 0.2, 2] } }).completion;
    expect(status.state).toBe("done");

    expect(registry.get("kaykit.dungeon.floor")).toEqual(before); // the kit asset is untouched
    expect(registry.get("gen.kaykit.dungeon.floor").glbUrl).toBe("generated/EVIL.glb"); // generated one is namespaced
    expect(registry.query({ kind: "room-floor", theme: "dungeon" }).length).toBeGreaterThan(0); // dungeon still builds
  });

  it("with generation disabled, the crystal theme stays unbuildable but the engine is otherwise fine", async () => {
    const registry = createRegistry();
    const assetQuery = (q) => registry.query(q);
    const gen = createAssetGen({ registry }); // no provider

    const status = await gen.generate({ kind: "room-floor", targetSpec: { bbox: [2, 0.2, 2] } }).completion;
    expect(status.state).toBe("failed");
    expect(status.error).toBe("PROVIDER_UNAVAILABLE");

    // nothing was registered; the built-in dungeon theme still works untouched.
    expect(registry.query({ kind: "room-floor", theme: "crystal" })).toHaveLength(0);
    const dungeon = scenarioCreator.createInstance({ ...spec, id: "inst-dungeon", theme: "dungeon" }, assetQuery);
    expect(dungeon.report.ok).toBe(true);
  });
});
