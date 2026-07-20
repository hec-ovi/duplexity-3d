// runtime - assemble the NPC's awareness snapshot (pure, no three.js).
//
// At interaction time the runtime hands the npc brain a fresh SelfContext: who the NPC is, what its
// body can do, where it is (nearby entities, notable objects, exits), its current state, and the
// closed set of modes it may switch to. "Sentience" is exactly this snapshot plus allowedModes;
// there is no background process. Shape matches npc/self-context.json (positions are [x,y,z] arrays,
// per persistence/vec3.json). Pure: the registry and world are passed in, nothing is imported.

import { roomAt } from "./scene-model.js";

const NEARBY_RADIUS = 8; // metres within which entities are "nearby" to this NPC

function toArr(p) {
  return [p.x, p.y ?? 0, p.z];
}

function horizDist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * @param {object} args
 * @param {object} args.def     the NPC's authored fields (name, persona, disposition, allowedModes)
 * @param {object} args.state   the NPC's live state (position, mode, target, memory)
 * @param {string} args.playerRef  the interacting player's entity id
 * @param {{x:number,y?:number,z:number}} args.player  the player's position
 * @param {Array<{id:string,position:object}>} args.others  other NPCs' live positions
 * @param {object} args.model   the scene model (rooms, portals, objects, items)
 * @param {string[]} [args.animations]  clip names the body can perform (from asset-registry)
 * @returns {object} a SelfContext (npc/self-context.json)
 */
export function buildSelfContext({ def, state, playerRef, player, others = [], model, animations = [] }) {
  const here = state.position;
  const roomId = roomAt(model, here.x, here.z) ?? state.homeRoom;

  const nearbyEntities = [];
  if (player && horizDist(here, player) <= NEARBY_RADIUS) {
    nearbyEntities.push({ id: playerRef, kind: "player", position: toArr(player) });
  }
  for (const o of others) {
    if (o.id === state.id) continue;
    if (horizDist(here, o.position) <= NEARBY_RADIUS) {
      nearbyEntities.push({ id: o.id, kind: "npc", position: toArr(o.position) });
    }
  }
  for (const item of model.items) {
    if (horizDist(here, item.position) <= NEARBY_RADIUS) {
      nearbyEntities.push({ id: item.itemId, kind: "item", position: toArr(item.position) });
    }
  }

  const notableObjects = model.objects.filter((o) => o.room === roomId).map((o) => o.id);
  const exits = (model.portals ?? []).filter((p) => p.roomA === roomId || p.roomB === roomId).map((p) => p.id);

  const myState = { mode: state.mode, memory: [...state.memory] };
  if (typeof state.targetRef === "string") myState.target = state.targetRef;

  return {
    whoAmI: {
      name: def.name,
      persona: def.persona,
      disposition: def.disposition,
    },
    myBody: { animations: [...animations], actions: [] },
    whereIAm: {
      roomId,
      position: toArr(here),
      nearbyEntities,
      notableObjects,
      exits,
    },
    myState,
    allowedModes: [...def.allowedModes],
  };
}
