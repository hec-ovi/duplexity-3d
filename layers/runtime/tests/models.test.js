import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { buildSceneModel } from "../src/scene-model.js";
import { buildInstanceObject3D } from "../src/three-scene.js";
import { attachModels } from "../src/models.js";

// One street, one building on it, and that building is a file somebody else built. The level says
// where it stands and how far it is turned; the file says what it looks like.
const street = {
  id: "ashgate",
  theme: "city",
  rules: { mapKind: "street", label: "Ashgate" },
  rooms: [
    {
      id: "ground",
      position: [0, 0, 0],
      size: [120, 140, 120],
      floorKit: "kit.floor",
      wallKit: "kit.wall",
      open: true,
      objects: [],
      inventory: [],
      zones: [],
      lights: [],
      blocks: [
        {
          id: "mass-b1",
          position: [10, 0, -6],
          size: [14, 48, 18],
          assetRef: "glb.the-vault",
          rotationY: Math.PI / 2,
          label: "The Vault",
          floors: 15,
        },
      ],
    },
  ],
  portals: [
    {
      id: "door-b1",
      roomA: "ground",
      roomB: "LINK",
      blockId: "mass-b1",
      position: [17, 0, -6],
      axis: "x",
      size: [2, 3],
      link: { instanceId: "ashgate-b1-f1", spawnRoomId: "entry", kind: "enter" },
    },
  ],
  npcs: [],
  goal: { type: "survive", seconds: 30 },
  spawn: { position: [-40, 0, 0], facing: 0 },
};

const vault = {
  id: "glb.the-vault",
  kind: "building",
  size: [14, 48, 18],
  glbUrl: "the-vault.glb",
  anchor: [0, 0, 0],
  doors: "own",
};

// Injected, never imported: any object answering `get` is a catalog.
const registryOf = (entry) => ({
  get(id) {
    if (entry && id === entry.id) return entry;
    const err = new Error(`asset not found: ${id}`);
    err.code = "ASSET_NOT_FOUND";
    throw err;
  },
});

const sceneOf = (entry, extra = {}) =>
  buildInstanceObject3D(buildSceneModel(street), { registry: registryOf(entry), warn: vi.fn(), ...extra });

describe("buildings that are files", () => {
  it("stands a mass in its place, turned as the level says, and dresses nothing on it", () => {
    const dressFacade = vi.fn(() => ({ tiers: [], bands: [], parts: [] }));
    const group = sceneOf(vault, { dressFacade });

    const holder = group.getObjectByName("block:mass-b1");
    expect(holder.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(holder.position.y).toBe(0); // its base on the ground, which is where a GLB is written from
    expect(holder.position.x).toBe(10);
    expect(holder.getObjectByName("block:mass-b1:standing-in")).toBeTruthy();
    expect(group.userData.counts.blocks).toBe(1);
    expect(group.userData.models).toHaveLength(1);
    // the file carries its own front, so nothing of ours is bolted to it
    expect(dressFacade).not.toHaveBeenCalled();
  });

  it("puts the file where its anchor says, and takes the mass away", async () => {
    const group = sceneOf({ ...vault, anchor: [-1, 0.5, 2] });
    const holder = group.getObjectByName("block:mass-b1");
    const load = vi.fn(async () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));

    const result = await attachModels(group.userData.models, load);

    expect(result).toEqual({ loaded: 1, failed: 0 });
    expect(load).toHaveBeenCalledWith("the-vault.glb");
    expect(holder.getObjectByName("block:mass-b1:standing-in")).toBeFalsy();
    expect(holder.children).toHaveLength(1);
    expect(holder.children[0].position.toArray()).toEqual([-1, 0.5, 2]);
  });

  it("leaves the mass standing when the file never arrives, and says so", async () => {
    const group = sceneOf(vault);
    const holder = group.getObjectByName("block:mass-b1");
    const warn = vi.fn();

    const result = await attachModels(group.userData.models, async () => {
      throw new Error("404");
    }, warn);

    expect(result).toEqual({ loaded: 0, failed: 1 });
    expect(holder.getObjectByName("block:mass-b1:standing-in")).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("glb.the-vault"));
  });

  it("builds no door over one the file brought, and builds one when it did not", () => {
    expect(sceneOf(vault).getObjectByName("doorway:door-b1")).toBeFalsy();
    expect(sceneOf({ ...vault, doors: "none" }).getObjectByName("doorway:door-b1")).toBeTruthy();
  });

  it("draws a plain mass when the catalog has never heard of what it names", () => {
    const group = sceneOf(null);

    expect(group.userData.models).toHaveLength(0);
    expect(group.getObjectByName("block:mass-b1")).toBeTruthy(); // still a building on the street
    expect(group.userData.counts.blocks).toBe(1);
  });
});
