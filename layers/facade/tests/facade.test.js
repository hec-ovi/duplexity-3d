import { describe, it, expect } from "vitest";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { dressFacade, BuildingInvalidError } from "../src/index.js";

const shop = {
  id: "mass-ashgate-b1",
  size: { w: 10, h: 4.2, d: 8 },
  floors: 1,
  program: "shop",
  door: { face: "south", along: 0 },
};

const block = {
  id: "mass-ashgate-b2",
  size: { w: 14, h: 20.2, d: 12 },
  floors: 6,
  program: "apartments",
  door: { face: "east", along: 1 },
};

// Where a part actually ends up, given it is turned to face the way it says.
function world(part) {
  const [x, y, z] = part.position;
  return { x, y, z, out: [Math.sin(part.facing), Math.cos(part.facing)] };
}

describe("facade contract", () => {
  it("dresses a building and says what it is called", () => {
    const dressed = dressFacade(shop);
    const r = validate(SCHEMA_ID.facade.facadeParts, dressed);
    expect(r.ok, JSON.stringify(r.errors, null, 2)).toBe(true);
    expect(dressed.name).toMatch(/\S/);
    expect(dressed.parts.length).toBeGreaterThan(0);
  });

  it("puts the cartel and the awning on the wall the door is on, standing out of it", () => {
    const dressed = dressFacade(shop);
    const sign = dressed.parts.find((p) => p.kind === "sign");
    const awning = dressed.parts.find((p) => p.kind === "awning");

    expect(sign.text).toBe(dressed.name);
    for (const part of [sign, awning]) {
      const { z, out } = world(part);
      expect(z).toBeLessThan(-shop.size.d / 2); // outside the south wall
      expect(out[1]).toBeCloseTo(-1, 6); // and facing away from the building
    }
    // the sign clears the door and the awning under it, and never grows through either
    expect(sign.position[1]).toBeGreaterThan(awning.position[1] + awning.size[1]);
    expect(sign.position[1]).toBeGreaterThan(3.1);
  });

  it("hangs balconies on the storeys above the street, never over the shopfront", () => {
    const balconies = dressFacade(block).parts.filter((p) => p.kind === "balcony");
    expect(balconies.length).toBeGreaterThan(0);
    for (const balcony of balconies) {
      expect(balcony.position[1]).toBeGreaterThanOrEqual(20.2 / 6 - 0.001); // storey 2 and up
      expect(balcony.rail).toBeGreaterThan(0);
    }
    // a shop gets none, whatever its height
    expect(dressFacade({ ...shop, floors: 4, size: { w: 10, h: 13.8, d: 8 } }).parts.some((p) => p.kind === "balcony")).toBe(false);
  });

  it("a blade sign stands out at right angles, so it reads from up the street", () => {
    const tall = { ...block, program: "office", id: "mass-blade", floors: 5 };
    const signs = dressFacade(tall).parts.filter((p) => p.kind === "sign");
    const blade = signs.find((s) => s.orientation === "blade");
    if (!blade) return; // not every building gets one; when it does, it is a blade
    expect(blade.size[2]).toBeGreaterThan(blade.size[0]);
    expect(blade.text).toBe(dressFacade(tall).name.split(" ")[0]);
  });

  // A street where every window, balcony and door is the same one reads as a single building
  // repeated, however well it is textured.
  it("each building draws its own look, and wears it consistently", () => {
    const looks = new Set();
    const windows = new Set();
    for (let i = 0; i < 24; i++) {
      const dressed = dressFacade({ ...block, id: `mass-${i}`, seed: `mass-${i}` });
      looks.add(JSON.stringify(dressed.style));
      windows.add(dressed.style.window);
      // every window on one building is that building's window
      const worn = new Set(dressed.parts.filter((p) => p.kind === "window").map((p) => p.style));
      expect([...worn]).toEqual([dressed.style.window]);
      expect(dressed.door.style).toBe(dressed.style.door);
    }
    expect(looks.size).toBeGreaterThan(4);
    expect(windows.size).toBeGreaterThan(1);
  });

  it("a panel says something a city would say, or says nothing and is a graphic", () => {
    for (let i = 0; i < 30; i++) {
      for (const ad of dressFacade({ ...block, id: `ad-${i}`, seed: `ad-${i}`, floors: 14, size: { w: 18, h: 46, d: 16 } })
        .parts.filter((p) => p.kind === "advert")) {
        expect(Boolean(ad.text) !== Boolean(ad.graphic)).toBe(true); // words or a graphic, never both
        if (ad.text) expect(ad.text).toMatch(/^[A-Z0-9 ]+$/);
      }
    }
  });

  it("a house has no sign and a building with no door has nothing on it", () => {
    expect(dressFacade({ ...shop, program: "house" }).name).toBeNull();
    const sealed = dressFacade({ ...shop, door: undefined });
    expect(sealed.parts).toEqual([]);
  });

  it("dresses the same building the same way every time, and refuses one with no shape", () => {
    expect(dressFacade(block)).toEqual(dressFacade(block));
    expect(dressFacade({ ...block, id: "other", seed: "other" })).not.toEqual(dressFacade(block));
    expect(() => dressFacade({ id: "x", size: { w: 0, h: 3, d: 3 } })).toThrowError(BuildingInvalidError);
  });
});

describe("windows", () => {
  it("every window is its own thing, on every wall above the shopfront", () => {
    const dressed = dressFacade(block); // 6 storeys, apartments, 14 x 12
    const windows = dressed.parts.filter((p) => p.kind === "window");
    expect(windows.length).toBeGreaterThan(20);

    const storey = block.size.h / block.floors;
    for (const win of windows) {
      expect(win.position[1]).toBeGreaterThan(storey * 0.9); // nothing at street level on a block
      expect(win.size[0]).toBeGreaterThan(0.5);
      expect(typeof win.lit).toBe("boolean");
    }
    // they face all four ways, not just the front
    expect(new Set(windows.map((w) => Math.round(w.facing * 100))).size).toBeGreaterThan(2);
  });

  it("no two buildings wear the same windows", () => {
    const lit = (id) =>
      dressFacade({ ...block, id, seed: id })
        .parts.filter((p) => p.kind === "window")
        .map((p) => (p.lit ? 1 : 0))
        .join("");
    expect(lit("mass-a")).not.toBe(lit("mass-b"));
    expect(lit("mass-a")).toBe(lit("mass-a")); // and the same one is the same every time
  });

  it("a house is glazed to the ground; a shop keeps its front for the shopfront", () => {
    const house = dressFacade({ ...shop, id: "h", program: "house", floors: 2, size: { w: 10, h: 8.4, d: 8 } });
    const shopfront = dressFacade({ ...shop, id: "s", program: "shop", floors: 2, size: { w: 10, h: 8.4, d: 8 } });
    const lowest = (d) => Math.min(...d.parts.filter((p) => p.kind === "window").map((p) => p.position[1]));
    expect(lowest(house)).toBeLessThan(lowest(shopfront));
  });
});
