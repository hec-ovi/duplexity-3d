import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createAssetGen } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const genRequest = JSON.parse(readFileSync(join(HERE, "../fixtures/gen-request.json"), "utf8"));

// The real asset-registry write contract enforcement, mirrored: reject a missing license, a missing
// glbUrl, or a character with no animations (asset-gen/tests must not import that layer's src).
function fakeRegistry() {
  const registered = [];
  const register = vi.fn((e) => {
    if (!e.license) throw Object.assign(new Error("license missing"), { code: "LICENSE_MISSING" });
    if (!e.glbUrl) throw Object.assign(new Error("no glbUrl"), { code: "INVALID_ASSET_ENTRY" });
    if (e.kind === "character" && !(e.animations?.length > 0)) {
      throw Object.assign(new Error("character needs animations"), { code: "INVALID_ASSET_ENTRY" });
    }
    registered.push(e);
    return e.id;
  });
  return { register, registered };
}

// The real AssetEntry schema wired as the final gate the composition root would inject.
const validateEntry = (e) => validate(SCHEMA_ID.assetRegistry.assetEntry, e);

const makeGen = (over = {}) => createAssetGen({ registry: fakeRegistry(), validateEntry, ...over });

const propResult = (over = {}) => ({
  id: "gen.prop.crate",
  kind: "prop",
  tags: ["generated", "dungeon"],
  theme: "dungeon",
  size: [1, 1, 1],
  glbUrl: "generated/crate.glb",
  license: "CC0-1.0",
  ...over,
});

describe("asset-gen contract", () => {
  it("the gen-request fixture is schema-valid", () => {
    expect(validate(SCHEMA_ID.assetGen.genRequest, genRequest).ok).toBe(true);
  });

  it("an async generation eventually registers a licensed, schema-valid AssetEntry and reports done", async () => {
    const registry = fakeRegistry();
    const emit = vi.fn();
    const provider = vi.fn(async (req) => propResult({ size: req.targetSpec.bbox }));

    const gen = createAssetGen({ provider, registry, emit, validateEntry });
    const { jobId, completion } = gen.generate(genRequest);

    // it does not block: the job is running before the async provider resolves
    expect(gen.status(jobId).state).toBe("running");
    expect(validate(SCHEMA_ID.assetGen.genStatus, gen.status(jobId)).ok).toBe(true);

    const status = await completion;
    expect(status.state).toBe("done");
    expect(status.assetId).toBe("gen.prop.crate");
    expect(validate(SCHEMA_ID.assetGen.genStatus, status).ok).toBe(true);

    expect(registry.register).toHaveBeenCalledOnce();
    const entry = registry.registered[0];
    expect(validate(SCHEMA_ID.assetRegistry.assetEntry, entry).ok, JSON.stringify(entry)).toBe(true);
    expect(entry.source).toBe("generated"); // asset-gen stamps provenance so the catalog can tell them apart

    const [name, payload] = emit.mock.calls.at(-1);
    expect(name).toBe("gen.completed");
    expect(validate(SCHEMA_ID.assetGen.genCompleted, payload).ok).toBe(true);
  });

  it("fills a missing bbox from the request's targetSpec and does not alias it", async () => {
    const registry = fakeRegistry();
    // provider omits size entirely -> asset-gen must fill it from the request
    const provider = async () => propResult({ size: undefined });
    const gen = createAssetGen({ provider, registry, validateEntry });

    const req = { kind: "prop", targetSpec: { bbox: [2, 3, 4] } };
    const status = await gen.generate(req).completion;
    expect(status.state).toBe("done");

    const entry = registry.registered[0];
    expect(entry.size).toEqual([2, 3, 4]);
    // mutating the request afterward must not corrupt the already-registered asset (no aliasing)
    req.targetSpec.bbox[0] = 999;
    expect(entry.size).toEqual([2, 3, 4]);
  });

  it("a character generation preserves its animations so npc can bound allowedModes by them", async () => {
    const registry = fakeRegistry();
    const provider = async () => ({
      id: "gen.character.wisp",
      kind: "character",
      theme: "crystal",
      size: [0.6, 1.8, 0.6],
      glbUrl: "generated/wisp.glb",
      license: "CC0-1.0",
      animations: ["idle", "walk", "attack"],
    });
    const status = await createAssetGen({ provider, registry, validateEntry })
      .generate({ kind: "character", targetSpec: { bbox: [0.6, 1.8, 0.6] } }).completion;

    expect(status.state).toBe("done");
    expect(registry.registered[0].animations).toEqual(["idle", "walk", "attack"]);
    expect(validate(SCHEMA_ID.assetRegistry.assetEntry, registry.registered[0]).ok).toBe(true);
  });

  it("forces a generated id into the reserved gen. namespace so it can never overwrite a kit asset", async () => {
    const registry = fakeRegistry();
    // a stray/hostile provider id equal to a curated kit id
    const provider = async () => propResult({ id: "kaykit.dungeon.floor", kind: "room-floor", size: [2, 0.2, 2] });
    const status = await createAssetGen({ provider, registry, validateEntry })
      .generate({ kind: "room-floor", targetSpec: { bbox: [2, 0.2, 2] } }).completion;

    expect(status.state).toBe("done");
    expect(registry.registered[0].id).toBe("gen.kaykit.dungeon.floor"); // namespaced, not the kit id
    expect(status.assetId).toBe("gen.kaykit.dungeon.floor");
  });

  it("degrades gracefully when generation is disabled (no provider): failed, nothing registered", async () => {
    const registry = fakeRegistry();
    const emit = vi.fn();
    const gen = createAssetGen({ registry, emit, validateEntry }); // no provider = disabled

    const status = await gen.generate(genRequest).completion;
    expect(validate(SCHEMA_ID.assetGen.genStatus, status).ok).toBe(true);
    expect(status.state).toBe("failed");
    expect(status.error).toBe("PROVIDER_UNAVAILABLE");
    expect(registry.register).not.toHaveBeenCalled();

    const [name, payload] = emit.mock.calls.at(-1);
    expect(name).toBe("gen.failed");
    expect(validate(SCHEMA_ID.assetGen.genFailed, payload).ok).toBe(true);
  });

  it("a failing generator fails the job cleanly and registers nothing", async () => {
    const registry = fakeRegistry();
    const provider = async () => {
      throw Object.assign(new Error("comfyui down"), { code: "PROVIDER_UNAVAILABLE" });
    };
    const status = await createAssetGen({ provider, registry, validateEntry }).generate(genRequest).completion;

    expect(status.state).toBe("failed");
    expect(status.error).toBe("PROVIDER_UNAVAILABLE");
    expect(registry.register).not.toHaveBeenCalled();
  });

  it("a provider that rejects with null/undefined still resolves to a clean failed status (no unhandled rejection)", async () => {
    const registry = fakeRegistry();
    // reject with no reason, and separately throw null: the catch must not itself throw on err.code
    const nullReject = createAssetGen({ provider: () => Promise.reject(), registry, validateEntry });
    const { jobId, completion } = nullReject.generate(genRequest);
    const status = await completion; // would throw here if completion rejected
    expect(status.state).toBe("failed");
    expect(status.error).toBe("GEN_FAILED");
    expect(nullReject.status(jobId).state).toBe("failed"); // not stuck at "running"

    const throwNull = createAssetGen({ provider: () => { throw null; }, registry, validateEntry }); // eslint-disable-line no-throw-literal
    expect((await throwNull.generate(genRequest).completion).state).toBe("failed");
    expect(registry.register).not.toHaveBeenCalled();
  });

  it("drops an output that is not commercial-use-clear (NORMALIZE_FAILED), registering nothing", async () => {
    const registry = fakeRegistry();
    const status = await createAssetGen({ provider: async () => propResult({ license: "All-Rights-Reserved" }), registry, validateEntry })
      .generate(genRequest).completion;
    expect(status.state).toBe("failed");
    expect(status.error).toBe("NORMALIZE_FAILED");
    expect(registry.register).not.toHaveBeenCalled();
  });

  it("drops an output with an unknown kind or no glbUrl (NORMALIZE_FAILED)", async () => {
    const badKind = await makeGen({ provider: async () => propResult({ kind: "spaceship" }) }).generate({ kind: "prop", targetSpec: { bbox: [1, 1, 1] } }).completion;
    expect(badKind.error).toBe("NORMALIZE_FAILED");

    const noGlb = await makeGen({ provider: async () => propResult({ glbUrl: undefined }) }).generate(genRequest).completion;
    expect(noGlb.error).toBe("NORMALIZE_FAILED");
  });

  it("drops malformed snapPoints (a point with no position) before registering (NORMALIZE_FAILED)", async () => {
    const registry = fakeRegistry();
    const status = await createAssetGen({ provider: async () => propResult({ snapPoints: [{ axis: "x" }] }), registry, validateEntry })
      .generate(genRequest).completion;
    expect(status.state).toBe("failed");
    expect(status.error).toBe("NORMALIZE_FAILED");
    expect(registry.register).not.toHaveBeenCalled();
  });

  it("drops a character output with missing or non-string animations (NORMALIZE_FAILED)", async () => {
    const noAnim = await makeGen({
      provider: async () => ({ id: "gen.character.a", kind: "character", theme: "crystal", size: [0.6, 1.8, 0.6], glbUrl: "g.glb", license: "CC0-1.0" }),
    }).generate({ kind: "character", targetSpec: { bbox: [0.6, 1.8, 0.6] } }).completion;
    expect(noAnim.error).toBe("NORMALIZE_FAILED");

    const badAnim = await makeGen({
      provider: async () => ({ id: "gen.character.b", kind: "character", theme: "crystal", size: [0.6, 1.8, 0.6], glbUrl: "g.glb", license: "CC0-1.0", animations: [{ clip: "idle" }, 42] }),
    }).generate({ kind: "character", targetSpec: { bbox: [0.6, 1.8, 0.6] } }).completion;
    expect(badAnim.error).toBe("NORMALIZE_FAILED");
  });
});
