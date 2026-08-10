import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { toCityDoc, fromCityDoc, CityDocInvalidError, NotAStreetError } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const street = JSON.parse(readFileSync(join(HERE, "../fixtures/street.instance.json"), "utf8"));

// Injected, never imported: the catalog is anything that answers `get`. One whole building in a
// file, and one kit piece a plain mass is faced with.
const catalog = {
  "glb.the-vault": {
    id: "glb.the-vault",
    kind: "building",
    size: [14, 48, 18],
    glbUrl: "the-vault.glb",
    anchor: [0, 0, 0],
    doors: "own",
    doorFace: "south",
    floors: 15,
    license: "CC0-1.0",
  },
  "kaykit.city.facade": { id: "kaykit.city.facade", kind: "wall", size: [2, 6, 0.3], license: "CC0-1.0" },
};
const assetFor = (id) => {
  if (!(id in catalog)) throw Object.assign(new Error("not found"), { code: "ASSET_NOT_FOUND" });
  return catalog[id];
};

describe("city-doc - a city as assets and coordinates", () => {
  it("writes what stands where, and ships only the files that ARE buildings", () => {
    const doc = toCityDoc(street, { assetFor, fileFor: (entry) => `assets/${entry.glbUrl}` });

    const r = validate(SCHEMA_ID.cityDoc.cityDoc, doc);
    expect(r.ok, JSON.stringify(r.errors, null, 2)).toBe(true);
    expect(doc.format).toBe("duplexity-city/1");
    expect(doc.units).toBe("metres");
    expect(doc.ground.size).toEqual([168, 168]);
    expect(doc.ground.wet).toBe(0.4);

    // one file, listed once, with everything a reader needs to stand it
    expect(doc.assets).toEqual([
      {
        id: "glb.the-vault",
        file: "assets/the-vault.glb",
        size: [14, 48, 18],
        anchor: [0, 0, 0],
        doors: "own",
        doorFace: "south",
        floors: 15,
        license: "CC0-1.0",
      },
    ]);

    const [vault, plain] = doc.buildings;
    expect(vault).toMatchObject({ asset: "glb.the-vault", position: [-52, 0, -52], size: [14, 48, 18] });
    expect(vault.rotationY).toBeCloseTo(Math.PI / 2);
    expect(vault.door).toMatchObject({ id: "door-ashgate-b1", axis: "z", leadsTo: { instance: "ashgate-b1-f1" } });
    // a mass merely faced with a kit piece is ours to draw: it names no file and ships none
    expect(plain.asset).toBeUndefined();
    expect(plain).toMatchObject({ size: [22, 26, 18], floors: 8, program: "apartments" });
    expect(plain.door).toBeUndefined(); // sealed: scenery

    expect(doc.exit).toMatchObject({ id: "ashgate-gate", lock: { rule: "all_cleared" } });
    expect(doc.lights.find((l) => l.kind === "sign").on).toBe("mass-ashgate-b1");
  });

  it("reads back the same city, and says which files a catalog should carry", () => {
    const doc = toCityDoc(street, { assetFor });
    const { instance, assets } = fromCityDoc(doc);

    expect(instance).toEqual(street); // nothing in the document is lost on the way round
    expect(toCityDoc(instance, { assetFor })).toEqual(doc);
    expect(assets[0]).toMatchObject({ id: "glb.the-vault", kind: "building", glbUrl: "the-vault.glb" });
    expect(validate(SCHEMA_ID.assetRegistry.assetEntry, assets[0]).ok).toBe(true);
  });

  it("without a catalog, every mass is one the reader draws from its size", () => {
    const doc = toCityDoc(street);

    expect(doc.assets).toEqual([]);
    expect(doc.buildings.every((b) => b.asset === undefined)).toBe(true);
    expect(doc.buildings[0].size).toEqual([14, 48, 18]); // still exactly where and how big it is
  });

  it("refuses a level with no open ground, and a document it cannot read", () => {
    const indoors = { ...street, rooms: [{ ...street.rooms[0], open: false }] };
    expect(() => toCityDoc(indoors)).toThrowError(NotAStreetError);

    expect(() => fromCityDoc({ format: "something-else/9", id: "x" })).toThrowError(CityDocInvalidError);
    expect(() => fromCityDoc({ format: "duplexity-city/1" })).toThrowError(CityDocInvalidError);
  });

  it("refuses to ship a file with no license", () => {
    const unlicensed = (id) => ({ ...catalog["glb.the-vault"], id, license: undefined });
    expect(() => toCityDoc(street, { assetFor: unlicensed })).toThrowError(CityDocInvalidError);
  });
});
