import { describe, it, expect } from "vitest";
import { findCrossLayerImports } from "./isolation.js";

describe("layer isolation (the one rule)", () => {
  it("no layer's src/ imports another layer's src/", () => {
    const violations = findCrossLayerImports();
    expect(
      violations,
      `cross-layer imports found:\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });
});
