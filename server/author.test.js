// Phase 5 DoD: POST /adventure, exercised through the REAL node HTTP route to the REAL persistence
// side effect. Only the planner and layout-graph generator are deterministic stand-ins (the
// defaults the narrator and scenario-creator already use); every layer is otherwise real, so no LLM
// is needed to author a complete, playable, multi-instance Adventure.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { validate, SCHEMA_ID } from "../harness/schemas.js";
import { createAuthorService } from "./author-service.js";
import { createServer } from "./http.js";
import { validateProgression } from "../layers/narrator/src/index.js";
import { buildSceneModel, roomAt } from "../layers/runtime/src/scene-model.js";
import { createPortalNav } from "../layers/runtime/src/nav.js";

let server;
let base;

beforeAll(async () => {
  const service = createAuthorService({ clock: () => new Date("2026-07-20T12:00:00.000Z") });
  server = createServer(service);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const briefFor = (over = {}) => ({
  universes: [],
  likedNpcs: [],
  tone: "adventurous",
  difficulty: "normal",
  themes: ["dungeon"],
  freeText: "",
  ...over,
});

describe("POST /adventure - author-time pipeline (real HTTP route)", () => {
  it("with a brief yields a schema-valid, multi-instance Adventure with a valid progression DAG", async () => {
    const brief = briefFor({ universes: ["dwarven halls"], likedNpcs: ["a gruff smith"], difficulty: "normal" });
    const { status, json } = await post("/adventure", { brief });

    expect(status).toBe(201);
    const r = validate(SCHEMA_ID.persistence.adventure, json);
    expect(r.ok, JSON.stringify(r.errors, null, 2)).toBe(true);

    expect(json.instances.length).toBeGreaterThanOrEqual(2);
    expect(validateProgression(json.progression).ok).toBe(true);
    expect(json.progression.nodes).toEqual(json.instances.map((i) => i.id));
    expect(json.progression.start).toBe(json.instances[0].id);

    // every instance is populated and internally consistent -> a playable world
    for (const inst of json.instances) {
      expect(inst.rooms.length).toBeGreaterThan(0);
      expect(inst.npcs.length).toBeGreaterThan(0);
      const roomIds = new Set(inst.rooms.map((rm) => rm.id));
      for (const n of inst.npcs) {
        expect(n.allowedModes).toContain(n.startMode); // startMode is a mode the body can perform
        expect(roomIds.has(n.homeRoom)).toBe(true); // home room actually exists in the instance
      }
    }
  });

  it("without a brief (skip path) still authors a valid multi-instance Adventure from defaults", async () => {
    const { status, json } = await post("/adventure", { seedHints: "spooky crypt" });
    expect(status).toBe(201);
    expect(validate(SCHEMA_ID.persistence.adventure, json).ok).toBe(true);
    expect(json.instances.length).toBeGreaterThanOrEqual(2);
    expect(validateProgression(json.progression).ok).toBe(true);
  });

  it("persists the Adventure: GET /adventure/:id returns the saved document (side effect)", async () => {
    const { json: created } = await post("/adventure", { brief: briefFor({ difficulty: "easy" }) });
    const res = await fetch(`${base}/adventure/${encodeURIComponent(created.meta.id)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it("GET an unknown adventure id is a 404", async () => {
    const res = await fetch(`${base}/adventure/does-not-exist`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("a JSON body of literal null is treated as an empty request, not a 500", async () => {
    const res = await fetch(`${base}/adventure`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    });
    expect(res.status).toBe(201);
    expect(validate(SCHEMA_ID.persistence.adventure, await res.json()).ok).toBe(true);
  });

  it("a loose or non-canonical brief is normalized into a valid Adventure, not a 500", async () => {
    // partial brief (missing required fields), a difficulty outside the enum, and an unknown field.
    const cases = [
      { themes: ["dungeon"] },
      { universes: [], likedNpcs: [], tone: "tense", difficulty: "medium", themes: ["dungeon"], freeText: "" },
      { ...briefFor(), somethingExtra: "x" },
    ];
    for (const brief of cases) {
      const { status, json } = await post("/adventure", { brief });
      expect(status, JSON.stringify(json)).toBe(201);
      expect(validate(SCHEMA_ID.persistence.adventure, json).ok, JSON.stringify(json.creativeBrief)).toBe(true);
      // the normalized brief clamps difficulty into the enum
      expect(["easy", "normal", "hard"]).toContain(json.creativeBrief.difficulty);
    }
  });

  it("the runtime can load and walk the authored first instance (playable end to end)", async () => {
    const { json } = await post("/adventure", { brief: briefFor({ difficulty: "normal" }) });
    const instance = json.instances[0];

    const model = buildSceneModel(instance);
    expect(model.rooms.length).toBe(instance.rooms.length);
    expect(model.npcs.length).toBe(instance.npcs.length);

    // the player spawns inside a real room, and the goal room is reachable through the doorways
    const spawnRoom = roomAt(model, model.spawn.position.x, model.spawn.position.z);
    expect(spawnRoom).not.toBeNull();

    const goalRoom = model.rooms.find((rm) => model.items.some((it) => it.room === rm.id)) ?? model.rooms.at(-1);
    const nav = createPortalNav(model);
    const path = nav.findPath(
      { x: model.spawn.position.x, z: model.spawn.position.z },
      { x: goalRoom.center.x, z: goalRoom.center.z },
    );
    expect(path.at(-1)).toEqual({ x: goalRoom.center.x, z: goalRoom.center.z });
  });
});
