// Composition-root test: the toolkit driven the way an author drives it, as a real process. It
// proves the two things a checkpoint promises: a city you liked comes back exactly as it was, and
// nothing that would fail to load ever gets written.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LEVEL = join(dirname(fileURLToPath(import.meta.url)), "level.js");
const work = mkdtempSync(join(tmpdir(), "duplexity-checkpoints-"));
const cityFile = join(work, "city.json");

const level = (...args) =>
  execFileSync(process.execPath, [LEVEL, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// A spec file is the authoring surface: it pins one building by name, program, height and quest.
const spec = {
  id: "ashgate",
  theme: "city",
  label: "Ashgate",
  sizeHint: "small",
  lots: 4,
  accessibleRatio: 0.75,
  npcs: 0,
  buildings: [
    { block: 0, slot: 0, label: "The Vault", program: "office", floors: 3, storeys: 12, quest: { itemId: "ledger" } },
  ],
};

beforeAll(() => {
  writeFileSync(join(work, "ashgate.spec.json"), JSON.stringify(spec, null, 2));
  level("city", "--spec", join(work, "ashgate.spec.json"), "--seed", "5", "--out", cityFile);
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("the level toolkit's checkpoints", () => {
  it("builds the city the spec file asked for, quest and all", () => {
    const city = JSON.parse(readFileSync(cityFile, "utf8"));
    expect(city.instances.some((i) => i.rules.label.startsWith("The Vault"))).toBe(true);

    // the quest item is somewhere in the city, exactly once, on the vault's top floor
    const holding = city.instances.filter((i) =>
      i.rooms.some((r) => r.inventory.some((item) => item.itemId === "ledger"))
    );
    expect(holding).toHaveLength(1);
    expect(holding[0].goal).toEqual({ type: "discover_item", itemId: "ledger" });
    expect(holding[0].rules.floor).toBe(3); // the top floor you can walk into, not the top storey
  });

  it("saves a city under a name and opens it again unchanged", () => {
    level("save", "--in", cityFile, "--name", "ashgate", "--dir", work);
    const reopened = JSON.parse(level("load", "--name", "ashgate", "--dir", work));
    expect(reopened).toEqual(JSON.parse(readFileSync(cityFile, "utf8")));
  });

  it("refuses a name that is not a name, a checkpoint that is not there, and a broken city", () => {
    const notACity = join(work, "not-a-city.json");
    writeFileSync(notACity, JSON.stringify({ meta: { id: "x" }, instances: [] }));

    expect(() => level("save", "--in", cityFile, "--name", "../escape")).toThrowError(/BAD_NAME/);
    expect(() => level("load", "--name", "never-saved", "--dir", work)).toThrowError(/NOT_FOUND/);
    expect(() => level("save", "--in", notACity, "--name", "broken", "--dir", work)).toThrowError(
      /SCHEMA_INVALID/
    );
    expect(readdirSync(work)).not.toContain("broken.json");
  });
});
