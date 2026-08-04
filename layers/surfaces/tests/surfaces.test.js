import { describe, it, expect } from "vitest";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { paintSurface, SURFACE_KINDS, NoCanvasError, UnknownSurfaceError } from "../src/index.js";
import { PALETTE } from "../src/palette.js";

// A drawing context that only remembers what it was asked to draw. This is the whole point of the
// injected canvas factory: the layer is provable without a browser, a canvas or a GPU.
function recorder(width, height) {
  const calls = [];
  const ctx = {
    width,
    height,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    fillRect: (x, y, w, h) => calls.push({ op: "fillRect", style: ctx.fillStyle, alpha: ctx.globalAlpha, x, y, w, h }),
    beginPath: () => calls.push({ op: "beginPath" }),
    moveTo: (x, y) => calls.push({ op: "moveTo", x, y }),
    lineTo: (x, y) => calls.push({ op: "lineTo", x, y }),
    stroke: () => calls.push({ op: "stroke", style: ctx.strokeStyle }),
  };
  return { ctx, calls };
}

function paint(kind, opts) {
  const drawn = new Map();
  const ctxFor = (map, w, h) => {
    const rec = recorder(w, h);
    drawn.set(map, rec);
    return rec.ctx;
  };
  const plan = paintSurface(kind, ctxFor, opts);
  return { plan, drawn };
}

const rects = (rec, style) => rec.calls.filter((c) => c.op === "fillRect" && (!style || c.style === style));
const key = (r) => `${r.x}:${r.y}:${r.w}:${r.h}`;

describe("surfaces contract", () => {
  it("paints every kind, and says how much world one tile covers", () => {
    for (const kind of SURFACE_KINDS) {
      const { plan, drawn } = paint(kind, { seed: "ashgate", metresWide: 12, floors: 3 });
      const r = validate(SCHEMA_ID.surfaces.surfacePlan, plan);
      expect(r.ok, `${kind}: ${JSON.stringify(r.errors, null, 2)}`).toBe(true);
      expect(plan.metres[0]).toBeGreaterThan(0);
      expect(rects(drawn.get("albedo")).length).toBeGreaterThan(10);
    }
  });

  it("nothing is drawn over a tile edge, so a road has no seam grid", () => {
    for (const kind of SURFACE_KINDS) {
      const { plan, drawn } = paint(kind, { seed: 3, metresWide: 20, floors: 5 });
      const [width, height] = plan.pixels;
      for (const [name, rec] of drawn) {
        for (const r of rects(rec)) {
          const inside = r.x >= 0 && r.y >= 0 && r.x + r.w <= width + 0.001 && r.y + r.h <= height + 0.001;
          expect(inside, `${kind}/${name} drew ${key(r)} outside ${width}x${height}`).toBe(true);
        }
      }
    }
  });

  it("the same seed paints the same surface, and a different one does not", () => {
    const once = paint("road", { seed: "ashgate" });
    const again = paint("road", { seed: "ashgate" });
    const other = paint("road", { seed: "brightwater" });
    expect(again.drawn.get("albedo").calls).toEqual(once.drawn.get("albedo").calls);
    expect(other.drawn.get("albedo").calls).not.toEqual(once.drawn.get("albedo").calls);
  });

  it("a facade is a sheet of storeys: one row of bays each, and it covers the building it is for", () => {
    const { plan } = paint("facade", { seed: "mass-1", metresWide: 15, floors: 6, program: "office" });
    // 5 bays of 3m across, 6 storeys of 3.2m up
    expect(plan.metres[0]).toBeCloseTo(15, 5);
    expect(plan.metres[1]).toBeCloseTo(19.2, 5);
    expect(plan.pixels).toEqual([360, 432]);
  });

  it("every window that glows is a window that is there", () => {
    const { plan, drawn } = paint("facade", { seed: "mass-2", metresWide: 12, floors: 5, litRatio: 0.6 });
    const glass = new Set(rects(drawn.get("albedo"), PALETTE.facade.glass).map(key));
    const lit = rects(drawn.get("emissive")).filter((r) => PALETTE.windows.includes(r.style));

    expect(lit.length).toBe(plan.lit);
    expect(plan.lit).toBeGreaterThan(0);
    for (const r of lit) expect(glass.has(key(r)), `lit ${key(r)} is not a window`).toBe(true);
  });

  it("a shop is glazed along the ground floor; a house has windows there like any other storey", () => {
    const opts = { seed: "mass-3", metresWide: 12, floors: 2 };
    const shop = paint("facade", { ...opts, program: "shop" });
    const house = paint("facade", { ...opts, program: "house" });

    const widest = (p) => Math.max(...rects(p.drawn.get("albedo"), PALETTE.facade.glass).map((r) => r.w));
    const bays = shop.plan.pixels[0] / 72;
    const bayW = shop.plan.pixels[0] / bays;
    expect(widest(shop)).toBeCloseTo(bayW * 0.8, 5); // a shopfront pane
    expect(widest(house)).toBeCloseTo(bayW * 0.4, 5); // a window
    // and the shopfront is at the bottom of the sheet, where the ground floor is
    const bottom = shop.plan.pixels[1] / 2;
    expect(rects(shop.drawn.get("albedo"), PALETTE.facade.shopfront)[0].y).toBeCloseTo(bottom, 5);
  });

  it("a wet road goes darker, smoother, and holds standing water", () => {
    const dry = paint("road", { seed: "ashgate" });
    const wet = paint("road", { seed: "ashgate", wet: 0.8 });

    expect(wet.plan.material.roughness).toBeLessThan(dry.plan.material.roughness);
    expect(wet.plan.material.metalness).toBeGreaterThan(dry.plan.material.metalness);
    const puddles = (p) => rects(p.drawn.get("albedo"), PALETTE.road.puddle).length;
    expect(puddles(wet)).toBeGreaterThan(0);
    expect(puddles(dry)).toBe(0);
    // and only the road gets wet: a pavement is a pavement
    expect(paint("pavement", { seed: "x", wet: 1 }).plan.material.roughness).toBeCloseTo(
      paint("pavement", { seed: "x" }).plan.material.roughness,
      6
    );
  });

  it("refuses a surface it does not know, and a canvas it cannot draw on", () => {
    expect(() => paintSurface("marble", () => recorder(4, 4).ctx)).toThrowError(UnknownSurfaceError);
    expect(() => paintSurface("road", () => null)).toThrowError(NoCanvasError);
    expect(() => paintSurface("road", () => ({}))).toThrowError(NoCanvasError);
  });
});
