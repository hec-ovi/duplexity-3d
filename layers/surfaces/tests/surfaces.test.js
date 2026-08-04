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
    font: "",
    textAlign: "",
    textBaseline: "",
    fillRect: (x, y, w, h) => calls.push({ op: "fillRect", style: ctx.fillStyle, alpha: ctx.globalAlpha, x, y, w, h }),
    fillText: (text, x, y) => calls.push({ op: "fillText", style: ctx.fillStyle, font: ctx.font, text, x, y }),
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
      const { plan, drawn } = paint(kind, { seed: "ashgate", metresWide: 12, floors: 3, text: "NOMI RAMEN" });
      const r = validate(SCHEMA_ID.surfaces.surfacePlan, plan);
      expect(r.ok, `${kind}: ${JSON.stringify(r.errors, null, 2)}`).toBe(true);
      expect(plan.metres[0]).toBeGreaterThan(0);
      expect(rects(drawn.get("albedo")).length).toBeGreaterThan(4);
    }
  });

  it("nothing is drawn over a tile edge, so a road has no seam grid", () => {
    for (const kind of SURFACE_KINDS) {
      const { plan, drawn } = paint(kind, { seed: 3, metresWide: 20, floors: 5, text: "NOMI RAMEN" });
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

  it("a window is its own thing: a frame, bars, and glass that burns only when it is lit", () => {
    const lit = paint("window", { lit: true, colour: "#ffd7a0" });
    const dark = paint("window", { lit: false });

    expect(lit.plan.material.emissiveIntensity).toBeGreaterThan(0);
    expect(dark.plan.material.emissiveIntensity).toBe(0);
    // the lit one burns the colour it was given; the dark one burns nothing
    expect(rects(lit.drawn.get("emissive"), "#ffd7a0").length).toBeGreaterThan(0);
    expect(rects(dark.drawn.get("emissive")).every((r) => r.style === PALETTE.off)).toBe(true);
    // and it covers the metres it says, which is what puts it in its hole in the wall
    expect(lit.plan.metres).toEqual([1.5, 1.35]);
  });

  it("a blind lets less light through, and hides the bars behind it", () => {
    const open = paint("window", { lit: true, colour: "#ffd7a0" });
    const shut = paint("window", { lit: true, colour: "#ffd7a0", blind: true });
    const glow = (p) => rects(p.drawn.get("emissive"), "#ffd7a0");
    expect(glow(shut)[0].alpha).toBeLessThan(glow(open)[0].alpha);
    expect(rects(shut.drawn.get("albedo"), PALETTE.blind).length).toBe(1);
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
