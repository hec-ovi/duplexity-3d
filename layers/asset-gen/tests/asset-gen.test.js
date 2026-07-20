import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createAssetGen } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const genRequest = JSON.parse(readFileSync(join(HERE, "../fixtures/gen-request.json"), "utf8"));

describe("asset-gen contract", () => {
  it("the gen-request fixture is schema-valid", () => {
    expect(validate(SCHEMA_ID.assetGen.genRequest, genRequest).ok).toBe(true);
  });

  it("a successful generation registers a licensed AssetEntry and reports done", () => {
    const registered = [];
    const registry = {
      register: vi.fn((e) => {
        registered.push(e);
        return e.id;
      }),
    };
    const provider = (req) => ({
      id: "gen.prop.crate",
      kind: req.kind,
      tags: ["generated"],
      theme: "dungeon",
      size: req.targetSpec.bbox,
      glbUrl: "generated/crate.glb",
      license: "CC0-1.0",
      source: "generated",
    });

    const gen = createAssetGen({ provider, registry });
    const { jobId } = gen.generate(genRequest);
    const status = gen.status(jobId);

    expect(validate(SCHEMA_ID.assetGen.genStatus, status).ok).toBe(true);
    expect(status.state).toBe("done");
    expect(status.assetId).toBe("gen.prop.crate");
    expect(registry.register).toHaveBeenCalledOnce();
    expect(validate(SCHEMA_ID.assetRegistry.assetEntry, registered[0]).ok).toBe(true);
  });

  it("a failing generator degrades gracefully: job failed, nothing registered", () => {
    const registry = { register: vi.fn() };
    const provider = () => {
      throw Object.assign(new Error("provider down"), { code: "PROVIDER_UNAVAILABLE" });
    };

    const gen = createAssetGen({ provider, registry });
    const status = gen.status(gen.generate(genRequest).jobId);

    expect(validate(SCHEMA_ID.assetGen.genStatus, status).ok).toBe(true);
    expect(status.state).toBe("failed");
    expect(registry.register).not.toHaveBeenCalled();
  });
});
