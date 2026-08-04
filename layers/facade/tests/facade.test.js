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
    // the sign is over the door, not on the floor above it
    expect(sign.position[1]).toBeLessThan(shop.size.h);
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
