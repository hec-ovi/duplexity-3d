import { describe, it, expect } from "vitest";
import { ajv, registeredIds, SCHEMA_ID } from "./schemas.js";

describe("schema registry", () => {
  it("compiles every schema and resolves all cross-layer $refs", () => {
    const a = ajv();
    const ids = registeredIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(a.getSchema(id), `schema did not compile: ${id}`).toBeTruthy();
    }
  });

  it("registers every $id named in the canonical SCHEMA_ID map", () => {
    const a = ajv();
    const named = Object.values(SCHEMA_ID).flatMap((group) => Object.values(group));
    for (const id of named) {
      expect(a.getSchema(id), `SCHEMA_ID points at an unregistered schema: ${id}`).toBeTruthy();
    }
  });
});
