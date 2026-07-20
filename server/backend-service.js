// server - the backend composition root. Assembles the author-time service (POST /adventure) and the
// play-time interaction service (POST /interaction) over ONE shared registry + persistence store, so an
// Adventure authored through the API is immediately interactable through the same process. Lives outside
// layers/, the one place cross-layer wiring is allowed.

import { validate, SCHEMA_ID } from "../harness/schemas.js";
import { createRegistry } from "../layers/asset-registry/src/index.js";
import { createPersistence } from "../layers/persistence/src/index.js";
import { createAuthorService } from "./author-service.js";
import { createInteractionService } from "./interaction-service.js";

/**
 * Build the full backend service. `overrides` lets a test inject a deterministic clock, a fake brain
 * (the play-time LLM stand-in), or its own store/registry; by default every layer is the real one and no
 * brain is wired (the npc deterministic stand-in resolves interactions).
 * @returns {{ createAdventure(body): object, getAdventure(id): object, resolveInteraction(body): Promise<object>, persistence: object, registry: object }}
 */
export function createBackendService(overrides = {}) {
  const registry = overrides.registry ?? createRegistry();
  const validateAdventure = (a) => validate(SCHEMA_ID.persistence.adventure, a);
  const persistence = overrides.persistence ?? createPersistence({ validateAdventure });

  const author = createAuthorService({ ...overrides, registry, persistence });
  const interaction = createInteractionService({
    persistence,
    registry,
    brain: overrides.brain,
    clock: overrides.clock,
  });

  return {
    createAdventure: author.createAdventure,
    getAdventure: author.getAdventure,
    resolveInteraction: interaction.resolveInteraction,
    exportAdventure: (id) => persistence.export(id),
    importAdventure: (bundle) => {
      try {
        return persistence.import(bundle);
      } catch (e) {
        // A bad uploaded file is the caller's to fix (422), unlike an author-time SCHEMA_INVALID from a
        // planner bug (a 500). Re-code the import failure so the two do not collapse to the same status.
        if (e.code === "SCHEMA_INVALID") throw Object.assign(new Error(e.message), { code: "IMPORT_INVALID", errors: e.errors });
        throw e;
      }
    },
    persistence,
    registry,
  };
}
