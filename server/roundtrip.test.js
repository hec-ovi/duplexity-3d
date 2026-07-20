// Phase 7 DoD: the full author -> play -> export -> import -> play round trip, through the REAL HTTP
// routes and the REAL runtime, across TWO independent backends (the export opens on a second "machine"
// that shares only the base kits). Every layer is real; no LLM is needed to author or to export/import.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { validate, SCHEMA_ID } from "../harness/schemas.js";
import { createBackendService } from "./backend-service.js";
import { createServer } from "./http.js";
import { buildSceneModel, roomAt } from "../layers/runtime/src/scene-model.js";
import { createPortalNav } from "../layers/runtime/src/nav.js";

const CLOCK = () => new Date("2026-07-20T12:00:00.000Z");

async function boot() {
  const server = createServer(createBackendService({ clock: CLOCK }));
  await new Promise((resolve) => server.listen(0, resolve));
  return { base: `http://localhost:${server.address().port}`, stop: () => new Promise((r) => server.close(r)) };
}

async function jsonPost(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

// Walk an instance spawn -> goal room through the doorways with the real portal-graph router.
function walkable(instance) {
  const model = buildSceneModel(instance);
  const spawnRoom = roomAt(model, model.spawn.position.x, model.spawn.position.z);
  const goalRoom = model.rooms.find((rm) => model.items.some((it) => it.room === rm.id)) ?? model.rooms.at(-1);
  const path = createPortalNav(model).findPath(
    { x: model.spawn.position.x, z: model.spawn.position.z },
    { x: goalRoom.center.x, z: goalRoom.center.z },
  );
  return spawnRoom !== null && path.at(-1)?.x === goalRoom.center.x && path.at(-1)?.z === goalRoom.center.z;
}

describe("full round trip: author -> export -> import -> play (real routes, two machines)", () => {
  let source;
  let target;

  beforeAll(async () => {
    source = await boot(); // the machine that authors + exports
    target = await boot(); // a fresh machine that only imports + plays
  });
  afterAll(async () => {
    await source.stop();
    await target.stop();
  });

  it("authored on one backend, plays; exported, imported on a fresh backend, plays again identically", async () => {
    // author
    const authored = await jsonPost(source.base, "/adventure", {
      brief: { universes: ["dwarven halls"], likedNpcs: ["a friendly smith"], tone: "adventurous", difficulty: "normal", themes: ["dungeon"], freeText: "" },
    });
    expect(authored.status).toBe(201);
    const adventure = authored.json;
    expect(walkable(adventure.instances[0])).toBe(true); // plays on the source machine

    // export (the portable file is the GET body serialized to disk)
    const exportRes = await fetch(`${source.base}/adventure/${encodeURIComponent(adventure.meta.id)}/export`);
    expect(exportRes.status).toBe(200);
    const bundle = await exportRes.json();
    expect(validate(SCHEMA_ID.persistence.bundle, bundle).ok, JSON.stringify(bundle).slice(0, 400)).toBe(true);
    const portableFile = JSON.stringify(bundle); // "save to disk"

    // the target machine does not have it yet
    const missing = await fetch(`${target.base}/adventure/${encodeURIComponent(adventure.meta.id)}`);
    expect(missing.status).toBe(404);

    // import onto the fresh machine ("upload the file")
    const imported = await jsonPost(target.base, "/adventure/import", JSON.parse(portableFile));
    expect(imported.status).toBe(201);
    expect(imported.json).toEqual(adventure); // same document, byte for byte

    // it is now readable and playable on the fresh machine
    const readBack = await fetch(`${target.base}/adventure/${encodeURIComponent(adventure.meta.id)}`);
    expect(readBack.status).toBe(200);
    const reloaded = await readBack.json();
    expect(reloaded).toEqual(adventure);
    expect(walkable(reloaded.instances[0])).toBe(true); // plays again on the second machine
  });

  it("rejects a bundle from a newer contract version with 422, and a malformed body with 400", async () => {
    const authored = await jsonPost(source.base, "/adventure", { seedHints: "crypt" });
    const future = structuredClone(authored.json);
    future.meta = { ...future.meta, contractVersion: "9.0.0" };
    const bad = await jsonPost(target.base, "/adventure/import", { adventure: future, generatedAssets: [] });
    expect(bad.status).toBe(422);
    expect(bad.json.code).toBe("MIGRATION_FAILED");

    const res = await fetch(`${target.base}/adventure/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_JSON");
  });

  it("a malformed percent-encoded id is a 400, not a 500", async () => {
    // decodeURIComponent throws a codeless URIError on "%zz"; the route must not let it reach the 500 default.
    const exp = await fetch(`${source.base}/adventure/%zz/export`);
    expect(exp.status).toBe(400);
    const get = await fetch(`${source.base}/adventure/%zz`);
    expect(get.status).toBe(400);
  });
});
