// runtime - build and play one instance.
//
// Phase 2: this core owns the play-time SIMULATION (scene model, player kinematics, collision,
// portal/room tracking, pickups, goal evaluation) with no three.js and no backend imports. The
// three.js rendering shell (app.js + three-scene.js) sits on top and drives step() each frame.
// Backend collaborators (and asset-registry) are injected via `deps`; this src imports no other
// layer's src.
//
// Invariant preserved from Phase 1: play-time state (player, npc modes, discovered items) is a
// fresh structure, never a reference into the authored Adventure, so playing never mutates it.

import { buildSceneModel, roomAt } from "./scene-model.js";
import { movementVector } from "./controls.js";
import { resolveMove } from "./collision.js";

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
};

export function createRuntime(deps = {}) {
  const cfg = {
    playerRadius: deps.playerRadius ?? DEFAULTS.playerRadius,
    moveSpeed: deps.moveSpeed ?? DEFAULTS.moveSpeed,
    pickupRadius: deps.pickupRadius ?? DEFAULTS.pickupRadius,
    maxStep: deps.maxStep ?? DEFAULTS.maxStep,
  };

  let scene = null; // Phase 1 play-time summary (npc modes, discovered, goal)
  let model = null; // Phase 2 geometry/collider model
  let player = null; // { position:{x,y,z}, yaw, currentRoom }

  const api = {
    load(adventure, instanceId) {
      const instance = adventure.instances?.find((i) => i.id === instanceId);
      if (!instance || !instance.rooms?.length || !instance.spawn || !Array.isArray(instance.npcs)) {
        throw new InstanceInvalidError(instanceId);
      }
      model = buildSceneModel(instance);
      scene = {
        instanceId,
        rooms: instance.rooms.map((r) => r.id),
        portals: (instance.portals ?? []).map((p) => p.id),
        npcModes: Object.fromEntries(instance.npcs.map((n) => [n.id, n.startMode])),
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
    setYaw(yaw) {
      if (player) player.yaw = yaw;
    },
    config() {
      return { ...cfg };
    },

    // Advance the simulation one frame: move the player from input, resolve collisions, track the
    // room they are in (portal traversal), and auto-pick-up nearby items (which can meet the goal).
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

      for (const item of model.items) {
        if (scene.discovered.has(item.itemId)) continue;
        if (Math.hypot(item.position.x - pos.x, item.position.z - pos.z) <= cfg.pickupRadius) {
          api.discover(item.itemId);
        }
      }

      return { position: player.position, yaw: player.yaw, currentRoom: player.currentRoom };
    },

    applyInteractionResult(npcId, result) {
      if (!scene || !(npcId in scene.npcModes)) throw new Error(`unknown npc: ${npcId}`);
      scene.npcModes[npcId] = result.newMode;
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
