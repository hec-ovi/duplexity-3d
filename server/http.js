// server - the HTTP surface for the backend API. A tiny, framework-free node:http router so each route
// is a real entry point (tested end to end), not a mocked function. Endpoints match 02-ARCHITECTURE.md:
// POST /adventure (author) and GET /adventure/:id (read the saved document) for author-time, and
// POST /interaction (run one NPC's brain, archive the exchange) for play-time.

import { createServer as createHttpServer } from "node:http";

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(Object.assign(new Error("request body is not valid JSON"), { code: "BAD_JSON" }));
      }
    });
    req.on("error", reject);
  });
}

// Failures the caller can act on (retry, adjust the brief, send a valid selfContext) -> 422. A malformed
// JSON body -> 400; a bad request payload (missing/invalid fields) -> 400; an unknown id -> 404.
const UNPROCESSABLE = new Set([
  "PLAN_INVALID",
  "PROGRESSION_DEADEND",
  "INSTANCE_BUILD_FAILED",
  "NO_ASSET_FOR_KIND",
  "SELF_CONTEXT_INVALID",
]);
const BAD_REQUEST = new Set(["BAD_JSON", "INTERACTION_INVALID"]);

export function createRouter(service) {
  return async function handle(req, res) {
    const send = (status, obj) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    let pathname;
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch {
      return send(400, { error: "bad url", code: "BAD_URL" });
    }

    try {
      if (req.method === "POST" && pathname === "/adventure") {
        const body = await readJsonBody(req);
        return send(201, service.createAdventure(body));
      }
      if (req.method === "POST" && pathname === "/interaction") {
        const body = await readJsonBody(req);
        return send(200, await service.resolveInteraction(body));
      }
      const m = pathname.match(/^\/adventure\/([^/]+)$/);
      if (req.method === "GET" && m) {
        return send(200, service.getAdventure(decodeURIComponent(m[1])));
      }
      return send(404, { error: "not found", code: "NOT_FOUND" });
    } catch (e) {
      if (e.code === "NOT_FOUND") return send(404, { error: e.message, code: "NOT_FOUND" });
      if (BAD_REQUEST.has(e.code)) return send(400, { error: e.message, code: e.code });
      if (UNPROCESSABLE.has(e.code)) return send(422, { error: e.message, code: e.code });
      return send(500, { error: e.message ?? "internal error", code: e.code ?? "INTERNAL" });
    }
  };
}

export function createServer(service) {
  return createHttpServer(createRouter(service));
}
