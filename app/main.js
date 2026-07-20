// Composition root for the Phase 2 playable slice.
//
// This file lives OUTSIDE layers/, so it is the one place allowed to import several layers and wire
// them together (the isolation checker only scans layers/*/src and layers/*/tests). It hands the
// runtime an asset-registry instance and the shared example Adventure, then starts the loop.

import { createApp } from "../layers/runtime/src/app.js";
import { createRegistry } from "../layers/asset-registry/src/index.js";
import adventure from "../layers/persistence/fixtures/adventure.example.json";

const container = document.getElementById("app");
const roomEl = document.getElementById("room");
const statusEl = document.getElementById("status");
const promptEl = document.getElementById("prompt");

const app = createApp({
  container,
  adventure,
  instanceId: adventure.progression.start,
  registry: createRegistry(),
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
