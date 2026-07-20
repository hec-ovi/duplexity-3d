// Composition root for the playable slice.
//
// This file lives OUTSIDE layers/, so it is the one place allowed to import several layers and wire
// them together (the isolation checker only scans layers/*/src and layers/*/tests). It hands the
// runtime an asset-registry instance, the shared example Adventure, the browser text renderer
// (troika, injected so the head-less tests never load it), and the Phase 3 canned interaction brain.

import { createApp } from "../layers/runtime/src/app.js";
import { createRegistry } from "../layers/asset-registry/src/index.js";
import { createTroikaText } from "../layers/runtime/src/speech-rig.js";
import adventure from "../layers/persistence/fixtures/adventure.example.json";

const container = document.getElementById("app");
const roomEl = document.getElementById("room");
const statusEl = document.getElementById("status");
const promptEl = document.getElementById("prompt");

// A canned interaction "brain" for Phase 3 (no LLM yet): a talker greets and switches to talk; a mute
// hostile lunges to attack the player. It returns an InteractionResult the runtime validates against
// the NPC's allowedModes and live context. Real per-interaction model calls arrive in Phase 6.
const SMITH_LINES = [
  "Mind the forge, traveler. Respect the craft and we will get on.",
  "That vault ahead? Bones guard it. Reason will not move them.",
  "Take the amulet if you can reach it. I will not stop you.",
];
let smithLine = 0;

function cannedBrain(selfContext) {
  const modes = selfContext.allowedModes ?? [];
  if (modes.includes("talk")) {
    const line = SMITH_LINES[smithLine % SMITH_LINES.length];
    smithLine += 1;
    return { newMode: "talk", utterance: line };
  }
  if (modes.includes("attack")) {
    const player = selfContext.whereIAm.nearbyEntities.find((e) => e.kind === "player");
    return { newMode: "attack", target: player ? player.id : undefined, emote: "snarl" };
  }
  return { newMode: selfContext.myState.mode };
}

const app = createApp({
  container,
  adventure,
  instanceId: adventure.progression.start,
  registry: createRegistry(),
  createText: createTroikaText,
  onInteraction: cannedBrain,
  onRoomChange: (_prev, next) => {
    roomEl.textContent = next ?? "doorway";
  },
  onGoalMet: () => {
    statusEl.textContent = "You found the amulet. Instance solved.";
    promptEl.style.display = "none";
  },
});

roomEl.textContent = app.getPlayer().currentRoom ?? "doorway";
promptEl.addEventListener("click", () => {
  promptEl.style.display = "none";
  app.requestPointerLock(); // same gesture dismisses the overlay and starts mouse-look
});

app.start();
