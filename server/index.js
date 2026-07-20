// server - the backend API entry point. Run with `node server/index.js`. Wires the real layers over one
// shared store and serves POST /adventure + GET /adventure/:id (author-time) and POST /interaction
// (play-time NPC brain). Play-time rendering (the three.js slice) is served separately from app/ via
// Vite; this is the backend half of the frontend/backend split. No brain is wired by default, so
// interactions resolve through the npc deterministic stand-in until a local model is injected here.

import { createBackendService } from "./backend-service.js";
import { createServer } from "./http.js";

const PORT = Number(process.env.PORT ?? 5174);
const service = createBackendService();

createServer(service).listen(PORT, () => {
  console.log(
    `backend API listening on http://localhost:${PORT} ` +
      `(POST /adventure, GET /adventure/:id, GET /adventure/:id/export, POST /adventure/import, POST /interaction)`,
  );
});
