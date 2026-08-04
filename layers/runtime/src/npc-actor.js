// runtime - NPC actors (three.js side of the NPC sim).
//
// Each actor binds one `npc:<id>` group (built by three-scene.js) to its runtime state: it drives the
// group's position + facing and plays a small procedural placeholder animation on the capsule body
// (a walk bob, a death topple).
//
// Nothing here touches text or a GL context, so the whole actor layer stays drivable in jsdom.

/**
 * Bind each NPC's scene group to its runtime state: position, facing, and the placeholder body
 * animation. Names and speech are NOT here: they are HTML over the canvas (labels-overlay.js), so a
 * line of dialogue is always legible and never rendered at the size of a building.
 *
 * @param {THREE.Object3D} instanceGroup  the built scene group (holds the `npc:<id>` groups)
 * @param {Array<{id:string,name?:string}>} npcs  descriptors (runtime.getNpcs())
 */
export function createNpcActors(instanceGroup, npcs) {
  const actors = [];
  for (const npc of npcs) {
    const group = instanceGroup.getObjectByName(`npc:${npc.id}`);
    if (!group) continue;
    const height = group.userData?.height ?? 1.8;
    const body = group.getObjectByName(`npc:${npc.id}:body`) ?? group;
    actors.push({ id: npc.id, group, body, height, bodyRestY: body.position.y, phase: 0 });
  }
  const byId = new Map(actors.map((a) => [a.id, a]));

  // Mirror the runtime state onto the scene. `states` is runtime.getNpcs(); call every frame with the
  // frame's dt.
  function sync(states, _camera, dt = 0) {
    for (const s of states) {
      const a = byId.get(s.id);
      if (!a) continue;
      a.group.position.set(s.position.x, s.position.y, s.position.z);
      a.group.rotation.y = s.facing;
      animateBody(a, s, dt);
    }
  }

  function dispose() {
    actors.length = 0;
    byId.clear();
  }

  return { actors, sync, dispose };
}

// Procedural placeholder animation for the capsule body: a walk/idle bob, or a topple when dead.
// Real GLB clips (three AnimationMixer, keyed off the same `animation` field) drop in here later.
function animateBody(a, s, dt) {
  a.phase += dt;
  const body = a.body;
  if (s.animation === "die" || s.mode === "dead") {
    body.rotation.z = Math.PI / 2; // fallen over
    body.position.y = a.bodyRestY - a.height / 2 + 0.15;
    return;
  }
  body.rotation.z = 0;
  const walking = s.animation === "walk";
  const amp = walking ? 0.06 : 0.02;
  const freq = walking ? 8 : 2;
  body.position.y = a.bodyRestY + Math.abs(Math.sin(a.phase * freq)) * amp;
}
