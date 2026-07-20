// runtime - NPC actors (three.js side of the NPC sim).
//
// Each actor binds one `npc:<id>` group (built by three-scene.js) to its runtime state: it drives the
// group's position + facing, plays a small procedural placeholder animation on the capsule body (a
// walk bob, a death topple), and hangs a billboarded name label and speech bubble above the head.
//
// Text is injected: the browser passes a troika-three-text factory (speech-rig.js); tests and
// head-less runs use the built-in stub, which is a real Object3D that positions and billboards like
// the real thing but renders nothing. So this module never hard-depends on a text renderer or a GL
// context, and the whole actor layer stays drivable in jsdom.

import * as THREE from "three";

const HEAD_PAD = 0.35; // the name label floats this far above the head
const BUBBLE_PAD = 0.78; // the speech bubble floats above the label

// Reused scratch quaternions for the billboard math (single-threaded, so module-level reuse is safe).
const _camQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();

// The default (head-less) text holder: a real Object3D so it parents, positions and billboards like
// troika's Text, but with no glyph rendering. Exposes the same `text` / `visible` / `sync()` surface.
export function stubText(opts = {}) {
  const o = new THREE.Object3D();
  o.text = opts.text ?? "";
  o.visible = opts.visible ?? true;
  o.sync = () => {};
  o.dispose = () => {};
  return o;
}

/**
 * @param {THREE.Object3D} instanceGroup  the built scene group (holds the `npc:<id>` groups)
 * @param {Array<{id:string,name?:string}>} npcs  descriptors (runtime.getNpcs())
 * @param {object} [opts]
 * @param {(o:object)=>THREE.Object3D} [opts.createText]  text factory (default: head-less stub)
 */
export function createNpcActors(instanceGroup, npcs, { createText = stubText } = {}) {
  const actors = [];
  for (const npc of npcs) {
    const group = instanceGroup.getObjectByName(`npc:${npc.id}`);
    if (!group) continue;
    const height = group.userData?.height ?? 1.8;
    const body = group.getObjectByName(`npc:${npc.id}:body`) ?? group;

    const label = createText({
      text: npc.name ?? npc.id,
      color: 0xffffff,
      fontSize: 0.18,
      anchorX: "center",
      anchorY: "bottom",
      outline: true,
    });
    label.position.set(0, height + HEAD_PAD, 0);
    label.sync?.();
    group.add(label);

    const bubble = createText({
      text: "",
      color: 0x0d0d0d,
      backgroundColor: 0xffe08a,
      fontSize: 0.2,
      anchorX: "center",
      anchorY: "bottom",
      outline: true,
    });
    bubble.position.set(0, height + BUBBLE_PAD, 0);
    bubble.visible = false;
    bubble.sync?.();
    group.add(bubble);

    actors.push({ id: npc.id, group, body, label, bubble, height, bodyRestY: body.position.y, phase: 0 });
  }

  const byId = new Map(actors.map((a) => [a.id, a]));

  // Mirror the runtime state onto the scene. `states` is runtime.getNpcs(); `speech` is the runtime's
  // speech model (get(id) -> {text} | null). Call every frame with the frame's dt.
  function sync(states, camera, dt = 0, speech = null) {
    for (const s of states) {
      const a = byId.get(s.id);
      if (!a) continue;
      a.group.position.set(s.position.x, s.position.y, s.position.z);
      a.group.rotation.y = s.facing;
      animateBody(a, s, dt);
    }
    for (const a of actors) {
      if (camera) {
        // Billboard in WORLD space. The label/bubble are children of the npc group, which is yaw-
        // rotated to the NPC's facing every frame, so copying the camera quaternion into their LOCAL
        // frame would leave them rotated by that facing (they would face away from the camera for any
        // NPC not looking down -Z). Cancel the parent's world rotation, then apply the camera's:
        // localQ = inverse(parentWorldQ) * cameraWorldQ  =>  worldQ == cameraWorldQ.
        camera.getWorldQuaternion(_camQ);
        a.group.getWorldQuaternion(_parentQ).invert();
        a.label.quaternion.copy(_parentQ).multiply(_camQ);
        a.bubble.quaternion.copy(a.label.quaternion);
      }
      const line = speech?.get?.(a.id) ?? null;
      if (line && line.text) {
        if (a.bubble.text !== line.text) {
          a.bubble.text = line.text;
          a.bubble.sync?.();
        }
        a.bubble.visible = true;
      } else {
        a.bubble.visible = false;
      }
    }
  }

  function dispose() {
    for (const a of actors) {
      a.label.parent?.remove(a.label);
      a.bubble.parent?.remove(a.bubble);
      a.label.dispose?.();
      a.bubble.dispose?.();
    }
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
