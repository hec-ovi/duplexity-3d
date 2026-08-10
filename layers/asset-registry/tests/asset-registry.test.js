import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createRegistry, AssetNotFoundError, LicenseMissingError } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const entryFx = JSON.parse(readFileSync(join(HERE, "../fixtures/asset-entry.example.json"), "utf8"));
const queryFx = JSON.parse(readFileSync(join(HERE, "../fixtures/asset-query.example.json"), "utf8"));

describe("asset-registry contract", () => {
  it("the example fixtures are schema-valid", () => {
    expect(validate(SCHEMA_ID.assetRegistry.assetEntry, entryFx).ok).toBe(true);
    expect(validate(SCHEMA_ID.assetRegistry.assetQuery, queryFx).ok).toBe(true);
  });

  it("query respects sizeConstraints (max bbox filter)", () => {
    const reg = createRegistry();
    const small = reg.query({ sizeConstraints: { maxSize: [1, 1, 1] } });
    expect(small.map((e) => e.id)).toEqual(["kaykit.props.chest"]);
  });

  it("rejects a register with no glbUrl", () => {
    const reg = createRegistry();
    expect(() =>
      reg.register({ id: "x", kind: "prop", tags: [], theme: "t", size: [1, 1, 1], license: "CC0-1.0", source: "generated" }),
    ).toThrow(/glbUrl/);
  });
  it("every seeded entry is a schema-valid AssetEntry", () => {
    const reg = createRegistry();
    for (const e of reg.query()) {
      expect(validate(SCHEMA_ID.assetRegistry.assetEntry, e).ok, e.id).toBe(true);
    }
  });

  it("query filters by kind, and every character declares animations", () => {
    const reg = createRegistry();
    const chars = reg.query({ kind: "character" });
    expect(chars.length).toBeGreaterThan(0);
    for (const c of chars) expect(c.animations.length).toBeGreaterThan(0);

    const walls = reg.query({ theme: "dungeon", kind: "wall" });
    expect(walls.every((w) => w.kind === "wall")).toBe(true);
  });

  it("registering a licensed prop returns its id and it becomes gettable", () => {
    const reg = createRegistry();
    const entry = {
      id: "gen.prop.lamp",
      kind: "prop",
      tags: ["light"],
      theme: "dungeon",
      size: [0.4, 1.2, 0.4],
      glbUrl: "generated/lamp.glb",
      license: "CC0-1.0",
      source: "generated",
    };
    expect(reg.register(entry)).toBe("gen.prop.lamp");
    expect(validate(SCHEMA_ID.assetRegistry.assetEntry, reg.get("gen.prop.lamp")).ok).toBe(true);
  });

  it("rejects a register with no license", () => {
    const reg = createRegistry();
    expect(() => reg.register({ id: "x", kind: "prop", tags: [], theme: "t", size: [1, 1, 1], glbUrl: "u", source: "generated" })).toThrow(LicenseMissingError);
  });

  it("rejects a character with no animations (and the schema flags it too)", () => {
    const reg = createRegistry();
    const badChar = {
      id: "gen.char.nope",
      kind: "character",
      tags: [],
      theme: "t",
      size: [0.6, 1.8, 0.6],
      glbUrl: "u",
      license: "CC0-1.0",
      source: "generated",
    };
    expect(() => reg.register(badChar)).toThrow(/animations/);
    expect(validate(SCHEMA_ID.assetRegistry.assetEntry, badChar).ok).toBe(false);
  });

  it("registers a whole building, and keeps where it stands and what it carries", () => {
    const reg = createRegistry();
    const tower = {
      id: "glb.the-vault",
      kind: "building",
      tags: ["city", "office"],
      theme: "city",
      size: [18, 42, 14],
      glbUrl: "assets/the-vault.glb",
      anchor: [0, 0, 0],
      doors: "own",
      floors: 12,
      license: "CC0-1.0",
      source: "generated",
    };

    expect(reg.register(tower)).toBe("glb.the-vault");
    const back = reg.get("glb.the-vault");
    expect(back.size).toEqual([18, 42, 14]); // the plot the city has to cut for it
    expect(back.doors).toBe("own"); // so the city does not build a second door on its face
    expect(validate(SCHEMA_ID.assetRegistry.assetEntry, back).ok).toBe(true);
    expect(reg.query({ kind: "building", theme: "city" }).map((e) => e.id)).toEqual(["glb.the-vault"]);
  });

  it("rejects a building with no real size (the plot could not be cut for it)", () => {
    const reg = createRegistry();
    const flat = {
      id: "glb.nothing",
      kind: "building",
      tags: [],
      theme: "city",
      size: [12, 0, 8],
      glbUrl: "assets/nothing.glb",
      license: "CC0-1.0",
      source: "generated",
    };

    expect(() => reg.register(flat)).toThrow(/size/);
  });

  it("get of an unknown id throws ASSET_NOT_FOUND", () => {
    const reg = createRegistry();
    expect(() => reg.get("nope")).toThrow(AssetNotFoundError);
  });
});
