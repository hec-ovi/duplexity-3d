// tools - keep a city you liked, and open it again later.
//
// A checkpoint is the portable Bundle `persistence` already exports, written to a file the author
// names. Saving proves the Adventure against the current schema first, so anything on disk is
// something that will load; loading migrates it forward the same way an upload would be.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPersistence } from "../../layers/persistence/src/index.js";
import { validate, SCHEMA_ID } from "../../harness/schemas.js";

const NAME = /^[a-z0-9][a-z0-9._-]*$/i;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Where checkpoints live: `DUPLEXITY_CHECKPOINTS`, or `checkpoints/` beside where you ran the tool. */
export function checkpointsDir(env = process.env) {
  return env.DUPLEXITY_CHECKPOINTS || join(process.cwd(), "checkpoints");
}

function pathFor(name, dir) {
  if (typeof name !== "string" || !NAME.test(name)) {
    throw fail("BAD_NAME", `"${name}" is not a checkpoint name: letters, digits, dot, dash, underscore`);
  }
  return join(dir, `${name}.json`);
}

const store = () =>
  createPersistence({ validateAdventure: (a) => validate(SCHEMA_ID.persistence.adventure, a) });

/** Write an Adventure to `<dir>/<name>.json` as a Bundle. Returns where it went. */
export function saveCheckpoint(adventure, name, { dir = checkpointsDir() } = {}) {
  const file = pathFor(name, dir);
  const persistence = store();
  const { id } = persistence.save(adventure); // throws SCHEMA_INVALID rather than saving a broken city
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${persistence.exportFile(id)}\n`);
  return { file, id };
}

/** Read a checkpoint back into an Adventure, migrated forward and validated. */
export function loadCheckpoint(name, { dir = checkpointsDir() } = {}) {
  const file = pathFor(name, dir);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw fail("NOT_FOUND", `no checkpoint named "${name}" in ${dir}`);
  }
  return { adventure: store().importFile(text), file };
}
