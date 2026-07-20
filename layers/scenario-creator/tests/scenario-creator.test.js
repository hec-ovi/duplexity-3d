import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createInstance, validateLayout } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(HERE, "../fixtures/instance-spec.json"), "utf8"));

// stand-in for the injected asset-registry.query handle (a function, never an import)
const fakeQuery = (q) => [{ id: `${q.theme}.${q.kind}`, kind: q.kind }];

describe("scenario-creator contract", () => {
  it("the instance-spec fixture is schema-valid", () => {
    expect(validate(SCHEMA_ID.scenarioCreator.instanceSpec, spec).ok).toBe(true);
  });

  it("createInstance returns a schema-valid layout and a passing ValidationReport", () => {
    const { instance, report } = createInstance(spec, fakeQuery);
    expect(validate(SCHEMA_ID.scenarioCreator.instance, instance).ok, JSON.stringify(instance)).toBe(
      true,
    );
    expect(validate(SCHEMA_ID.scenarioCreator.validationReport, report).ok).toBe(true);
    expect(report.ok).toBe(true);
    expect(instance.id).toBe(spec.id);
  });

  it("the geometry validator rejects overlapping rooms (adversarial fixture)", () => {
    const bad = {
      id: "x",
      theme: "t",
      rooms: [
        { id: "a", position: [0, 0, 0], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
        { id: "b", position: [1, 0, 1], size: [6, 3, 6], floorKit: "f", wallKit: "w" },
      ],
      portals: [],
    };
    const report = validateLayout(bad);
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === "no_room_overlap").ok).toBe(false);
  });

  it("the injected asset query drives kit selection (dependency injection, not import)", () => {
    const { instance } = createInstance(spec, fakeQuery);
    expect(instance.rooms[0].floorKit).toBe("dungeon.room-floor");
    expect(instance.rooms[0].wallKit).toBe("dungeon.wall");
  });
});
