// The skill ships in three places so different installers can find it. They must be the same file:
// a stale copy is a skill that teaches an agent the wrong commands.
import { describe, it, expect } from "vitest";
import { readSkill, syncSkill, SKILL_SOURCE, SKILL_COPIES } from "./sync-skill.js";

describe("SKILL.md copies", () => {
  it("every installable copy matches the root file (run `npm run skill:sync` if this fails)", () => {
    const source = readSkill(SKILL_SOURCE);
    for (const path of SKILL_COPIES) {
      expect(readSkill(path), path).toBe(source);
    }
  });

  it("sync writes the copies from the root file", () => {
    expect(syncSkill()).toEqual(SKILL_COPIES);
    for (const path of SKILL_COPIES) {
      expect(readSkill(path)).toBe(readSkill(SKILL_SOURCE));
    }
  });

  it("the skill declares a name and a description an agent can match on", () => {
    const frontmatter = readSkill(SKILL_SOURCE).split("---")[1] ?? "";
    expect(frontmatter).toMatch(/^name: level-forge$/m);
    expect(frontmatter).toMatch(/^description: .{80,}/m);
  });
});
