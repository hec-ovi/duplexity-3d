import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRuntime } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const adventure = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);

function loaded(deps = {}) {
  const rt = createRuntime(deps);
  rt.load(adventure, "inst-001");
  return rt;
}

describe("runtime simulation (step)", () => {
  it("moves the player forward and stops them at a wall instead of clipping through", () => {
    const rt = loaded();
    rt.setYaw(0); // forward = -Z, toward the entry south wall
    rt.step(0.1, { forward: true });
    expect(rt.getPlayer().position.z).toBeLessThan(0); // moved

    for (let i = 0; i < 60; i++) rt.step(0.1, { forward: true });
    const z = rt.getPlayer().position.z;
    expect(z).toBeGreaterThan(-2.9); // never passed the wall plane
    expect(z).toBeLessThan(-2); // but pressed right up against it
  });

  it("does not tunnel through a wall at a large dt (sub-steps anchor to the resolved position)", () => {
    const rt = loaded();
    const p = rt.getPlayer();
    p.position.x = -2.6; // pinned in the entry SW corner against both walls
    p.position.z = -2.6;
    rt.setYaw(0); // forward -Z; with left held, straight into the -X/-Z corner
    rt.step(0.5, { forward: true, left: true }); // a 0.5s spike would overshoot ~1.2m per axis
    const pos = rt.getPlayer().position;
    expect(pos.x).toBeGreaterThan(-2.9); // did not punch through the west wall
    expect(pos.z).toBeGreaterThan(-2.9); // did not punch through the south wall
    expect(rt.getPlayer().currentRoom).toBe("room-entry"); // still inside the level
  });

  it("walking through the p1 doorway moves the player from the entry into the hall", () => {
    const onRoomChange = vi.fn();
    const rt = loaded({ onRoomChange });
    const p = rt.getPlayer();
    p.position.x = 0;
    p.position.z = 2;
    rt.setYaw(Math.PI); // forward = +Z, through the doorway at (0,3)

    for (let i = 0; i < 12; i++) rt.step(0.1, { forward: true });

    expect(rt.getPlayer().currentRoom).toBe("room-hall");
    expect(onRoomChange).toHaveBeenCalledWith("room-entry", "room-hall");
  });

  it("walking onto the amulet auto-picks it up and meets the discover_item goal once", () => {
    const onGoalMet = vi.fn();
    const onRequestNextInstance = vi.fn();
    const rt = loaded({ onGoalMet, onRequestNextInstance });
    const p = rt.getPlayer();
    p.position.x = 4.5;
    p.position.z = 6; // in the vault, west of the amulet at (6,6)
    rt.setYaw(-Math.PI / 2); // forward = +X, toward the amulet

    for (let i = 0; i < 15; i++) rt.step(0.1, { forward: true });

    expect(onGoalMet).toHaveBeenCalledOnce();
    expect(onGoalMet).toHaveBeenCalledWith("inst-001", { instanceId: "inst-001", goalMet: true });
    expect(onRequestNextInstance).toHaveBeenCalledOnce();
  });
});
