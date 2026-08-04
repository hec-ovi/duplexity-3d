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

  // A line that follows a walking NPC is hard to read and ends up in your face. Speech goes in one
  // panel, in the same place every time, like any other piece of UI.
  it("puts what an NPC says in the dialogue panel, and takes it down when they stop", () => {
    const { container, overlay } = mount();
    const entry = { id: "npc-1", name: "vendor", position: at(5) };

    overlay.sync([{ ...entry, says: "Evening." }], {}, view());
    const panel = container.querySelector(".dx-dialogue");
    expect(panel.style.display).not.toBe("none");
    expect(panel.querySelector(".dx-who").textContent).toBe("vendor");
    expect(panel.querySelector(".dx-said").textContent).toBe("Evening.");
    // and the tag over their head is only their name, whatever they are saying
    expect(container.querySelector(".dx-label").textContent).toBe("vendor");

    overlay.sync([entry], {}, view());
    expect(panel.style.display).toBe("none");
    overlay.dispose();
  });

  it("shows a line from someone you cannot see, since the panel is not attached to them", () => {
    const { container, overlay } = mount();
    overlay.sync([{ id: "far", name: "lookout", says: "Over here.", position: at(90) }], {}, view());
    expect(container.querySelector(".dx-label").style.display).toBe("none");
    expect(container.querySelector(".dx-dialogue").style.display).not.toBe("none");
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
