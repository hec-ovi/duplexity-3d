// runtime - browser app shell.
//
// Wires the pure simulation core (createRuntime) to a three.js scene, a first-person camera,
// keyboard movement and pointer-lock mouse-look, and a render loop. Everything browser-specific is
// isolated here and injectable, so the whole thing is drivable head-less in a test: pass a stub
// `renderer` and call `tick(dt)` by hand instead of starting the RAF loop. Imports three and the
// runtime's own siblings only; asset-registry arrives as an injected dependency.

import * as THREE from "three";
import { WebGPURenderer, PostProcessing, PMREMGenerator } from "three/webgpu";
import {
  pass, mrt, output, emissive, fog, color, exponentialHeightFogFactor, vec3, vec4, float, mix, screenUV,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { createRuntime, PLAYER_REF } from "./index.js";
import { createLabelsOverlay } from "./labels-overlay.js";

const KEY_MAP = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "run",
  ShiftRight: "run",
  Space: "jump",
};

const FOV = { normal: 75, zoomed: 38, rate: 6 }; // right button pulls the view in

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
    onTransit, // the player walked into a door leading to another instance
    isPortalOpen, // lock oracle (map-state); absent means every portal is open
    onFrame, // called after every tick, for a HUD drawn outside the 3D scene
    onPointerLock, // (locked) whenever play starts or the cursor comes back
    // cityscape.createCityscape (injected): the city as three.js objects, and everything moving in
    // it. Absent, the world is empty and only the simulation runs, which is what a head-less test
    // wants.
    createCityscape,
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
    onTransit,
    isPortalOpen,
  });

  const scene = new THREE.Scene();
  // Night. Outdoors the level ends in open air, so it gets a sky and a haze thick enough that the far
  // end of the street fades into it rather than stopping at a hard edge.
  const sky = new THREE.Color(0x151d2b);
  const indoors = new THREE.Color(0x07090c);
  // The haze the city stands in: violet, thick at street level, thinning by the rooftops.
  // The haze the city stands in. The factor is 1 - exp(-(density * (top - y) * viewZ)^2), so `top` is
  // the height it thins out at: towers rise clear of it, the street does not.
  const HAZE = { colour: 0x2a2246, open: 0.00035, top: 60, indoors: 0.0012, ceiling: 8 };

  // The city is rebuilt whenever play moves to another instance (through a street door, up a
  // stairwell). `city` is therefore let, not const: goTo swaps it.
  let city = null;
  // Whether the player is aboard the shuttle rather than walking.
  let riding = false;
  let elapsed = 0;

  function build(id, opts) {
    runtime.load(adventure, id, opts);
    if (city) {
      scene.remove(city.group);
      city.dispose();
      city = null;
      riding = false;
    }
    const model = runtime.getSceneModel();
    const open = model.rooms.some((r) => r.open);
    scene.background = open ? sky : indoors;
    // Haze that lies on the streets and thins as it climbs, so towers rise out of it instead of
    // being painted over by it. Flat fog is what makes a night city look like a dark room.
    scene.fogNode = open
      ? fog(color(HAZE.colour), exponentialHeightFogFactor(HAZE.open, HAZE.top))
      : fog(color(indoors.getHex()), exponentialHeightFogFactor(HAZE.indoors, HAZE.ceiling));
    city = createCityscape?.(model, { registry, warn, npcs: runtime.getNpcs() }) ?? emptyCity();
    scene.add(city.group);
  }

  // Something for a shiny surface to reflect. Built from the scene itself once it is standing, so a
  // wet road and a tiled floor come back with the sky and the signs in them rather than with nothing.
  function lightEnvironment() {
    if (!pmrem || !ready) return; // the device has to be up before the scene can be captured off it
    scene.environment?.dispose?.();
    scene.environment = null;
    scene.environment = pmrem.fromScene(scene, 0.04).texture;
    scene.environmentIntensity = 0.55;
  }
  build(instanceId);

  const width = container.clientWidth || 1;
  const height = container.clientHeight || 1;
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.rotation.order = "YXZ";

  // WebGPU where the browser has it, WebGL2 where it does not: three picks, and the node pipeline
  // below compiles to either. Nothing else in this file has to know which.
  const renderer = injectedRenderer ?? new WebGPURenderer({ antialias: true });
  let ready = Boolean(injectedRenderer); // a real renderer has to come up before it can draw
  const pmrem = injectedRenderer ? null : new PMREMGenerator(renderer);
  renderer.setSize?.(width, height);
  if (renderer.toneMapping !== undefined) {
    // Film response, so a lit window can be brighter than white without the whole street clipping.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
  }
  if (renderer.shadowMap) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  if (renderer.domElement && container.appendChild) container.appendChild(renderer.domElement);

  // Bloom over what BURNS and nothing else: the scene keeps its emissive output on a second target
  // and only that is blurred. A lit sign glows into the air; a pale wall under a lamp does not, which
  // is the difference between a night city and a washed-out one. A head-less test draws straight
  // through instead.
  const post = injectedRenderer ? null : buildPost(renderer, scene, camera);

  // Look state. Yaw lives on the runtime (movement needs it); pitch is view-only.
  let pitch = 0;
  let zoomed = false;
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

  // Names and speech are HTML over the canvas, not glyphs in the scene: always legible, never the
  // size of a building. The overlay needs a DOM, so a head-less test simply gets none.
  const labels = container.appendChild ? createLabelsOverlay(container) : null;
  const _v = new THREE.Vector3();
  const view = {
    get width() {
      return container.clientWidth || 1;
    },
    get height() {
      return container.clientHeight || 1;
    },
    // World point -> screen position in 0..1, plus how far away it is. Null when behind the camera.
    project(position, height, cam) {
      _v.set(position.x, position.y + height, position.z);
      const distance = cam.position.distanceTo(_v);
      _v.project(cam);
      if (_v.z > 1) return null;
      return { x: (_v.x + 1) / 2, y: (1 - _v.y) / 2, distance };
    },
  };

  function syncLabels() {
    if (!labels) return;
    const speech = runtime.getSpeech();
    labels.sync(
      runtime.getNpcs().map((npc) => ({
        id: npc.id,
        name: npc.name ?? npc.id,
        says: speech?.get?.(npc.id)?.text ?? null,
        position: npc.position,
        height: 1.95,
      })),
      camera,
      view
    );
  }

  function syncCamera(dt = 0) {
    const p = runtime.getPlayer();
    camera.position.set(p.position.x, p.position.y + eyeHeight, p.position.z);
    camera.rotation.y = p.yaw;
    camera.rotation.x = pitch;

    const want = zoomed ? FOV.zoomed : FOV.normal;
    if (dt > 0 && Math.abs(camera.fov - want) > 0.01) {
      const step = (want - camera.fov) * Math.min(1, FOV.rate * dt);
      camera.fov += step;
      camera.updateProjectionMatrix();
    }
  }
  syncCamera();
  city.syncNpcs(runtime.getNpcs(), camera, 0);

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
    // Riding, the shuttle does the moving: the player is carried, so walking input is ignored.
    const result = runtime.step(clamped, riding ? {} : currentInput());
    elapsed += clamped;
    city.update(elapsed, clamped, camera.position);
    if (riding) runtime.placePlayer(city.shuttle.seat());
    syncCamera(clamped);
    city.syncNpcs(runtime.getNpcs(), camera, clamped);
    syncLabels();
    // Nothing is drawn until the backend is up: on WebGPU the device comes back a frame or two after
    // the page does, and drawing into it before then throws.
    if (!ready) return result;
    if (post) post.render();
    else renderer.render?.(scene, camera);
    onFrame?.(clamped);
    return result;
  }

  // --- browser input (all guarded so head-less tests never touch pointer lock) ---
  const onKeyDown = (e) => {
    if (KEY_MAP[e.code]) {
      pressed.add(e.code);
      if (e.code === "Space") e.preventDefault?.(); // or the page scrolls under the canvas
    } else if (e.code === "KeyE" && !e.repeat) interact(); // talk to the nearest NPC
    else if (e.code === "KeyF" && !e.repeat) ride();
  };

  // Step on or off the shuttle. You can only do either while it is standing at a stop, so a ride is
  // always stop to stop and you never step off into the middle of a street.
  function ride() {
    const shuttle = city.shuttle;
    if (!shuttle) return riding;
    if (riding) {
      if (!shuttle.stopped()) return true;
      riding = false;
      runtime.placePlayer(shuttle.kerbside());
      return false;
    }
    if (!shuttle.boardable(runtime.getPlayer().position)) return false;
    riding = true;
    runtime.setYaw(shuttle.heading());
    return true;
  }
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
    onPointerLock?.(locked);
  };
  const requestLock = () => renderer.domElement?.requestPointerLock?.();
  // Right button pulls the view in, the way looking harder at something does.
  const onMouseDown = (e) => {
    if (e.button === 2) zoomed = true;
  };
  const onMouseUp = (e) => {
    if (e.button === 2) zoomed = false;
  };
  const onContextMenu = (e) => e.preventDefault?.();

  const win = globalThis.window ?? globalThis;
  win.addEventListener?.("keydown", onKeyDown);
  win.addEventListener?.("keyup", onKeyUp);
  win.addEventListener?.("mousemove", onMouseMove);
  win.addEventListener?.("mousedown", onMouseDown);
  win.addEventListener?.("mouseup", onMouseUp);
  win.addEventListener?.("contextmenu", onContextMenu);
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
    get instanceGroup() {
      return city.group;
    },
    tick,
    interact,
    // Move play to another instance: rebuild the scene, put the player in `spawnRoomId` when given.
    // The host calls this from onTransit; the runtime never loads the next instance itself.
    goTo(id, opts = {}) {
      build(id, opts);
      lightEnvironment();
      syncCamera();
      city.syncNpcs(runtime.getNpcs(), camera, 0);
      syncLabels();
      return runtime.getScene();
    },
    // Step on or off the shuttle, the same as pressing F. Returns whether the player is aboard.
    ride,
    // What the host can tell the player about the shuttle: whether it is worth pressing F right now.
    shuttleState: () =>
      city.shuttle
        ? {
            riding,
            boardable: !riding && city.shuttle.boardable(runtime.getPlayer().position),
            stopped: city.shuttle.stopped(),
          }
        : null,
    blueprint: () => runtime.blueprint(),
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
      if (!ready) {
        // `init` resolves once the device is there. Without one (a stub renderer) we are ready now.
        Promise.resolve(renderer.init?.()).then(() => {
          ready = true;
          lightEnvironment(); // something for a shiny surface to reflect, once there is a device
        });
      }
      last = 0;
      frameId = requestFrame(loop);
    },
    stop() {
      if (frameId != null) cancelFrame(frameId);
      frameId = null;
    },
    dispose() {
      this.stop();
      city.dispose();
      post?.dispose?.();
      pmrem?.dispose();
      labels?.dispose();
      win.removeEventListener?.("keydown", onKeyDown);
      win.removeEventListener?.("keyup", onKeyUp);
      win.removeEventListener?.("mousemove", onMouseMove);
      win.removeEventListener?.("mousedown", onMouseDown);
      win.removeEventListener?.("mouseup", onMouseUp);
      win.removeEventListener?.("contextmenu", onContextMenu);
      win.removeEventListener?.("resize", onResize);
      doc()?.removeEventListener?.("pointerlockchange", onLockChange);
      renderer.domElement?.removeEventListener?.("click", requestLock);
      renderer.dispose?.();
    },
  };
}

// The grade the whole city is seen through: shadows pulled towards violet, highlights left warm, and
// the corners of the frame taken down. Without it a night scene is grey with coloured lights in it;
// with it the dark part of the picture has a colour of its own, which is what the reference has.
const GRADE = { shadow: [0.82, 0.86, 1.16], highlight: [1.09, 0.98, 0.92], vignette: 0.5 };

function graded(lit) {
  const rgb = lit.rgb;
  const brightness = rgb.dot(vec3(0.2126, 0.7152, 0.0722)).clamp(0, 1);
  const tint = mix(vec3(...GRADE.shadow), vec3(...GRADE.highlight), brightness);
  const corner = screenUV.sub(0.5).length().mul(1.35);
  const vignette = float(1).sub(corner.mul(corner).mul(GRADE.vignette)).clamp(0.3, 1);
  return vec4(rgb.mul(tint).mul(vignette), lit.a);
}

// The scene, rendered with its emissive output kept on a second target, the bloom taken from THAT
// rather than from everything bright, and the grade over the lot.
function buildPost(renderer, scene, camera) {
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, emissive }));
  const post = new PostProcessing(renderer);
  post.outputNode = graded(
    scenePass.getTextureNode("output").add(bloom(scenePass.getTextureNode("emissive"), 0.45, 0.85, 0))
  );
  return post;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// A world with nothing in it, for a host that gave us no city builder: the simulation still runs,
// the player still walks, and there is simply nothing to look at.
function emptyCity() {
  return {
    group: new THREE.Group(),
    open: false,
    shuttle: null,
    syncNpcs() {},
    update() {},
    dispose() {},
  };
}

function doc() {
  return globalThis.document;
}
