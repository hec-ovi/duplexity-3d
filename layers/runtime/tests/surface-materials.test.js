import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createSurfaceMaterials, createSurfaceStore } from "../src/surface-materials.js";
import { buildInstanceObject3D } from "../src/three-scene.js";

// The painter is another box, injected. Here it is a stand-in that reports what it was asked for, so
// this proves the wiring: the canvas, the repeat, the colour space and the disposal are the runtime's
// job, and none of them needs a GPU to check.
function fakePainter() {
  const asked = [];
  const paintSurface = (kind, ctxFor, opts) => {
    asked.push({ kind, opts });
    const maps = { albedo: ctxFor("albedo", 64, 64) };
    if (kind === "facade") maps.emissive = ctxFor("emissive", 64, 64);
    return {
      kind,
      pixels: [64, 64],
      metres: kind === "facade" ? [12, 16] : [4, 4],
      maps,
      material: { roughness: 0.8, metalness: 0.1, emissiveIntensity: 1.4 },
    };
  };
  return { paintSurface, asked };
}

const fakeDocument = {
  createElement: () => {
    const canvas = { width: 0, height: 0 };
    canvas.getContext = () => ({ canvas });
    return canvas;
  },
};

const make = () => {
  const painter = fakePainter();
  return { painter, materials: createSurfaceMaterials({ ...painter, document: fakeDocument }) };
};

describe("surface materials", () => {
  it("repeats a surface at its own scale, whatever it is covering", () => {
    const { materials } = make();
    const pavement = materials.ground("sidewalk", 24, 8);
    const road = materials.ground("road", 120, 120);

    expect(pavement.map.repeat.x).toBeCloseTo(6, 6); // 24m of a 4m tile
    expect(pavement.map.repeat.y).toBeCloseTo(2, 6);
    expect(road.map.repeat.x).toBeCloseTo(30, 6);
    // colour data, and it has to tile
    expect(road.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(road.map.wrapS).toBe(THREE.RepeatWrapping);
    expect(road.roughness).toBeCloseTo(0.8, 6);
  });

  it("paints each surface once and reuses it at every size it is needed", () => {
    const { painter, materials } = make();
    materials.ground("sidewalk", 24, 8);
    materials.ground("sidewalk", 6, 6);
    materials.ground("plaza", 10, 10);
    expect(painter.asked.map((a) => a.opts.seed)).toEqual(["pavement", "plaza"]);
  });

  it("wraps a building in a facade painted to fit its own walls, and a plain roof", () => {
    const { painter, materials } = make();
    const faces = materials.block({
      id: "mass-ashgate-b1",
      size: { x: 12, y: 19.2, z: 6 },
      floors: 6,
      program: "office",
    });

    expect(faces).toHaveLength(6);
    // one sheet for the wide walls, one for the narrow ones, each painted to that wall's frontage
    expect(painter.asked.map((a) => a.opts.metresWide)).toEqual([12, 6]);
    expect(painter.asked[0].opts).toMatchObject({ seed: "mass-ashgate-b1", floors: 6, program: "office" });

    const [px, , roof] = faces;
    // nothing tiles: a wall wears one whole sheet, so no window is ever cut in half
    expect(px.map.repeat.x).toBeCloseTo(1, 6);
    expect(px.map.repeat.y).toBeCloseTo(1, 6);
    expect(faces[4].map.repeat.x).toBeCloseTo(1, 6);
    expect(faces[4].map).not.toBe(px.map); // and the two sides are not the same sheet
    expect(px.emissiveMap).toBeTruthy();
    expect(px.emissiveIntensity).toBeCloseTo(1.4, 6);
    expect(roof.map).toBeFalsy();
  });

  it("works out the storeys when the level does not say", () => {
    const { painter, materials } = make();
    materials.block({ id: "mass-x", size: { x: 10, y: 15.2, z: 10 } });
    expect(painter.asked[0].opts.floors).toBe(4); // (15.2 - 2) / 3.2
  });

  it("gives everything back when the scene is torn down", () => {
    const { materials } = make();
    const disposed = [];
    const road = materials.ground("road", 10, 10);
    road.map.addEventListener("dispose", () => disposed.push("road"));
    materials.dispose();
    expect(disposed).toEqual(["road"]);
  });

  // Walking through a door builds a new scene. Painting a city again on the way is what makes a door
  // feel slow, and nothing about the city changed.
  it("keeps what was painted when a scene is thrown away, so a door does not repaint the city", () => {
    const store = createSurfaceStore();
    const first = fakePainter();
    const scene = createSurfaceMaterials({ ...first, store, document: fakeDocument });
    scene.ground("road", 10, 10);
    scene.block({ id: "mass-1", size: { x: 12, y: 16, z: 8 }, floors: 4 });
    expect(first.asked.length).toBe(3); // the road, and a facade sheet for each pair of walls
    scene.dispose();

    const next = fakePainter();
    const after = createSurfaceMaterials({ ...next, store, document: fakeDocument });
    after.ground("road", 40, 40);
    after.block({ id: "mass-1", size: { x: 12, y: 16, z: 8 }, floors: 4 });

    expect(next.asked).toEqual([]); // painted once, for as long as the app is up
    expect(after.ground("road", 10, 10).map.repeat.x).toBe(2.5); // and still repeats to fit
  });

  it("is absent when there is no painter, and the scene falls back to flat colour", () => {
    expect(createSurfaceMaterials({})).toBeNull();
    expect(createSurfaceMaterials({ paintSurface: fakePainter().paintSurface, document: null })).toBeNull();

    const model = {
      instanceId: "ashgate",
      rooms: [{ id: "ground", size: { x: 40, y: 20, z: 40 }, center: { x: 0, z: 0 }, floorY: 0, floorKit: "k" }],
      walls: [],
      zones: [{ id: "road", kind: "road", size: { x: 40, z: 40 }, center: { x: 0, y: 0, z: 0 } }],
      blocks: [{ id: "mass-1", size: { x: 8, y: 12, z: 8 }, center: { x: 0, y: 6, z: 0 }, floors: 3 }],
      objects: [],
      items: [],
      npcs: [],
    };
    const plain = buildInstanceObject3D(model, {});
    expect(plain.getObjectByName("block:mass-1").material.map).toBeFalsy();

    const { materials } = make();
    const painted = buildInstanceObject3D(model, { materials });
    expect(painted.getObjectByName("block:mass-1").material).toHaveLength(6);
    expect(painted.getObjectByName("zone:road").material.map).toBeTruthy();
    expect(painted.getObjectByName("floor:ground").material.map).toBeTruthy();
  });
});

describe("doorways", () => {
  it("puts a lit sign over the way out, so it can be found from across a room", () => {
    const model = {
      instanceId: "f1",
      rooms: [],
      walls: [],
      zones: [],
      blocks: [],
      objects: [],
      items: [],
      npcs: [],
      groundY: 0,
      portals: [
        { id: "out", roomA: "entry", roomB: "EXIT", axis: "z", center: { x: 0, y: 0, z: -4 }, size: [1.6, 2.4] },
        { id: "inner", roomA: "entry", roomB: "hall", axis: "x", center: { x: 3, y: 0, z: 0 }, size: [1.4, 2.4] },
      ],
    };
    const group = buildInstanceObject3D(model, {});
    // the way out is signed; a door between two rooms is not
    expect(group.getObjectByName("doorway:out:sign")).toBeTruthy();
    expect(group.getObjectByName("doorway:inner:sign")).toBeFalsy();
    // and it hangs above the opening, not in it
    expect(group.getObjectByName("doorway:out:sign").position.y).toBeGreaterThan(2.4);
  });

  it("letters the sign when there is a painter for it", () => {
    const { painter, materials } = make();
    buildInstanceObject3D(
      {
        instanceId: "f1",
        rooms: [], walls: [], zones: [], blocks: [], objects: [], items: [], npcs: [], groundY: 0,
        portals: [{ id: "out", roomA: "entry", roomB: "EXIT", axis: "z", center: { x: 0, y: 0, z: -4 }, size: [1.6, 2.4] }],
      },
      { materials }
    );
    expect(painter.asked.some((a) => a.kind === "sign" && a.opts.text === "EXIT")).toBe(true);
  });
});
