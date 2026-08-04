import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildInstanceObject3D } from "../src/scene.js";

// The input is a runtime SceneModel, taken from the example it publishes: this box is held to the
// shape it is given, not to the code that makes it.
const HERE = dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(
  readFileSync(join(HERE, "../../runtime/fixtures/scene-model.example.json"), "utf8"),
);

// A stand-in for the asset-registry contract: knows two assets, throws ASSET_NOT_FOUND otherwise.
// (Injected, never imported, so the runtime stays isolated from the asset-registry layer.)
function fakeRegistry() {
  const sizes = {
    "kaykit.props.chest": [1, 1, 0.6],
    "kaykit.character.skeleton": [0.6, 1.8, 0.6],
  };
  return {
    get(id) {
      if (!(id in sizes)) {
        const err = new Error(`asset not found: ${id}`);
        err.code = "ASSET_NOT_FOUND";
        throw err;
      }
      return { id, size: sizes[id] };
    },
  };
}

describe("the cityscape builder", () => {
  it("builds a named instance group with a mesh per floor, wall, object, item and npc", () => {
    const warn = vi.fn();
    const group = buildInstanceObject3D(model, { registry: fakeRegistry(), warn });

    expect(group.name).toBe("instance:inst-001");
    expect(group.userData.counts).toMatchObject({ floors: 3, walls: 14, objects: 3, items: 1, npcs: 2 });
    expect(group.children.filter((c) => c.name.startsWith("floor:"))).toHaveLength(3);
    expect(group.getObjectByName("item:amulet")).toBeTruthy();
    expect(group.getObjectByName("npc:npc-guard")).toBeTruthy();
  });

  it("sizes known assets from the registry and warns+substitutes for unknown ones", () => {
    const warn = vi.fn();
    const group = buildInstanceObject3D(model, { registry: fakeRegistry(), warn });

    const chest = group.getObjectByName("object:obj-chest-1");
    expect(chest.userData.placeholder).toBe(false); // sized from the registry

    const torch = group.getObjectByName("object:obj-torch-1");
    expect(torch.userData.placeholder).toBe(true); // absent -> default placeholder
    // torch, anvil and the dwarf body are all absent from the fake registry
    expect(warn).toHaveBeenCalled();
    expect(group.userData.counts.placeholders).toBe(3);
  });

  it("never crashes when no registry is supplied: everything becomes a placeholder", () => {
    const warn = vi.fn();
    const group = buildInstanceObject3D(model, { warn });
    expect(group.userData.counts.placeholders).toBe(5); // 3 objects + 2 npcs
    expect(group.children.length).toBeGreaterThan(0);
  });
});
