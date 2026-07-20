import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createShell } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);

// Backend layers mocked at their contracts.
function fakeDeps() {
  return {
    persistence: {
      list: vi.fn(() => [{ id: "adv-example-001", title: "The Vault of the Gruff Smith" }]),
      load: vi.fn(() => structuredClone(fixture)),
    },
    runtime: { load: vi.fn() },
    author: vi.fn(() => structuredClone(fixture)),
  };
}

describe("ux-shell contract", () => {
  it("lists adventures via persistence", () => {
    const deps = fakeDeps();
    const shell = createShell(deps);
    expect(shell.listAdventures()).toHaveLength(1);
    expect(deps.persistence.list).toHaveBeenCalledOnce();
  });

  it("openAdventure mounts the runtime with the correct, schema-valid Adventure and instance", () => {
    const deps = fakeDeps();
    const shell = createShell(deps);

    shell.openAdventure("adv-example-001", "inst-001");

    expect(deps.persistence.load).toHaveBeenCalledWith("adv-example-001");
    expect(deps.runtime.load).toHaveBeenCalledOnce();
    const [adventure, instanceId] = deps.runtime.load.mock.calls[0];
    expect(validate(SCHEMA_ID.persistence.adventure, adventure).ok).toBe(true);
    expect(instanceId).toBe("inst-001");
  });

  it("newAdventure delegates to the injected author flow and returns the Adventure", () => {
    const deps = fakeDeps();
    const shell = createShell(deps);
    const brief = { universes: [], likedNpcs: [], tone: "adventurous", difficulty: "normal", themes: [], freeText: "" };

    const adv = shell.newAdventure(brief);
    expect(deps.author).toHaveBeenCalledWith(brief);
    expect(validate(SCHEMA_ID.persistence.adventure, adv).ok).toBe(true);
  });
});
