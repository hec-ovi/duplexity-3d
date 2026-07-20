// server - the author-time API entry point. Run with `node server/index.js`. Wires the real layers
// and serves POST /adventure + GET /adventure/:id. Play-time (the three.js slice) is served
// separately from app/ via Vite; this is the backend half of the frontend/backend split.

import { createAuthorService } from "./author-service.js";
import { createServer } from "./http.js";

const PORT = Number(process.env.PORT ?? 5174);
const service = createAuthorService();

createServer(service).listen(PORT, () => {
  console.log(`author API listening on http://localhost:${PORT} (POST /adventure, GET /adventure/:id)`);
});
