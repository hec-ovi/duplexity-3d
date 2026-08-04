// @vitest-environment jsdom
// The map overlay and moving between instances: what the player actually sees of a city level.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "../src/app.js";
import { drawBlueprint, placesLeft } from "../src/blueprint-hud.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const city = JSON.parse(
  readFileSync(join(HERE, "../../map-state/fixtures/city.adventure.json"), "utf8")
);

function stubRenderer() {
  return {
    domElement: document.createElement("canvas"),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
}

function mount(opts = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return createApp({
    container,
    adventure: city,
    instanceId: "street-main",
    renderer: stubRenderer(),
    warn: () => {},
    ...opts,
  });
}

// Records every call so a test can assert what was drawn without a real canvas.
function recordingContext() {
  const calls = [];
  const record = (name) => (...args) => calls.push({ name, args });
  return {
    calls,
    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    strokeRect: record("strokeRect"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    arc: record("arc"),
    closePath: record("closePath"),
    setLineDash: record("setLineDash"),
    stroke: record("stroke"),
    fill: record("fill"),
    fillText: record("fillText"),
  };
}

describe("runtime - the blueprint overlay and moving between instances", () => {
  it("goTo rebuilds the scene in the new instance and puts the player in the arrival room", () => {
    const app = mount();
    expect(app.blueprint().instanceId).toBe("street-main");
    const before = app.instanceGroup;

    app.goTo("bldg-a-f1", { spawnRoomId: "a1-lobby" });

    expect(app.blueprint().instanceId).toBe("bldg-a-f1");
    expect(app.getPlayer().currentRoom).toBe("a1-lobby");
    expect(app.instanceGroup).not.toBe(before); // the street's geometry is gone, not stacked
    expect(app.scene.children).not.toContain(before);
    app.dispose();
  });

  it("onFrame runs after every tick, which is what keeps the overlay current", () => {
    const onFrame = vi.fn();
    const app = mount({ onFrame });
    app.tick(1 / 60);
    app.tick(1 / 60);
    expect(onFrame).toHaveBeenCalledTimes(2);
    app.dispose();
  });

  it("draws the room you are in, its doors and your position, and nothing unvisited", () => {
    const app = mount();
    const ctx = recordingContext();
    drawBlueprint(ctx, app.blueprint(), { width: 200, height: 200 });

    // one room walked into so far -> one room outline, not two
    expect(ctx.calls.filter((c) => c.name === "strokeRect")).toHaveLength(1);
    // the player marker
    expect(ctx.calls.some((c) => c.name === "arc")).toBe(true);
    // the label along the bottom names the place
    expect(ctx.calls.filter((c) => c.name === "fillText").at(-1).args[0]).toContain("Ashgate Street");

    // The spawn is level with the edge of the opening between the two street rooms, so step onto the
    // centre line (+Z) before heading east (+X) into the second room.
    app.setYaw(Math.PI);
    for (let i = 0; i < 36; i++) app.runtime.step(1 / 60, { forward: true });
    app.setYaw(-Math.PI / 2);
    for (let i = 0; i < 300; i++) app.runtime.step(1 / 60, { forward: true });

    const after = recordingContext();
    drawBlueprint(after, app.blueprint(), { width: 200, height: 200 });
    expect(app.blueprint().rooms.map((r) => r.id).sort()).toEqual(["street-e", "street-w"]);
    expect(after.calls.filter((c) => c.name === "strokeRect")).toHaveLength(2);
    app.dispose();
  });

  // A city stands hundreds of buildings and a run visits a handful. Without a marker the player has
  // no way of telling which door on the street is one of them.
  it("marks the places still to finish, nearest first, and points at that one", () => {
    const app = mount();
    // Walk east so both halves of the street have been seen: the map never marks a place on ground
    // the player has not stood on.
    app.setYaw(Math.PI);
    for (let i = 0; i < 36; i++) app.runtime.step(1 / 60, { forward: true });
    app.setYaw(-Math.PI / 2);
    for (let i = 0; i < 300; i++) app.runtime.step(1 / 60, { forward: true });

    const plan = app.blueprint();
    const left = ["bldg-a-f1", "bldg-b-f1"];

    const places = placesLeft(plan, left);
    expect(places.map((p) => p.id).sort()).toEqual(left);
    expect(places[0].distance).toBeLessThanOrEqual(places[1].distance);
    expect(Math.abs(places[0].bearing)).toBeLessThanOrEqual(Math.PI);

    const ctx = recordingContext();
    drawBlueprint(ctx, plan, { width: 200, height: 200, left });
    expect(ctx.calls.filter((c) => c.name === "closePath")).toHaveLength(2); // one marker each
    const written = ctx.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
    expect(written.some((t) => t.startsWith(places[0].label))).toBe(true);

    // Finish one and its marker goes: what is left is what is left.
    const after = recordingContext();
    drawBlueprint(after, plan, { width: 200, height: 200, left: ["bldg-b-f1"] });
    expect(after.calls.filter((c) => c.name === "closePath")).toHaveLength(1);
  });

  it("an empty or absent plan clears the canvas and draws nothing", () => {
    const ctx = recordingContext();
    drawBlueprint(ctx, null, { width: 200, height: 200 });
    expect(ctx.calls).toEqual([{ name: "clearRect", args: [0, 0, 200, 200] }]);

    const empty = recordingContext();
    drawBlueprint(empty, { rooms: [], doors: [], player: { x: 0, z: 0, yaw: 0 }, label: "x" }, { width: 10, height: 10 });
    expect(empty.calls.map((c) => c.name)).toEqual(["clearRect"]);
  });
});
