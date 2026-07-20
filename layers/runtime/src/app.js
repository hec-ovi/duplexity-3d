// runtime - browser app shell.
//
// Wires the pure simulation core (createRuntime) to a three.js scene, a first-person camera,
// keyboard movement and pointer-lock mouse-look, and a render loop. Everything browser-specific is
// isolated here and injectable, so the whole thing is drivable head-less in a test: pass a stub
// `renderer` and call `tick(dt)` by hand instead of starting the RAF loop. Imports three and the
// runtime's own siblings only; asset-registry arrives as an injected dependency.

import * as THREE from "three";
import { createRuntime, PLAYER_REF } from "./index.js";
import { buildInstanceObject3D } from "./three-scene.js";
import { createNpcActors } from "./npc-actor.js";

const KEY_MAP = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

const DEFAULTS = { eyeHeight: 1.6, lookSensitivity: 0.0022, maxDt: 0.05 };

export function createApp(options = {}) {
  const {
    container,
    adventure,
    instanceId,
    registry,
    renderer: injectedRenderer,
    requestFrame = (cb) => globalThis.requestAnimationFrame?.(cb),
    cancelFrame = (id) => globalThis.cancelAnimationFrame?.(id),
    warn = console.warn,
    onGoalMet,
    onRoomChange,
    onInteraction,
    onHistoryAppend,
    createText, // text factory for labels/bubbles (browser injects troika; default is head-less)
    talkRange = 3, // metres within which pressing E talks to the nearest NPC
    eyeHeight = DEFAULTS.eyeHeight,
    lookSensitivity = DEFAULTS.lookSensitivity,
    moveSpeed,
    playerRadius,
    pickupRadius,
  } = options;

  if (!container) throw new Error("createApp requires a container element");

  const runtime = createRuntime({
    registry,
    moveSpeed,
    playerRadius,
    pickupRadius,
    onGoalMet: (id, result) => onGoalMet?.(id, result),
    onRoomChange: (prev, next) => onRoomChange?.(prev, next),
    onInteraction,
    onHistoryAppend,
  });
  runtime.load(adventure, instanceId);
  const model = runtime.getSceneModel();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d10);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x202024, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  const instanceGroup = buildInstanceObject3D(model, { registry, warn });
  scene.add(instanceGroup);

  // Bind each NPC's scene group to its runtime state (position, facing, animation, name label,
  // speech bubble). Text is injected so this runs head-less in tests.
  const actors = createNpcActors(instanceGroup, runtime.getNpcs(), { createText });

  const width = container.clientWidth || 1;
  const height = container.clientHeight || 1;
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.rotation.order = "YXZ";

  const renderer = injectedRenderer ?? new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize?.(width, height);
  if (renderer.domElement && container.appendChild) container.appendChild(renderer.domElement);

  // Look state. Yaw lives on the runtime (movement needs it); pitch is view-only.
  let pitch = 0;
  const pressed = new Set();
  let locked = false;
  let frameId = null;
  let last = 0;

  function currentInput() {
    const input = {};
    for (const code of pressed) {
      const dir = KEY_MAP[code];
      if (dir) input[dir] = true;
    }
    return input;
  }

  function syncCamera() {
    const p = runtime.getPlayer();
    camera.position.set(p.position.x, p.position.y + eyeHeight, p.position.z);
    camera.rotation.y = p.yaw;
    camera.rotation.x = pitch;
  }
  syncCamera();
  actors.sync(runtime.getNpcs(), camera, 0, runtime.getSpeech());

  // The nearest NPC within talkRange (or null), for the E-to-talk control.
  function nearestNpc() {
    const p = runtime.getPlayer().position;
    let best = null;
    let bestD = Infinity;
    for (const n of runtime.getNpcs()) {
      const d = Math.hypot(n.position.x - p.x, n.position.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best && bestD <= talkRange ? best.id : null;
  }

  function interact(npcId, interaction) {
    const id = npcId ?? nearestNpc();
    if (!id) return null;
    return runtime.interact(id, interaction ?? { type: "chat", playerRef: PLAYER_REF });
  }

  function tick(dt) {
    const clamped = Math.min(dt, DEFAULTS.maxDt);
    const result = runtime.step(clamped, currentInput());
    syncCamera();
    actors.sync(runtime.getNpcs(), camera, clamped, runtime.getSpeech());
    renderer.render?.(scene, camera);
    return result;
  }

  // --- browser input (all guarded so head-less tests never touch pointer lock) ---
  const onKeyDown = (e) => {
    if (KEY_MAP[e.code]) pressed.add(e.code);
    else if (e.code === "KeyE" && !e.repeat) interact(); // talk to the nearest NPC
  };
  const onKeyUp = (e) => {
    if (KEY_MAP[e.code]) pressed.delete(e.code);
  };
  const onMouseMove = (e) => {
    if (!locked) return;
    runtime.setYaw(runtime.getPlayer().yaw - e.movementX * lookSensitivity);
    pitch = clamp(pitch - e.movementY * lookSensitivity, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  };
  const onLockChange = () => {
    locked = doc()?.pointerLockElement === (renderer.domElement ?? null);
  };
  const requestLock = () => renderer.domElement?.requestPointerLock?.();

  const win = globalThis.window ?? globalThis;
  win.addEventListener?.("keydown", onKeyDown);
  win.addEventListener?.("keyup", onKeyUp);
  win.addEventListener?.("mousemove", onMouseMove);
  doc()?.addEventListener?.("pointerlockchange", onLockChange);
  renderer.domElement?.addEventListener?.("click", requestLock);

  const onResize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize?.(w, h);
  };
  win.addEventListener?.("resize", onResize);

  function loop(now) {
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    tick(dt);
    frameId = requestFrame(loop);
  }

  return {
    runtime,
    camera,
    scene,
    instanceGroup,
    tick,
    interact,
    getPlayer: () => runtime.getPlayer(),
    getNpcs: () => runtime.getNpcs(),
    setYaw: (yaw) => runtime.setYaw(yaw),
    setPitch: (p) => {
      pitch = p;
    },
    // Engage mouse-look. Safe to call from any user-gesture handler (e.g. a "click to play"
    // overlay) so a single click both dismisses the overlay and locks the pointer.
    requestPointerLock: () => renderer.domElement?.requestPointerLock?.(),
    start() {
      if (frameId != null) return;
      last = 0;
      frameId = requestFrame(loop);
    },
    stop() {
      if (frameId != null) cancelFrame(frameId);
      frameId = null;
    },
    dispose() {
      this.stop();
      actors.dispose();
      win.removeEventListener?.("keydown", onKeyDown);
      win.removeEventListener?.("keyup", onKeyUp);
      win.removeEventListener?.("mousemove", onMouseMove);
      win.removeEventListener?.("resize", onResize);
      doc()?.removeEventListener?.("pointerlockchange", onLockChange);
      renderer.domElement?.removeEventListener?.("click", requestLock);
      renderer.dispose?.();
    },
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function doc() {
  return globalThis.document;
}
