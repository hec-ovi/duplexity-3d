// runtime - build and play one instance.
//
// This core owns the play-time SIMULATION: scene model, player kinematics, collision, portal/room
// tracking, pickups, goal evaluation, and (Phase 3) deterministic NPC behaviour + the single
// interaction call out to the backend. It has no three.js and imports no other layer's src; the
// three.js rendering shell (app.js + three-scene.js + npc-actor.js) sits on top and drives step()
// each frame. Backend collaborators (onInteraction, onHistoryAppend, ...) and asset-registry are
// injected via `deps`.
//
// Invariant: play-time state (player, npc states, discovered items, spoken lines) is a fresh
// structure, never a reference into the authored Adventure, so playing never mutates it.

import { buildSceneModel, roomAt } from "./scene-model.js";
import { movementVector } from "./controls.js";
import { resolveMove } from "./collision.js";
import { createPortalNav } from "./nav.js";
import { createNpcState, stepNpc, NPC_DEFAULTS } from "./npc-sim.js";
import { createSpeech } from "./speech.js";
import { buildSelfContext } from "./self-context.js";

// The stable entity id for "the player" in assembled contexts and interaction records.
export const PLAYER_REF = "player-1";

export class InstanceInvalidError extends Error {
  constructor(instanceId) {
    super(`instance invalid or not found: ${instanceId}`);
    this.code = "INSTANCE_INVALID";
  }
}

const DEFAULTS = {
  playerRadius: 0.3,
  moveSpeed: 3.5, // m/s
  pickupRadius: 1.0,
  maxStep: 0.15, // sub-step size (m) to keep fast moves from tunnelling thin walls
  npcSpeed: NPC_DEFAULTS.speed,
  npcRadius: NPC_DEFAULTS.radius,
};

export function createRuntime(deps = {}) {
  const cfg = {
    playerRadius: deps.playerRadius ?? DEFAULTS.playerRadius,
    moveSpeed: deps.moveSpeed ?? DEFAULTS.moveSpeed,
    pickupRadius: deps.pickupRadius ?? DEFAULTS.pickupRadius,
    maxStep: deps.maxStep ?? DEFAULTS.maxStep,
    npcSpeed: deps.npcSpeed ?? DEFAULTS.npcSpeed,
    npcRadius: deps.npcRadius ?? DEFAULTS.npcRadius,
  };

  let scene = null; // play-time summary (npc modes, discovered, goal)
  let model = null; // geometry/collider model
  let player = null; // { position:{x,y,z}, yaw, currentRoom }
  let nav = null; // pathfinder ({ findPath })
  let speech = null; // in-scene bubble model
  const npcStates = new Map(); // npcId -> mutable behaviour state
  const npcDefs = new Map(); // npcId -> authored fields (name, persona, allowedModes, bodyRef, ...)
  let interactionSeq = 0;

  // Shared world context for one NPC tick (rebuilt each step so the player position is current).
  function npcCtx() {
    return {
      model,
      colliders: model.colliders,
      nav,
      player: { x: player.position.x, y: player.position.y, z: player.position.z },
      speed: cfg.npcSpeed,
      radius: cfg.npcRadius,
    };
  }

  // The animation clip names the NPC's body can perform, from the injected registry (empty when the
  // asset is not registered yet: we cannot prove incapacity, so we do not reject on it here).
  function bodyAnimations(bodyRef) {
    if (!deps.registry || !bodyRef) return [];
    try {
      return deps.registry.get(bodyRef)?.animations ?? [];
    } catch {
      return [];
    }
  }

  // Resolve an InteractionResult target to a world point, leniently (any known world entity or a
  // vec3). Returns null when there is no target or it cannot be resolved.
  function resolveWorldTarget(target) {
    if (target == null) return null;
    if (Array.isArray(target)) return target.length >= 3 ? { x: target[0], z: target[2] } : null;
    if (typeof target !== "string") return null;
    if (target === PLAYER_REF) return { x: player.position.x, z: player.position.z };
    const npc = npcStates.get(target);
    if (npc) return { x: npc.position.x, z: npc.position.z };
    const item = model.items.find((i) => i.itemId === target);
    if (item) return { x: item.position.x, z: item.position.z };
    const obj = model.objects.find((o) => o.id === target);
    if (obj) return { x: obj.position.x, z: obj.position.z };
    return null;
  }

  // Strict target check against a live selfContext: a string target MUST name something the context
  // actually advertises (a nearby entity, an exit/portal, or a notable object); a vec3 target is
  // accepted as a position; no target is fine. Returns { ok, point, ref }. This mirrors the contract
  // ("target references an entity or position that exists in the given selfContext"): everything the
  // snapshot exposes is a legal target, not just nearby entities.
  function targetInContext(target, selfContext) {
    if (target == null) return { ok: true, point: null, ref: null };
    if (Array.isArray(target)) {
      const ok = target.length >= 3 && target.every((n) => typeof n === "number");
      return ok ? { ok: true, point: { x: target[0], z: target[2] }, ref: null } : { ok: false };
    }
    if (typeof target !== "string") return { ok: false };

    const where = selfContext.whereIAm;
    const ent = where.nearbyEntities.find((e) => e.id === target);
    if (ent) return { ok: true, point: { x: ent.position[0], z: ent.position[2] }, ref: target };
    if (where.exits.includes(target)) {
      const p = model.portals.find((pp) => pp.id === target);
      return p ? { ok: true, point: { x: p.center.x, z: p.center.z }, ref: target } : { ok: false };
    }
    if (where.notableObjects.includes(target)) {
      const o = model.objects.find((oo) => oo.id === target);
      return o ? { ok: true, point: { x: o.position.x, z: o.position.z }, ref: target } : { ok: false };
    }
    return { ok: false };
  }

  // Apply a mode/target/utterance to an NPC's play-time state. `strictContext` (when given) enforces
  // the target-must-exist contract; without it the resolution is lenient. Returns the applied result,
  // or the deterministic fallback (keep current mode, silent) when the decision is invalid.
  function applyDecision(npcId, result, strictContext) {
    const state = npcStates.get(npcId);
    const def = npcDefs.get(npcId);
    if (!state || !def) throw new Error(`unknown npc: ${npcId}`);
    const fallback = { newMode: state.mode };
    if (!result || typeof result.newMode !== "string") return fallback;
    if (!def.allowedModes.includes(result.newMode)) return fallback; // INVALID_DECISION: off-contract mode

    let point;
    let ref;
    if (strictContext) {
      const t = targetInContext(result.target, strictContext);
      if (!t.ok) return fallback; // INVALID_DECISION: target not in context
      point = t.point;
      ref = t.ref;
    } else {
      point = resolveWorldTarget(result.target);
      ref = typeof result.target === "string" ? result.target : null;
    }

    state.mode = result.newMode;
    scene.npcModes[npcId] = result.newMode;
    state.target = point; // {x,z} destination for move_to (null when none)
    state.targetRef = ref; // string ref echoed back in the next selfContext.myState.target
    if (result.utterance) speech.say(npcId, result.utterance);
    if (result.memoryDelta) state.memory.push(result.memoryDelta);
    return result;
  }

  const api = {
    load(adventure, instanceId) {
      const instance = adventure.instances?.find((i) => i.id === instanceId);
      if (!instance || !instance.rooms?.length || !instance.spawn || !Array.isArray(instance.npcs)) {
        throw new InstanceInvalidError(instanceId);
      }
      model = buildSceneModel(instance);
      nav = deps.nav ?? createPortalNav(model);
      speech = createSpeech();
      const seed = Number(adventure.meta?.seed ?? adventure.creativeBrief?.seed ?? 0) || 0;

      npcStates.clear();
      npcDefs.clear();
      interactionSeq = 0;
      for (const placement of model.npcs) {
        npcStates.set(placement.id, createNpcState(placement, { seed }));
        npcDefs.set(placement.id, {
          name: placement.name,
          persona: placement.persona,
          disposition: placement.disposition,
          allowedModes: placement.allowedModes ?? [],
          bodyRef: placement.bodyRef,
          homeRoom: placement.homeRoom,
        });
      }

      scene = {
        instanceId,
        rooms: instance.rooms.map((r) => r.id),
        portals: (instance.portals ?? []).map((p) => p.id),
        npcModes: Object.fromEntries([...npcStates.values()].map((s) => [s.id, s.mode])),
        goal: instance.goal,
        discovered: new Set(),
        goalMet: false,
      };
      const spawn = model.spawn;
      player = {
        position: { x: spawn.position.x, y: model.groundY, z: spawn.position.z },
        yaw: spawn.facing,
        currentRoom: roomAt(model, spawn.position.x, spawn.position.z),
      };
      return scene;
    },

    getScene() {
      return scene;
    },
    getSceneModel() {
      return model;
    },
    getPlayer() {
      return player;
    },
    getNpcs() {
      return [...npcStates.values()].map((s) => ({
        id: s.id,
        name: s.name,
        disposition: s.disposition,
        bodyRef: s.bodyRef,
        position: { x: s.position.x, y: s.position.y, z: s.position.z },
        facing: s.facing,
        mode: s.mode,
        animation: s.animation,
      }));
    },
    getNpcState(npcId) {
      return npcStates.get(npcId) ?? null;
    },
    getSpeech() {
      return speech;
    },
    setYaw(yaw) {
      if (player) player.yaw = yaw;
    },
    config() {
      return { ...cfg };
    },

    // Advance one frame: move the player from input, resolve collisions, track their room (portal
    // traversal), advance every NPC's deterministic behaviour, age speech bubbles, and auto-pick-up
    // nearby items (which can meet the goal).
    step(dt, input = {}) {
      if (!model || !player) throw new InstanceInvalidError(scene?.instanceId);
      const from = { x: player.position.x, z: player.position.z };
      const delta = movementVector(input, player.yaw, cfg.moveSpeed, dt);

      let pos = from;
      const len = Math.hypot(delta.x, delta.z);
      const n = Math.max(1, Math.ceil(len / cfg.maxStep));
      // Anchor each sub-step to the ACCUMULATED position, not the frame start, so every resolveMove
      // advances at most maxStep. Anchoring to `from` would let a blocked axis keep marching the
      // target along the ideal line until it overshoots (and tunnels through) a thin wall.
      const inc = { x: delta.x / n, z: delta.z / n };
      for (let i = 0; i < n; i++) {
        pos = resolveMove(model.colliders, pos, { x: pos.x + inc.x, z: pos.z + inc.z }, cfg.playerRadius);
      }
      player.position.x = pos.x;
      player.position.z = pos.z;

      const room = roomAt(model, pos.x, pos.z);
      if (room !== player.currentRoom) {
        const prev = player.currentRoom;
        player.currentRoom = room;
        deps.onRoomChange?.(prev, room);
      }

      // Advance NPCs against the freshly moved player, then age bubbles.
      const ctx = npcCtx();
      for (const state of npcStates.values()) {
        stepNpc(state, dt, ctx);
        scene.npcModes[state.id] = state.mode;
      }
      speech.tick(dt);

      for (const item of model.items) {
        if (scene.discovered.has(item.itemId)) continue;
        if (Math.hypot(item.position.x - pos.x, item.position.z - pos.z) <= cfg.pickupRadius) {
          api.discover(item.itemId);
        }
      }

      return { position: player.position, yaw: player.yaw, currentRoom: player.currentRoom };
    },

    // The awareness snapshot handed to the npc brain at interaction time (npc/self-context.json).
    assembleSelfContext(npcId) {
      const state = npcStates.get(npcId);
      const def = npcDefs.get(npcId);
      if (!state || !def) throw new Error(`unknown npc: ${npcId}`);
      return buildSelfContext({
        def,
        state,
        playerRef: PLAYER_REF,
        player: { x: player.position.x, y: player.position.y, z: player.position.z },
        others: [...npcStates.values()].map((s) => ({ id: s.id, position: s.position })),
        model,
        animations: bodyAnimations(def.bodyRef),
      });
    },

    // The ONE per-interaction call that may reach the backend. Assembles selfContext, asks the
    // injected brain (deps.onInteraction) for a decision, validates it against that context, applies
    // the mode/utterance/memory, and archives the exchange. On a missing brain, a thrown error, or an
    // off-contract decision it applies the deterministic fallback (keep mode, stay silent).
    interact(npcId, interaction) {
      if (!npcStates.has(npcId)) throw new Error(`unknown npc: ${npcId}`);
      const selfContext = api.assembleSelfContext(npcId);
      let decision = null;
      try {
        decision = deps.onInteraction ? deps.onInteraction(selfContext, interaction) : null;
      } catch {
        decision = null; // MODEL_UNAVAILABLE / MODEL_TIMEOUT -> fallback
      }
      const applied = applyDecision(npcId, decision, selfContext);
      interactionSeq += 1;
      deps.onHistoryAppend?.({
        id: `${scene.instanceId}:${npcId}:${interactionSeq}`,
        at: interactionSeq,
        instanceId: scene.instanceId,
        npcId,
        playerRef: interaction?.playerRef ?? PLAYER_REF,
        interaction,
        result: applied,
      });
      return applied;
    },

    // Apply a backend NPC decision directly (lenient target resolution). Kept for direct/tested use;
    // interact() is the full assemble->decide->validate path.
    applyInteractionResult(npcId, result) {
      return applyDecision(npcId, result, null);
    },

    discover(itemId) {
      scene.discovered.add(itemId);
      return api.evaluateGoal();
    },

    evaluateGoal() {
      const met = goalMet(scene.goal, scene);
      if (met && !scene.goalMet) {
        scene.goalMet = true;
        deps.onGoalMet?.(scene.instanceId, { instanceId: scene.instanceId, goalMet: true });
        deps.onRequestNextInstance?.();
      }
      return met;
    },
  };

  return api;
}

function goalMet(goal, scene) {
  switch (goal?.type) {
    case "discover_item":
      return scene.discovered.has(goal.itemId);
    // reach_exit, unlock_dialog, defeat, survive, sequence, all wire in as behaviours land.
    default:
      return false;
  }
}
