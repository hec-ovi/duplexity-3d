// Composition root for the playable slice.
//
// This file lives OUTSIDE layers/, so it is the one place allowed to import several layers and wire
// them together (the isolation checker only scans layers/*/src and layers/*/tests). It generates a
// city, hands the runtime an asset-registry instance, keeps the run's map state, and draws the
// blueprint overlay. Names and speech are HTML the runtime lays over the canvas.

import { createApp } from "../layers/runtime/src/app.js";
import { drawBlueprint } from "../layers/runtime/src/blueprint-hud.js";
import { createRegistry } from "../layers/asset-registry/src/index.js";
import { paintSurface, photoSurface } from "../layers/surfaces/src/index.js";
import { dressFacade } from "../layers/facade/src/index.js";
import {
  buildWorldMap,
  createProgress,
  clearInstance,
  enterInstance,
  doorState,
  exitState,
  win,
} from "../layers/map-state/src/index.js";
import { composeCity } from "../tools/src/compose-city.js";

const container = document.getElementById("app");
const placeEl = document.getElementById("place");
const roomEl = document.getElementById("room");
const gateEl = document.getElementById("gate");
const statusEl = document.getElementById("status");
const promptEl = document.getElementById("prompt");
const blueprintEl = document.getElementById("blueprint");
const blueprintCtx = blueprintEl.getContext("2d");

// The seed IS the level, so `?seed=1234` plays the same city again and is worth sharing. Without one,
// every visit is a new city.
const query = new URLSearchParams(location.search);
const asked = Number.parseInt(query.get("seed") ?? "", 10);
const seed = Number.isFinite(asked) ? asked : Math.floor(Math.random() * 1e6);
// `?wet=0.8` soaks the streets, so the lamps come back off them. It never rains.
const wet = Number.parseFloat(query.get("wet") ?? "");

const { adventure } = composeCity({
  id: "ashgate",
  theme: "city",
  label: "Ashgate",
  sizeHint: "medium",
  seed,
  ...(Number.isFinite(wet) ? { wet: Math.max(0, Math.min(1, wet)) } : {}),
});

// The photographed CC0 materials are fetched, not committed (`npm run textures`). Ask once whether
// they are here; without them the surfaces layer paints its own and the city looks after itself.
const textureBase = await fetch("textures/manifest.json", { method: "HEAD" })
  .then((r) => (r.ok ? "textures" : null))
  .catch(() => null);

const worldMap = buildWorldMap(adventure);
let run = createProgress(worldMap);

// A canned interaction "brain" for the offline browser slice: a talker answers, a mute hostile lunges
// at the player. It returns an InteractionResult the runtime validates against the NPC's allowedModes
// and live context. The real per-interaction model lives behind the backend POST /interaction route;
// this slice keeps the canned brain so `npm run dev` runs with no backend.
const LINES = [
  "Evening. Half these doors are still shut.",
  "Try the far end of the street when you are done in here.",
  "That gate will not budge until every place on this block is finished.",
];
let line = 0;

function cannedBrain(selfContext) {
  const modes = selfContext.allowedModes ?? [];
  if (modes.includes("talk")) {
    const said = LINES[line % LINES.length];
    line += 1;
    return { newMode: "talk", utterance: said };
  }
  if (modes.includes("attack")) {
    const player = selfContext.whereIAm.nearbyEntities.find((e) => e.kind === "player");
    return { newMode: "attack", target: player ? player.id : undefined, emote: "snarl" };
  }
  return { newMode: selfContext.myState.mode };
}

function showPlace() {
  placeEl.textContent = app.blueprint()?.label ?? worldMap.entry;
  roomEl.textContent = app.getPlayer().currentRoom ?? "doorway";
}

function showGate() {
  const gate = exitState(worldMap, run);
  gateEl.textContent = gate.open
    ? "The gate is open. Head for it."
    : `Gate sealed: ${gate.remaining.length} place(s) left to finish.`;
}

const app = createApp({
  container,
  adventure,
  instanceId: worldMap.entry,
  registry: createRegistry(),
  paintSurface, // roads, pavements, concrete and every building's outside
  photoSurface,
  textureBase, // the CC0 materials, when they have been fetched
  dressFacade, // balconies, awnings and the cartel over each door
  onInteraction: cannedBrain,
  isPortalOpen: (portalId) => doorState(worldMap, run, portalId).open,
  onRoomChange: (_prev, next) => {
    roomEl.textContent = next ?? "doorway";
  },
  onTransit: ({ link }) => {
    run = enterInstance(run, worldMap, link.instanceId);
    app.goTo(link.instanceId, link); // the link says where to arrive, and which way to be looking
    showPlace();
  },
  // Redrawn each frame, so the overlay follows the player and reveals each room as it is walked into.
  // It draws only what blueprint() hands over, which is only what has been seen.
  onFrame: () => {
    drawBlueprint(blueprintCtx, app.blueprint(), {
      width: blueprintEl.width,
      height: blueprintEl.height,
    });
  },
  onGoalMet: (instanceId) => {
    // Reaching the open gate wins the run; finishing anywhere else ticks one place off the list.
    const gate = exitState(worldMap, run);
    if (instanceId === worldMap.entry && gate.open) {
      run = win(run, worldMap, gate.portalId);
      statusEl.textContent = "You made it out. Run won.";
      return;
    }
    run = clearInstance(run, worldMap, instanceId);
    statusEl.textContent = `Finished: ${instanceId}.`;
    showGate();
  },
});

showPlace();
showGate();

// In `npm run dev` only, hand the running app to the console so a place can be opened without
// walking there: `duplexity.app.goTo("ashgate-b1-f1", { spawnRoomId: "entry" })`.
if (import.meta.env?.DEV) globalThis.duplexity = { app, adventure, worldMap };

promptEl.addEventListener("click", () => {
  promptEl.style.display = "none";
  app.requestPointerLock(); // same gesture dismisses the overlay and starts mouse-look
});

app.start();
