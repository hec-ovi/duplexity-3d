// Composition-root test: the world toolkit driven the way an author drives it, as a real process.
// It proves what a world promises: a folder you can make, change and rebuild to the same thing, a
// building somebody else built standing in it at its own size, and an export that carries the
// assets, the coordinates and the game.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORLD = join(HERE, "world.js");
const work = mkdtempSync(join(tmpdir(), "duplexity-worlds-"));
const worlds = join(work, "worlds");
const glbFile = join(work, "the-vault.glb");

const world = (...args) =>
  JSON.parse(
    execFileSync(process.execPath, [WORLD, ...args, "--dir", worlds], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  );

const read = (...parts) => JSON.parse(readFileSync(join(worlds, ...parts), "utf8"));

// A building in a file: 26 x 60 x 22 metres, centred on its footprint and standing on the ground,
// which is how a building GLB is written. Built here byte by byte so the test owns what it measures.
function writeGlb(file, min, max) {
  const doc = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { type: "VEC3", componentType: 5126, count: 8, min, max },
      { type: "SCALAR", componentType: 5123, count: 36 },
    ],
    materials: [{ name: "facade" }],
  };
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const pad = (4 - (json.length % 4)) % 4;
  const bytes = new Uint8Array(20 + json.length + pad);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, json.length + pad, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  bytes.fill(0x20, 20 + json.length);
  writeFileSync(file, bytes);
}

beforeAll(() => {
  writeGlb(glbFile, [-13, 0, -11], [13, 60, 11]);
  world("new", "ashgate", "--label", "Ashgate", "--size", "small", "--lots", "3", "--npcs", "0", "--seed", "11");
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("the world toolkit", () => {
  it("makes a world you can list, read and rebuild to the same thing", () => {
    expect(world("list").worlds).toEqual(["ashgate"]);

    const summary = world("show", "ashgate");
    expect(summary.spec).toMatchObject({ id: "ashgate", label: "Ashgate", sizeHint: "small", seed: 11 });
    expect(summary.built.places).toBeGreaterThan(1);

    // the recipe is the world: building it again changes nothing
    const before = read("ashgate", "city.json");
    world("build", "ashgate");
    expect(read("ashgate", "city.json")).toEqual(before);
  });

  it("stands a building somebody else built, at its own size, on a block cut for it", () => {
    const added = world("add", "ashgate", "--glb", glbFile, "--door", "south", "--as", "glb.the-vault");
    expect(added).toMatchObject({ asset: "glb.the-vault", file: "assets/the-vault.glb", size: [26, 60, 22] });
    expect(added.anchor).toEqual([0, 0, 0]); // already where a city stands a building

    world("set", "ashgate", "--at", "1:0", "--label", "The Vault", "--glb", "glb.the-vault");
    const city = read("ashgate", "city.json");

    expect(city.format).toBe("duplexity-city/1");
    expect(city.assets).toHaveLength(1);
    expect(city.assets[0]).toMatchObject({ id: "glb.the-vault", file: "assets/the-vault.glb", doors: "own" });

    const vault = city.buildings.find((b) => b.label === "The Vault");
    expect(vault.asset).toBe("glb.the-vault");
    expect([vault.size[0], vault.size[2]].sort((a, b) => a - b)).toEqual([22, 26]); // never squashed
    expect(vault.size[1]).toBe(60);
    expect(vault.door).toBeTruthy(); // you can walk into the one that was named

    // and the game it plays carries the file, so it opens on a machine with only the base kits
    const game = read("ashgate", "world.json");
    expect(game.generatedAssets.map((a) => a.id)).toEqual(["glb.the-vault"]);
    expect(world("show", "ashgate").buildings).toEqual([
      { at: "1:0", label: "The Vault", asset: "glb.the-vault" },
    ]);
  });

  it("exports the assets and the coordinates on their own", () => {
    const out = join(work, "data-only");
    const written = world("export", "ashgate", "--out", out, "--data");

    expect(written.out).toBe(out);
    expect(readdirSync(out).sort()).toEqual(["assets", "city.json", "world.json"]);
    expect(readdirSync(join(out, "assets"))).toContain("the-vault.glb");
    expect(JSON.parse(readFileSync(join(out, "city.json"), "utf8")).format).toBe("duplexity-city/1");
  });

  it("exports a folder you serve and play", async () => {
    const out = join(work, "playable");
    const written = world("export", "ashgate", "--out", out);

    expect(existsSync(written.page)).toBe(true); // the page
    expect(readdirSync(join(out, "game")).some((f) => f.endsWith(".js"))).toBe(true); // the engine
    expect(existsSync(join(out, "world.json"))).toBe(true); // the world it plays
    expect(existsSync(join(out, "assets", "the-vault.glb"))).toBe(true); // the files it stands
  }, 60_000);

  it("refuses a world that is not there, a name that is not a name, and a building it cannot find", () => {
    expect(() => world("show", "never-made")).toThrowError(/NOT_FOUND/);
    expect(() => world("new", "../escape")).toThrowError(/BAD_NAME/);
    expect(() => world("new", "ashgate")).toThrowError(/EXISTS/);
    expect(() => world("add", "ashgate", "--glb", "no-such-building")).toThrowError(/NOT_FOUND/);
  });

  it("takes a world away when it is asked to", () => {
    world("new", "spare", "--size", "small", "--lots", "2", "--npcs", "0");
    expect(world("list").worlds).toContain("spare");
    world("remove", "spare");
    expect(world("list").worlds).not.toContain("spare");
  });
});
