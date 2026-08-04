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

// How close (m) to a portal's opening counts as walking into it: reaching an EXIT (reach_exit) or
// stepping through a door that leads to another instance.
const PORTAL_REACH = 1.5;
const STAND_CLEAR = 2.4; // metres to keep between an arrival and the door it came through
const OFF_WALL = 1.3; // and never closer than this to a wall, whatever the nudge asked for

/**
 * Nudge an arrival away from the doors that leave the room and turn it to look into the place.
 * Mutates `at`; returns the yaw to use, or null when the room has no way out to face away from.
 */
function standInside(model, room, at) {
  const doors = model.portals.filter(
    (p) => p.roomA === room.id && (p.roomB === "LINK" || p.roomB === "EXIT")
  );
  if (doors.length === 0) return null;

  let inX = 0;
  let inZ = 0;
  for (const door of doors) {
    const dx = at.x - door.center.x;
    const dz = at.z - door.center.z;
    const away = Math.hypot(dx, dz) || 1;
    inX += dx / away;
    inZ += dz / away;
    if (away < STAND_CLEAR) {
      at.x += (dx / away) * (STAND_CLEAR - away);
      at.z += (dz / away) * (STAND_CLEAR - away);
    }
  }
  // Stand in the room, not against its far wall: a small room simply keeps you near its middle.
  at.x = Math.min(room.max.x - OFF_WALL, Math.max(room.min.x + OFF_WALL, at.x));
  at.z = Math.min(room.max.z - OFF_WALL, Math.max(room.min.z + OFF_WALL, at.z));

  const length = Math.hypot(inX, inZ);
  return length < 1e-6 ? null : Math.atan2(-inX / length, -inZ / length);
}

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

  // Is this portal passable right now? A portal with no authored `lock` has nothing to satisfy and is
  // simply open: an ordinary doorway is never worth asking about. A locked one is decided by map-state
  // (which knows what the run has cleared), so the runtime asks rather than deciding. No injected
  // answer means no locks, which is every pre-city adventure.
  function portalOpen(portal) {
    if (!portal.lock) return true;
    if (!deps.isPortalOpen) return true;
    try {
      return deps.isPortalOpen(portal.id) !== false;
    } catch {
      return false; // an unanswerable lock fails closed
    }
  }

  // Record a mode an NPC has been in (for goal evaluation: unlock_dialog needs "reached mode X",
  // defeat needs "was dead"). Sticky: once seen, it stays in the history.
  function recordMode(id, mode) {
    if (!scene) return;
    let seen = scene.modeHistory.get(id);
    if (!seen) {
      seen = new Set();
      scene.modeHistory.set(id, seen);
    }
    seen.add(mode);
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
    recordMode(npcId, result.newMode); // an interaction drove this mode (unlock_dialog); passive sim modes are not counted
    state.target = point; // {x,z} destination for move_to (null when none)
    state.targetRef = ref; // string ref echoed back in the next selfContext.myState.target
    if (result.utterance) speech.say(npcId, result.utterance);
    if (result.memoryDelta) state.memory.push(result.memoryDelta);
    if (typeof result.flag === "string" && result.flag) scene.flags.add(result.flag); // a named story flag (unlock_dialog.flag)
    return result;
  }

  const api = {
    // `opts.spawnRoomId` drops the player in the centre of that room instead of the instance's own
    // spawn: the far side of a door they just walked through (a street, a stair landing).
    // `opts.spawnAt` / `opts.facing` place them exactly, which is what a front door onto a street uses.
    load(adventure, instanceId, opts = {}) {
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
        reachedExits: new Set(), // EXIT portals the player has walked up to (reach_exit)
        exitArmed: new Set(), // portals the player has been clear of, so one next to the spawn does not auto-fire
        usedDoors: new Set(), // cross-instance doors already reported through onTransit
        visitedRooms: new Set(), // rooms the player has stood in; what the blueprint may reveal
        modeHistory: new Map([...npcStates.values()].map((s) => [s.id, new Set()])), // modes an INTERACTION has driven each NPC into (unlock_dialog); seeded empty so a startMode is not counted
        flags: new Set(), // named story flags an interaction result sets (unlock_dialog.flag)
        elapsed: 0, // accumulated sim seconds (survive)
        seqProgress: new Map(), // per-sequence-goal step index (ordered composites)
        goalMet: false,
      };
      // Where you land. A door can name the exact spot (`spawnAt`), which is the only thing that
      // works on open ground: the middle of a whole street is nowhere near the door you came out of.
      const arrival = opts.spawnRoomId
        ? model.rooms.find((r) => r.id === opts.spawnRoomId)
        : null;
      const spawn = model.spawn;
      const at = opts.spawnAt
        ? { x: opts.spawnAt[0], z: opts.spawnAt[2] }
        : arrival
          ? { x: arrival.center.x, z: arrival.center.z }
          : { x: spawn.position.x, z: spawn.position.z };
      // Arriving in a room, stand clear of the way out and look into the place, not back at the
      // door: coming through a front door and walking straight out again is not an entrance.
      const facingIn = opts.spawnAt || !arrival ? null : standInside(model, arrival, at);
      player = {
        position: { x: at.x, y: model.groundY, z: at.z },
        yaw: opts.facing ?? facingIn ?? spawn.facing,
        currentRoom: roomAt(model, at.x, at.z),
      };
      if (player.currentRoom) scene.visitedRooms.add(player.currentRoom);
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

    // The floor plan for the map overlay: this instance seen from above, holding ONLY what the
    // player has walked into. Rooms appear once entered and stay; a door appears once a room it
    // stands on is known, with `open` reflecting its lock right now.
    blueprint() {
      if (!model) return null;
      const seen = scene.visitedRooms;
      const rooms = model.rooms
        .filter((r) => seen.has(r.id))
        .map((r) => ({
          id: r.id,
          name: r.name ?? null,
          min: { ...r.min },
          max: { ...r.max },
          center: { x: r.center.x, z: r.center.z },
          here: r.id === player.currentRoom,
        }));
      const blocks = model.blocks
        .filter((b) => seen.has(b.room))
        .map((b) => ({ id: b.id, min: { ...b.min }, max: { ...b.max }, label: b.label }));
      const doors = model.portals
        .filter((p) => seen.has(p.roomA) || seen.has(p.roomB))
        .map((p) => ({
          id: p.id,
          center: { x: p.center.x, z: p.center.z },
          axis: p.axis,
          width: p.size[0],
          kind: p.link?.kind ?? (p.roomA === "EXIT" || p.roomB === "EXIT" ? "exit" : "room"),
          to: p.link?.instanceId ?? null,
          open: portalOpen(p),
        }));
      return {
        instanceId: scene.instanceId,
        label: model.rules.label ?? scene.instanceId,
        mapKind: model.rules.mapKind ?? "instance",
        floor: model.rules.floor ?? null,
        player: { x: player.position.x, z: player.position.z, yaw: player.yaw },
        rooms,
        blocks,
        doors,
      };
    },

    getVisitedRooms() {
      return [...scene.visitedRooms];
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
      scene.elapsed += dt; // survive goals count sim time, never a wall clock
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
        if (room) scene.visitedRooms.add(room); // the blueprint may now draw it
        deps.onRoomChange?.(prev, room);
      }

      // A portal opening has no collider, so the player walks through it. Coming within PORTAL_REACH
      // of its centre counts as walking into it, but only once the portal has been "armed" by the
      // player standing clear of it first, so the door you just arrived through does not fire on
      // frame 1 and bounce you straight back.
      for (const p of model.portals) {
        const isExit = p.roomA === "EXIT" || p.roomB === "EXIT";
        if (!isExit && !p.link) continue;
        const d = Math.hypot(p.center.x - pos.x, p.center.z - pos.z);
        if (d > PORTAL_REACH) {
          scene.exitArmed.add(p.id);
          continue;
        }
        if (!scene.exitArmed.has(p.id)) continue;
        if (!portalOpen(p)) continue; // a locked gate is scenery until map-state opens it
        if (isExit) {
          scene.reachedExits.add(p.id);
        } else if (!scene.usedDoors.has(p.id)) {
          // One report per door: the host loads the linked instance (which resets this scene), and a
          // host that ignores the event must not be told again every frame.
          scene.usedDoors.add(p.id);
          deps.onTransit?.({
            portalId: p.id,
            from: scene.instanceId,
            fromRoom: player.currentRoom,
            link: p.link,
          });
        }
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

      api.evaluateGoal(); // time / position / mode goals latch during play, not only on a pickup
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
      // Capture this interaction's identity BEFORE applying/evaluating: evaluating the goal can fire
      // onRequestNextInstance, whose host may synchronously load() the next instance (resetting scene
      // and interactionSeq). Archiving must use the pre-reload id/seq, not the next instance's.
      const instanceId = scene.instanceId;
      interactionSeq += 1;
      const seq = interactionSeq;
      let decision = null;
      try {
        decision = deps.onInteraction ? deps.onInteraction(selfContext, interaction) : null;
      } catch {
        decision = null; // MODEL_UNAVAILABLE / MODEL_TIMEOUT -> fallback
      }
      const applied = applyDecision(npcId, decision, selfContext);
      deps.onHistoryAppend?.({
        id: `${instanceId}:${npcId}:${seq}`,
        at: seq,
        instanceId,
        npcId,
        playerRef: interaction?.playerRef ?? PLAYER_REF,
        interaction,
        result: applied,
      });
      api.evaluateGoal(); // an interaction can meet a goal (defeat, unlock_dialog); fire AFTER archiving
      return applied;
    },

    // Apply a backend NPC decision directly (lenient target resolution). Kept for direct/tested use;
    // interact() is the full assemble->decide->validate path.
    applyInteractionResult(npcId, result) {
      const applied = applyDecision(npcId, result, null);
      api.evaluateGoal(); // defeat / unlock_dialog can complete on a direct decision too
      return applied;
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

// Evaluate an instance win condition against the live play-time scene, no LLM. Every primitive is
// monotonic/latched (a met goal stays met), so composites are stable: `all` needs every sub-goal, and
// `sequence` advances a per-goal step index only when the current step is met, enforcing order.
function goalMet(goal, scene) {
  switch (goal?.type) {
    case "discover_item":
      return scene.discovered.has(goal.itemId);

    case "reach_exit":
      return goal.portalId ? scene.reachedExits.has(goal.portalId) : scene.reachedExits.size > 0;

    case "defeat":
      return scene.npcModes[goal.npcId] === "dead";

    case "survive":
      return scene.elapsed >= goal.seconds;

    case "unlock_dialog": {
      const modes = scene.modeHistory.get(goal.npcId) ?? new Set(); // modes an interaction drove this NPC into
      if (goal.requiredMode && !modes.has(goal.requiredMode)) return false;
      if (goal.flag && !scene.flags.has(goal.flag)) return false;
      // with no requiredMode/flag, "unlock" just means the player engaged and drove the NPC's mode
      if (!goal.requiredMode && !goal.flag) return modes.size > 0;
      return true;
    }

    case "all":
      // an empty composite is not a win (never auto-complete on frame 1); the schema requires >= 1 anyway
      return goal.of?.length > 0 && goal.of.every((g) => goalMet(g, scene));

    case "sequence": {
      const steps = goal.steps ?? [];
      if (steps.length === 0) return false;
      let idx = scene.seqProgress.get(goal) ?? 0;
      while (idx < steps.length && goalMet(steps[idx], scene)) idx += 1;
      scene.seqProgress.set(goal, idx);
      return idx >= steps.length;
    }

    default:
      return false;
  }
}
