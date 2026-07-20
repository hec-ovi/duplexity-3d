import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSceneModel } from "../src/scene-model.js";
import { createPortalNav } from "../src/nav.js";
import { createNpcState, stepNpc, animationForMode, NPC_DEFAULTS } from "../src/npc-sim.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const adventure = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);
const model = buildSceneModel(adventure.instances[0]);
const nav = createPortalNav(model);

function ctx(player) {
  return { model, colliders: model.colliders, nav, player };
}
function placement(id) {
  return model.npcs.find((n) => n.id === id);
}
function run(state, dt, steps, player) {
  const c = ctx(player);
  for (let i = 0; i < steps; i++) stepNpc(state, dt, c);
  return state;
}
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe("npc-sim mode behaviour (deterministic)", () => {
  it("the scene model carries the npc's authored fields the sim needs", () => {
    const smith = placement("npc-smith");
    expect(smith.name).toBe("Bruk Ironhand");
    expect(smith.allowedModes).toContain("talk");
    // portals are exposed for the router
    expect(model.portals.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("patrol walks the home room and stays inside it", () => {
    const skel = createNpcState(placement("npc-guard"), { seed: 7 }); // home room-vault, startMode patrol
    const start = { ...skel.position };
    run(skel, 0.1, 200, { x: 0, z: 0 });
    const vault = model.rooms.find((r) => r.id === "room-vault");
    expect(skel.mode).toBe("patrol");
    expect(skel.patrol).toHaveLength(4);
    expect(dist(skel.position, start)).toBeGreaterThan(0.5); // actually moved
    // never escaped the vault footprint (allow the collider half-thickness + radius margin)
    expect(skel.position.x).toBeGreaterThan(vault.min.x - 0.1);
    expect(skel.position.x).toBeLessThan(vault.max.x + 0.1);
    expect(skel.position.z).toBeGreaterThan(vault.min.z - 0.1);
    expect(skel.position.z).toBeLessThan(vault.max.z + 0.1);
  });

  it("follow routes through the doorway and stops at the standoff distance", () => {
    const smith = createNpcState(placement("npc-smith"), { seed: 1 }); // hall, spawn (0,6)
    smith.mode = "follow";
    const player = { x: 0, z: 2 }; // in the entry, on the far side of the p1 doorway
    const before = dist(smith.position, player);
    run(smith, 0.1, 150, player);
    const after = dist(smith.position, player);
    expect(after).toBeLessThan(before); // closed the gap
    expect(after).toBeLessThan(NPC_DEFAULTS.followStandoff + 0.4); // stopped at the standoff
    expect(smith.position.z).toBeLessThan(4); // advanced from its (0,6) post toward the p1 doorway
  });

  it("flee increases distance from the player", () => {
    const npc = createNpcState(
      { id: "f", name: "F", disposition: "wary", bodyRef: "b", homeRoom: "room-entry", startMode: "flee", position: { x: 0, y: 0, z: 0 }, facing: 0 },
      { seed: 1 },
    );
    const player = { x: 0, z: -1 };
    const before = dist(npc.position, player);
    run(npc, 0.1, 12, player);
    expect(dist(npc.position, player)).toBeGreaterThan(before + 1);
  });

  it("move_to reaches its target then flips to idle, clearing both target and targetRef", () => {
    const npc = createNpcState(placement("npc-smith"), { seed: 1 });
    npc.mode = "move_to";
    npc.target = { x: 2, z: 7 }; // a point in the hall
    npc.targetRef = "some-ref"; // the string ref reported in selfContext
    run(npc, 0.1, 80, { x: 0, z: 0 });
    expect(dist(npc.position, { x: 2, z: 7 })).toBeLessThan(0.4);
    expect(npc.mode).toBe("idle");
    expect(npc.target).toBeNull();
    expect(npc.targetRef).toBeNull(); // no stale destination lingers once arrived
  });

  it("dead NPCs do not move", () => {
    const npc = createNpcState(placement("npc-guard"), { seed: 1 });
    npc.mode = "dead";
    const before = { ...npc.position };
    run(npc, 0.1, 10, { x: 6, z: 8 });
    expect(npc.position).toEqual(before);
    expect(npc.animation).toBe("die");
  });

  it("wander is deterministic: same seed replays the identical path", () => {
    const walk = (seed) => {
      const s = createNpcState(placement("npc-smith"), { seed });
      s.mode = "wander";
      run(s, 0.1, 120, { x: 0, z: 0 });
      return { x: s.position.x, z: s.position.z };
    };
    expect(walk(42)).toEqual(walk(42)); // reproducible
    expect(walk(42)).not.toEqual(walk(99)); // seed actually varies the path
  });

  it("maps modes to animation clips", () => {
    expect(animationForMode("dead", false)).toBe("die");
    expect(animationForMode("attack", false)).toBe("attack");
    expect(animationForMode("attack", true)).toBe("walk");
    expect(animationForMode("talk", false)).toBe("talk");
    expect(animationForMode("follow", true)).toBe("walk");
    expect(animationForMode("wander", false)).toBe("idle");
    expect(animationForMode("idle", false)).toBe("idle");
  });
});
