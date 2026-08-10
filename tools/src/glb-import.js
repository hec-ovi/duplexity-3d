// tools - bring a building somebody else built into a world.
//
// A GLB is a file on disk or a building the buildings toolkit has built. Either way it is measured
// here, so the plot the city cuts for it is its real footprint and nothing is ever scaled.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { measure } from "../../layers/glb/src/index.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Where the buildings toolkit keeps its projects, in the order it looks: `BUILDINGS_HOME`, a
 * `.buildings` folder next to the work, then the user's own.
 */
export function buildingsHome(env = process.env, cwd = process.cwd()) {
  if (env.BUILDINGS_HOME) return env.BUILDINGS_HOME;
  if (existsSync(join(cwd, ".buildings"))) return join(cwd, ".buildings");
  return join(homedir(), ".glb-buildings");
}

/**
 * The file behind a name: a path to a GLB, or a building the buildings toolkit has built. The name
 * comes back with it, because every building that toolkit writes is called `model.glb` and the
 * building's own name is the one worth keeping.
 *
 * @returns {{ file: string, name: string }}
 */
export function resolveGlb(what, { cwd = process.cwd(), env = process.env } = {}) {
  if (typeof what !== "string" || !what) throw fail("BAD_ASSET", "name a .glb file, or a building you have built");

  if (what.toLowerCase().endsWith(".glb")) {
    const file = isAbsolute(what) ? what : resolve(cwd, what);
    if (!existsSync(file)) throw fail("NOT_FOUND", `no file at ${file}`);
    return { file, name: basename(file, ".glb") };
  }

  const built = join(buildingsHome(env, cwd), "projects", what, "build", "model.glb");
  if (existsSync(built)) return { file: built, name: what };
  throw fail(
    "NOT_FOUND",
    `no .glb at "${what}", and no building called "${what}" has been built (looked in ${built})`
  );
}

const PLAIN = /[^a-z0-9._-]+/gi;

/** `The Vault` -> `the-vault`: a name that is safe as a file and readable as an id. */
export function slug(name) {
  return String(name).replace(PLAIN, "-").toLowerCase();
}

/**
 * Measure a GLB and describe it the way a catalog carries it.
 *
 * @param {string} file       absolute path to the .glb
 * @param {object} opts
 * @param {string} opts.id
 * @param {string} opts.glbUrl where the file will sit, relative to what loads it
 * @param {string} [opts.theme]
 * @param {string} [opts.license] the file is yours unless you say otherwise
 * @param {string} [opts.doorFace] which side its own front door is on; without one the city builds a door
 * @param {number} [opts.floors]
 * @returns {{ entry: object, facts: object }}
 */
export function describeGlb(file, { id, glbUrl, theme = "city", license = "own-work", doorFace, floors }) {
  const facts = measure(readFileSync(file));
  return {
    facts,
    entry: {
      id,
      kind: "building",
      tags: ["building", theme],
      theme,
      size: facts.size,
      glbUrl,
      anchor: facts.anchor,
      doors: doorFace ? "own" : "none",
      ...(doorFace ? { doorFace } : {}),
      ...(floors ? { floors } : {}),
      license,
      source: "generated",
    },
  };
}
