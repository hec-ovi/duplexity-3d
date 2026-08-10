import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createPersistence, NotFoundError, MigrationFailedError, BadBundleError } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(HERE, "../fixtures/adventure.example.json"), "utf8"));
const validateAdventure = (a) => validate(SCHEMA_ID.persistence.adventure, a);

describe("persistence contract", () => {
  it("the example Adventure fixture is schema-valid", () => {
    const r = validateAdventure(fixture);
    expect(r.ok, JSON.stringify(r.errors, null, 2)).toBe(true);
  });

  it("save then load round-trips the document", () => {
    const p = createPersistence({ validateAdventure });
    const { id } = p.save(fixture);
    expect(id).toBe("adv-example-001");
    expect(p.load(id)).toEqual(fixture);
  });

  it("export produces a schema-valid Bundle and import restores the Adventure", () => {
    const p = createPersistence({ validateAdventure });
    p.save(fixture);
    const bundle = p.export("adv-example-001");
    expect(validate(SCHEMA_ID.persistence.bundle, bundle).ok).toBe(true);

    const p2 = createPersistence({ validateAdventure });
    expect(p2.import(bundle)).toEqual(fixture);
  });

  it("an adventure travels with the files no base kit carries", () => {
    const vault = {
      id: "glb.the-vault",
      kind: "building",
      tags: [],
      theme: "city",
      size: [14, 48, 18],
      glbUrl: "assets/the-vault.glb",
      license: "own-work",
      source: "generated",
    };
    const p = createPersistence({ validateAdventure });
    p.save(fixture, [vault]);

    const bundle = p.export("adv-example-001");
    expect(validate(SCHEMA_ID.persistence.bundle, bundle).ok).toBe(true);
    expect(bundle.generatedAssets).toEqual([vault]);

    // and they arrive on the other machine with it
    const other = createPersistence({ validateAdventure });
    other.importFile(p.exportFile("adv-example-001"));
    expect(other.export("adv-example-001").generatedAssets).toEqual([vault]);
  });

  it("exportFile serializes a portable JSON string that importFile restores into a fresh store", () => {
    const p = createPersistence({ validateAdventure });
    p.save(fixture);
    const text = p.exportFile("adv-example-001");
    expect(typeof text).toBe("string");
    // the portable file is itself a schema-valid Bundle
    expect(validate(SCHEMA_ID.persistence.bundle, JSON.parse(text)).ok).toBe(true);

    const other = createPersistence({ validateAdventure }); // "another machine"
    const restored = other.importFile(text);
    expect(restored).toEqual(fixture);
    expect(other.load("adv-example-001")).toEqual(fixture);
  });

  it("importFile migrates an older same-major export forward (backfills a missing history)", () => {
    const p = createPersistence({ validateAdventure });
    const older = structuredClone(fixture);
    delete older.history; // an older export that predates the history field
    const text = JSON.stringify({ adventure: older, generatedAssets: [] });

    const restored = p.importFile(text);
    expect(restored.history).toEqual([]); // migrated forward, now schema-valid
    expect(validateAdventure(restored).ok).toBe(true);
  });

  it("rejects a bundle from a newer major contractVersion with MIGRATION_FAILED", () => {
    const p = createPersistence({ validateAdventure });
    const future = structuredClone(fixture);
    future.meta = { ...future.meta, contractVersion: "2.0.0" };
    const text = JSON.stringify({ adventure: future, generatedAssets: [] });
    expect(() => p.importFile(text)).toThrowError(MigrationFailedError);
  });

  it("rejects malformed / non-bundle import input with BAD_BUNDLE", () => {
    const p = createPersistence({ validateAdventure });
    expect(() => p.importFile("{not json")).toThrowError(BadBundleError);
    expect(() => p.import({})).toThrowError(BadBundleError); // no adventure
    expect(() => p.import(null)).toThrowError(BadBundleError);
  });

  it("appendHistory adds a schema-valid InteractionRecord to the document", () => {
    const p = createPersistence({ validateAdventure });
    p.save(fixture);
    const record = {
      instanceId: "inst-001",
      npcId: "npc-smith",
      playerRef: "player-1",
      interaction: { type: "chat", text: "hello", playerRef: "player-1" },
      result: { newMode: "talk", utterance: "Hmph. What." },
    };
    expect(validate(SCHEMA_ID.persistence.interactionRecord, record).ok).toBe(true);
    p.appendHistory("adv-example-001", record);
    expect(p.load("adv-example-001").history).toHaveLength(1);
  });

  it("rejects an off-schema Adventure with SCHEMA_INVALID", () => {
    const p = createPersistence({ validateAdventure });
    const bad = structuredClone(fixture);
    delete bad.instances;
    expect(() => p.save(bad)).toThrowError(/schema/i);
  });

  it("load of an unknown id throws NOT_FOUND", () => {
    const p = createPersistence({ validateAdventure });
    expect(() => p.load("nope")).toThrow(NotFoundError);
  });
});
