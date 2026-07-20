// server - the author-time composition root (backend).
//
// Like app/ for play-time, this file lives OUTSIDE layers/, so it is allowed to wire several layers
// together (the isolation checker only scans layers/*/src and layers/*/tests). It assembles the real
// interviewer -> narrator -> scenario-creator -> npc -> persistence pipeline behind `POST /adventure`.
// The only stand-ins are the deterministic planner and layout-graph generators the narrator and
// scenario-creator already default to; a local model swaps in behind those same seams later, with no
// change here.

import { validate, SCHEMA_ID } from "../harness/schemas.js";
import { createRegistry } from "../layers/asset-registry/src/index.js";
import { createPersistence } from "../layers/persistence/src/index.js";
import { createInterviewer } from "../layers/interviewer/src/index.js";
import * as narrator from "../layers/narrator/src/index.js";
import * as npc from "../layers/npc/src/index.js";
import * as scenarioCreator from "../layers/scenario-creator/src/index.js";

/**
 * Build the author service. `overrides` lets a test inject a deterministic clock or its own store;
 * by default every layer is the real one.
 * @returns {{ createAdventure(body): object, getAdventure(id): object, persistence: object }}
 */
export function createAuthorService(overrides = {}) {
  const registry = overrides.registry ?? createRegistry();
  const assetQuery = (q) => registry.query(q);
  // The schema loader is shared infra (harness is not a layer, so this is not a cross-layer import).
  // This is the composition root wiring persistence its Ajv, exactly as its contract expects.
  const validateAdventure = (a) => validate(SCHEMA_ID.persistence.adventure, a);
  const persistence = overrides.persistence ?? createPersistence({ validateAdventure });
  const interviewer = overrides.interviewer ?? createInterviewer();
  const clock = overrides.clock;

  function createAdventure(rawBody) {
    // The HTTP body is untrusted: coerce it into a canonical shape at the boundary. A non-object
    // body (null, an array, a primitive) is treated as empty; a supplied brief is normalized into a
    // valid CreativeBrief (fill defaults, drop unknown fields, clamp the difficulty enum) rather than
    // embedded verbatim, so a loose-but-reasonable brief authors an Adventure instead of failing the
    // Adventure schema on save. Without a brief, skip the interview and fill defaults.
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : {};
    const brief = body.brief != null ? normalizeBrief(body.brief) : interviewer.skip({ seedHints: body.seedHints });
    return narrator.composeAdventure(brief, {
      scenarioCreator,
      npc,
      persistence,
      assetQuery,
      clock,
      seed: body.seed,
    });
  }

  return {
    createAdventure,
    getAdventure: (id) => persistence.load(id),
    persistence,
    registry,
  };
}

const DIFFICULTIES = new Set(["easy", "normal", "hard"]);

// Coerce an untrusted brief into a valid CreativeBrief (persistence/schema/creative-brief.json):
// every required field present and correctly typed, unknown fields dropped, difficulty clamped to
// the enum. Matches the interviewer's "always valid, fills defaults" contract for the brief.
export function normalizeBrief(raw) {
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const strArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const brief = {
    universes: strArray(b.universes),
    likedNpcs: strArray(b.likedNpcs),
    tone: typeof b.tone === "string" ? b.tone : "adventurous",
    difficulty: DIFFICULTIES.has(b.difficulty) ? b.difficulty : "normal",
    themes: strArray(b.themes),
    freeText: typeof b.freeText === "string" ? b.freeText : "",
  };
  if (Number.isInteger(b.seed)) brief.seed = b.seed;
  return brief;
}
