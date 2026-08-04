// @vitest-environment jsdom
// Names and speech are HTML over the canvas, not glyphs in the scene. This proves the overlay puts
// them where the camera says they are, keeps them readable, and hides what you cannot see.
import { describe, it, expect } from "vitest";
import { createLabelsOverlay } from "../src/labels-overlay.js";

// Stand-in for the app shell's projector: everything is 10m away and centred unless said otherwise.
function view(overrides = {}) {
  return {
    width: 1000,
    height: 500,
    project: (position) =>
      position.x === Infinity ? null : { x: 0.5, y: 0.25, distance: position.x, ...overrides },
  };
}

const at = (distance) => ({ x: distance, y: 0, z: 0 });

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, overlay: createLabelsOverlay(container) };
}

describe("runtime - labels overlay", () => {
  it("draws a name in the DOM at the projected screen position", () => {
    const { container, overlay } = mount();
    overlay.sync([{ id: "npc-1", name: "street vendor", position: at(10) }], {}, view());

    const label = container.querySelector(".dx-label");
    expect(label.textContent).toContain("street vendor");
    expect(label.style.left).toBe("500px"); // 0.5 * 1000
    expect(label.style.top).toBe("125px"); // 0.25 * 500
    overlay.dispose();
  });

  it("shows what an NPC says, and stops showing it when they stop", () => {
    const { container, overlay } = mount();
    const entry = { id: "npc-1", name: "vendor", position: at(5) };

    overlay.sync([{ ...entry, says: "Evening." }], {}, view());
    const says = container.querySelector(".dx-says");
    expect(says.textContent).toBe("Evening.");
    expect(says.style.display).not.toBe("none");

    overlay.sync([entry], {}, view());
    expect(container.querySelector(".dx-says").style.display).toBe("none");
    overlay.dispose();
  });

  it("hides anyone too far to read, or behind the camera", () => {
    const { container, overlay } = mount();
    overlay.sync(
      [
        { id: "near", name: "near", position: at(8) },
        { id: "far", name: "far", position: at(90) },
        { id: "behind", name: "behind", position: { x: Infinity, y: 0, z: 0 } },
      ],
      {},
      view()
    );
    const shown = [...container.querySelectorAll(".dx-label")].filter((el) => el.style.display !== "none");
    expect(shown).toHaveLength(1);
    expect(shown[0].textContent).toContain("near");
    overlay.dispose();
  });

  it("drops the label of an NPC that is no longer there, and cleans up after itself", () => {
    const { container, overlay } = mount();
    overlay.sync([{ id: "a", name: "A", position: at(5) }, { id: "b", name: "B", position: at(5) }], {}, view());
    expect(container.querySelectorAll(".dx-label")).toHaveLength(2);

    overlay.sync([{ id: "a", name: "A", position: at(5) }], {}, view());
    expect(container.querySelectorAll(".dx-label")).toHaveLength(1);

    overlay.dispose();
    expect(container.querySelector(".dx-labels")).toBeNull();
  });
});
