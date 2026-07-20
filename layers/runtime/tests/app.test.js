// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "../src/app.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const adventure = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);

// A head-less stand-in for three's WebGLRenderer so the app runs with no GL context.
function stubRenderer() {
  return {
    domElement: document.createElement("canvas"),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
}

function mount(opts = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = createApp({
    container,
    adventure,
    instanceId: adventure.progression.start,
    renderer: stubRenderer(),
    warn: () => {},
    ...opts,
  });
  return { app, container };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("runtime app (browser shell)", () => {
  it("renders each frame and boots the player into the starting room", () => {
    const { app } = mount();
    expect(app.getPlayer().currentRoom).toBe("room-entry");
    const before = { ...app.getPlayer().position };
    app.tick(0.016);
    expect(app.getPlayer().position).toEqual(before); // no keys held -> no movement
    expect(app.camera.position.y).toBeCloseTo(1.6, 5); // eye height above the floor
  });

  it("holding W walks the player forward through the scene", async () => {
    const { app } = mount();
    app.setYaw(0); // forward = -Z
    const user = userEvent.setup();
    await user.keyboard("{w>}"); // press and hold W

    const startZ = app.getPlayer().position.z;
    for (let i = 0; i < 5; i++) app.tick(0.1);
    expect(app.getPlayer().position.z).toBeLessThan(startZ);

    await user.keyboard("{/w}");
    app.dispose();
  });

  it("does not let the player walk through a wall (invalid move is clamped)", async () => {
    const { app } = mount();
    app.setYaw(0); // drive straight into the entry south wall
    const user = userEvent.setup();
    await user.keyboard("{w>}");
    for (let i = 0; i < 40; i++) app.tick(0.1);
    const z = app.getPlayer().position.z;
    expect(z).toBeGreaterThan(-2.9); // never passed the wall plane
    expect(z).toBeLessThan(-2); // but actually reached and was clamped against it
    await user.keyboard("{/w}");
    app.dispose();
  });

  it("requestPointerLock engages mouse-look through the canvas element", () => {
    const canvas = document.createElement("canvas");
    canvas.requestPointerLock = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp({
      container,
      adventure,
      instanceId: adventure.progression.start,
      renderer: { domElement: canvas, setSize: vi.fn(), render: vi.fn(), dispose: vi.fn() },
      warn: () => {},
    });
    app.requestPointerLock();
    expect(canvas.requestPointerLock).toHaveBeenCalledOnce();
    app.dispose();
  });

  it("pressing E next to an NPC talks to it: a bubble appears and the exchange is archived", async () => {
    const onHistoryAppend = vi.fn();
    const { app } = mount({
      onInteraction: () => ({ newMode: "talk", utterance: "Well met, traveler." }),
      onHistoryAppend,
    });
    const p = app.getPlayer();
    p.position.x = 0;
    p.position.z = 5; // about a metre south of the smith at (0,6)
    app.tick(0.016);

    const user = userEvent.setup();
    await user.keyboard("e"); // talk to the nearest NPC

    expect(app.getNpcs().find((n) => n.id === "npc-smith").mode).toBe("talk");
    expect(app.runtime.getSpeech().get("npc-smith").text).toBe("Well met, traveler.");
    expect(onHistoryAppend).toHaveBeenCalledOnce();
    app.dispose();
  });

  it("pressing E with no NPC in range does nothing", async () => {
    const onInteraction = vi.fn(() => ({ newMode: "talk", utterance: "hi" }));
    const { app } = mount({ onInteraction });
    // player spawns in the entry; both NPCs are rooms away, beyond talkRange
    const user = userEvent.setup();
    await user.keyboard("e");
    expect(onInteraction).not.toHaveBeenCalled();
    app.dispose();
  });

  it("walking onto the amulet fires the goal-met callback", async () => {
    const onGoalMet = vi.fn();
    const { app } = mount({ onGoalMet });
    const p = app.getPlayer();
    p.position.x = 4.5;
    p.position.z = 6; // drop into the vault, west of the amulet
    app.setYaw(-Math.PI / 2); // forward = +X

    const user = userEvent.setup();
    await user.keyboard("{w>}");
    for (let i = 0; i < 15; i++) app.tick(0.1);

    expect(onGoalMet).toHaveBeenCalledWith("inst-001", { instanceId: "inst-001", goalMet: true });
    await user.keyboard("{/w}");
    app.dispose();
  });
});
