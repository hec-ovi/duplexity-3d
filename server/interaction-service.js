// server - the play-time interaction service (backend). Like author-service.js it lives OUTSIDE
// layers/, so it may wire several layers together (the isolation checker only scans layers/*/src and
// layers/*/tests). It backs `POST /interaction`: run one NPC's brain on a live snapshot and archive the
// exchange to the Adventure's history.
//
// The model call is the ONLY async, expensive step, and it is the only place a real local GGUF appears.
// By default no brain is injected and the npc layer's deterministic stand-in resolves the turn (still
// no LLM, matching the rest of the engine); a test injects a fake LLM as `brain`. Whatever the brain
// returns is deterministically re-validated by the npc layer before it is applied or stored, and a
// thrown/absent model degrades to the safe fallback, so the route never 500s on the model.

import { validate, SCHEMA_ID } from "../harness/schemas.js";
import * as npc from "../layers/npc/src/index.js";
import * as narrator from "../layers/narrator/src/index.js";

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function badRequest(message, errors) {
  return Object.assign(new Error(message), { code: "INTERACTION_INVALID", errors });
}
function notFound(what) {
  return Object.assign(new Error(`${what} not found`), { code: "NOT_FOUND" });
}
function unprocessable(message, errors) {
  return Object.assign(new Error(message), { code: "SELF_CONTEXT_INVALID", errors });
}

/**
 * The runtime assembles the live awareness snapshot client-side, but the security-critical fields are
 * authored, not live: rebuild whoAmI / myBody.animations / allowedModes from the stored NpcDef so a
 * client can never make an NPC adopt a mode or a body its authored definition forbids. The live parts
 * (where it is, who is nearby, its current mode) are taken from the client snapshot, falling back to the
 * NpcDef's home/spawn/startMode when absent so a minimal request still resolves.
 */
function authoritativeSelfContext(clientSelfContext, def, animations) {
  const sc = isObject(clientSelfContext) ? clientSelfContext : {};
  const whereIAm = isObject(sc.whereIAm)
    ? sc.whereIAm
    : {
        roomId: def.homeRoom,
        position: def.spawn.position,
        nearbyEntities: [],
        notableObjects: [],
        exits: [],
      };
  // myState is live (client-supplied), but its `mode` is security-relevant: the self-context schema only
  // checks it against the mode enum, so clamp it to the authored allowedModes here (a client cannot
  // claim the NPC is currently in a mode its definition forbids). Rebuild it explicitly so no unknown
  // field slips past the schema.
  const clientState = isObject(sc.myState) ? sc.myState : {};
  const myState = {
    mode: def.allowedModes.includes(clientState.mode) ? clientState.mode : def.startMode,
    memory: Array.isArray(clientState.memory) ? clientState.memory : [],
  };
  if (typeof clientState.target === "string") myState.target = clientState.target;
  return {
    whoAmI: {
      name: def.name,
      persona: def.persona,
      disposition: def.disposition,
      ...(typeof sc.whoAmI?.goal === "string" ? { goal: sc.whoAmI.goal } : {}),
    },
    myBody: {
      animations: [...animations],
      actions: Array.isArray(sc.myBody?.actions) ? sc.myBody.actions : [],
    },
    whereIAm,
    myState,
    allowedModes: [...def.allowedModes],
  };
}

/**
 * @param {object} deps { persistence, registry, brain?, clock? }
 *   - persistence: the shared Adventure store (load + appendHistory).
 *   - registry: asset-registry (to read a body's animation clips from its bodyRef).
 *   - brain?: the injected text provider `(selfContext, interaction, { prompt }) -> raw|Promise<raw>`.
 *     Omitted -> the npc deterministic stand-in resolves the turn.
 *   - clock?: () -> Date, injected so `at` timestamps are deterministic in tests.
 */
export function createInteractionService(deps = {}) {
  const { persistence, registry, brain, clock } = deps;

  function animationsFor(bodyRef) {
    try {
      return registry?.get(bodyRef)?.animations ?? [];
    } catch {
      return [];
    }
  }

  async function runBrain(selfContext, interaction) {
    if (!brain) return npc.resolveInteraction(selfContext, interaction);
    let raw = null;
    try {
      raw = await brain(selfContext, interaction, { prompt: npc.buildInteractionPrompt(selfContext, interaction) });
    } catch {
      raw = null; // model unavailable / timeout -> safe fallback
    }
    return npc.sanitizeDecision(raw, selfContext);
  }

  async function resolveInteraction(rawBody) {
    const body = isObject(rawBody) ? rawBody : {};
    const { adventureId, instanceId, npcId } = body;
    if (typeof adventureId !== "string") throw badRequest("adventureId is required");

    const iv = validate(SCHEMA_ID.npc.interaction, body.interaction);
    if (!iv.ok) throw badRequest("interaction is not a valid Interaction", iv.errors);
    const interaction = body.interaction;

    const adventure = persistence.load(adventureId); // throws NOT_FOUND if unknown
    const instance = (adventure.instances ?? []).find((x) => x.id === instanceId);
    if (!instance) throw notFound(`instance ${instanceId}`);
    const def = (instance.npcs ?? []).find((n) => n.id === npcId);
    if (!def) throw notFound(`npc ${npcId}`);

    const selfContext = authoritativeSelfContext(body.selfContext, def, animationsFor(def.bodyRef));
    const scv = validate(SCHEMA_ID.npc.selfContext, selfContext);
    if (!scv.ok) throw unprocessable("assembled selfContext failed validation", scv.errors);

    const result = await runBrain(selfContext, interaction);

    const record = {
      instanceId,
      npcId,
      playerRef: interaction.playerRef,
      interaction,
      result,
      at: (clock?.() ?? new Date()).toISOString(),
    };
    narrator.recordInteraction(adventureId, record, { persistence });

    return { result, record };
  }

  return { resolveInteraction };
}
