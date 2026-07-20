// runtime - build and play one instance. Phase 1 is a headless scene model (no three.js yet).
// Backend collaborators are injected via `deps` callbacks; this src imports no backend layer.
//
// Key invariant already enforced here: play-time state (npcModes, discovered) is a fresh structure,
// never a reference into the authored Adventure, so playing never mutates authored data.

export class InstanceInvalidError extends Error {
  constructor(instanceId) {
    super(`instance invalid or not found: ${instanceId}`);
    this.code = "INSTANCE_INVALID";
  }
}

export function createRuntime(deps = {}) {
  let scene = null;

  const api = {
    load(adventure, instanceId) {
      const instance = adventure.instances?.find((i) => i.id === instanceId);
      if (!instance || !instance.rooms?.length || !instance.spawn || !Array.isArray(instance.npcs)) {
        throw new InstanceInvalidError(instanceId);
      }
      scene = {
        instanceId,
        rooms: instance.rooms.map((r) => r.id),
        portals: (instance.portals ?? []).map((p) => p.id),
        npcModes: Object.fromEntries(instance.npcs.map((n) => [n.id, n.startMode])),
        goal: instance.goal,
        discovered: new Set(),
      };
      return scene;
    },

    getScene() {
      return scene;
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
      if (met) {
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
    // reach_exit, unlock_dialog, defeat, survive, sequence, all wire in as behaviors land (Phase 2+)
    default:
      return false;
  }
}
