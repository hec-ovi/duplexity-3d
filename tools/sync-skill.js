#!/usr/bin/env node
// Keep the installable copies of SKILL.md identical to the one at the repo root.
//
// The root file is the only one anyone edits. Different installers look in different places (a plain
// skills/ directory, a plugin marketplace), and each wants a real file, so the same bytes live in all
// three. `npm run skill:sync` writes them; `tools/skill-copies.test.js` fails if they ever drift.

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const SKILL_SOURCE = join(ROOT, "SKILL.md");
export const SKILL_COPIES = [
  join(ROOT, "skills", "level-forge", "SKILL.md"),
  join(ROOT, "plugins", "level-forge", "skills", "level-forge", "SKILL.md"),
];

export function readSkill(path) {
  return readFileSync(path, "utf8");
}

export function syncSkill() {
  for (const target of SKILL_COPIES) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(SKILL_SOURCE, target);
  }
  return SKILL_COPIES;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const path of syncSkill()) console.log(`synced ${path.replace(`${ROOT}/`, "")}`);
}
