import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createPersistence, NotFoundError } from "../src/index.js";

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
