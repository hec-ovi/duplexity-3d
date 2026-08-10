// tools - a world is a folder.
//
//   worlds/<name>/
//     spec.json          what was asked for. Edit this, rebuild, and the same world comes back
//     assets/            the GLBs it stands, and the catalog entry for each
//     world.json         the game: the Adventure, with the files it needs listed beside it
//     city.json          the portable city: assets and coordinates, for any engine
//
// This is a COMPOSITION ROOT: it holds several layers at once (the generator, the catalog, the
// store, the city format) and wires them together. Each layer still knows only its own contract.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRegistry } from "../../layers/asset-registry/src/index.js";
import { createPersistence } from "../../layers/persistence/src/index.js";
import { toCityDoc } from "../../layers/city-doc/src/index.js";
import { validate, SCHEMA_ID } from "../../harness/schemas.js";
import { composeCity } from "./compose-city.js";
import { describeGlb, resolveGlb, slug } from "./glb-import.js";

const NAME = /^[a-z0-9][a-z0-9._-]*$/i;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Where worlds live: `DUPLEXITY_WORLDS`, or `worlds/` beside where you ran the command. */
export function worldsDir(env = process.env, cwd = process.cwd()) {
  return env.DUPLEXITY_WORLDS || join(cwd, "worlds");
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

export class World {
  constructor(name, dir = worldsDir()) {
    if (typeof name !== "string" || !NAME.test(name)) {
      throw fail("BAD_NAME", `"${name}" is not a world name: letters, digits, dot, dash, underscore`);
    }
    this.name = name;
    this.root = dir;
    this.path = join(dir, name);
  }

  get specPath() {
    return join(this.path, "spec.json");
  }
  get assetsDir() {
    return join(this.path, "assets");
  }
  get manifestPath() {
    return join(this.assetsDir, "manifest.json");
  }
  get worldPath() {
    return join(this.path, "world.json");
  }
  get cityPath() {
    return join(this.path, "city.json");
  }
  get exists() {
    return existsSync(this.specPath);
  }

  /** Every world in a folder, by name. */
  static list(dir = worldsDir()) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "spec.json")))
      .map((entry) => entry.name)
      .sort();
  }

  /** Start a world from what it should be. The spec is the recipe; everything else is built. */
  static create(name, spec = {}, dir = worldsDir()) {
    const world = new World(name, dir);
    if (world.exists) throw fail("EXISTS", `there is already a world called "${name}"`);
    mkdirSync(world.assetsDir, { recursive: true });
    world.writeSpec({ id: name, theme: "city", label: spec.label ?? name, ...spec });
    return world;
  }

  static open(name, dir = worldsDir()) {
    const world = new World(name, dir);
    if (!world.exists) throw fail("NOT_FOUND", `no world called "${name}" in ${dir}`);
    return world;
  }

  readSpec() {
    return readJson(this.specPath);
  }

  writeSpec(spec) {
    mkdirSync(this.path, { recursive: true });
    const { ok, errors } = validate(SCHEMA_ID.cityPlanner.citySpec, spec);
    if (!ok) throw fail("SPEC_INVALID", `that is not a city this toolkit can build: ${errors[0]?.message}`);
    writeJson(this.specPath, spec);
    return spec;
  }

  /** The catalog entry for every file this world stands. */
  assets() {
    return existsSync(this.manifestPath) ? readJson(this.manifestPath) : [];
  }

  /**
   * Bring a building into the world: a .glb file, or one the buildings toolkit has built. It is
   * measured on the way in, so the city is laid out around its real size.
   *
   * @param {string} what a path to a .glb, or the name of a building you have built
   * @param {object} [opts] `as` (id), `doorFace`, `license`, `floors`, `theme`
   * @returns {{ entry: object, facts: object, file: string }}
   */
  addAsset(what, opts = {}) {
    const source = resolveGlb(what, { env: opts.env ?? process.env });
    // Every building the buildings toolkit writes is called `model.glb`, so it is kept under its own
    // name here instead.
    const id = opts.as ?? `glb.${slug(source.name)}`;
    const file = `${slug(id.replace(/^glb\./, ""))}.glb`;
    mkdirSync(this.assetsDir, { recursive: true });
    copyFileSync(source.file, join(this.assetsDir, file));

    const { entry, facts } = describeGlb(join(this.assetsDir, file), {
      id,
      glbUrl: `assets/${file}`,
      theme: opts.theme ?? this.readSpec().theme,
      license: opts.license,
      doorFace: opts.doorFace,
      floors: opts.floors,
    });

    const manifest = this.assets().filter((a) => a.id !== entry.id);
    manifest.push(entry);
    manifest.sort((a, b) => a.id.localeCompare(b.id));
    writeJson(this.manifestPath, manifest);
    return { entry, facts, file: join(this.assetsDir, file) };
  }

  removeAsset(id) {
    const manifest = this.assets();
    const gone = manifest.find((a) => a.id === id);
    if (!gone) throw fail("NOT_FOUND", `this world stands nothing called "${id}"`);
    writeJson(this.manifestPath, manifest.filter((a) => a.id !== id));
    rmSync(join(this.path, gone.glbUrl), { force: true });
    return gone;
  }

  /** A catalog holding the base kits plus this world's own files. */
  registry() {
    const registry = createRegistry();
    for (const entry of this.assets()) registry.register(entry);
    return registry;
  }

  /**
   * Build the world from its recipe: the same spec always builds the same world.
   *
   * @returns {{ adventure: object, city: object, places: number }}
   */
  build({ createdAt } = {}) {
    const spec = this.readSpec();
    const registry = this.registry();
    const { adventure } = composeCity(spec, { registry, ...(createdAt ? { createdAt } : {}) });

    const assets = this.assets();
    const store = createPersistence({
      validateAdventure: (a) => validate(SCHEMA_ID.persistence.adventure, a),
    });
    const { id } = store.save(adventure, assets); // throws SCHEMA_INVALID rather than writing a broken world
    writeFileSync(this.worldPath, `${store.exportFile(id)}\n`);

    // The city as assets and coordinates: what another engine, or another tool, reads.
    const street = adventure.instances.find((instance) => instance.id === adventure.progression.start);
    const city = toCityDoc(street, { assetFor: (ref) => registry.get(ref) });
    writeJson(this.cityPath, city);

    return { adventure, city, places: adventure.instances.length };
  }

  /** The Adventure as it was last built, with the files it needs. */
  read() {
    if (!existsSync(this.worldPath)) throw fail("NOT_BUILT", `"${this.name}" has not been built yet`);
    return readJson(this.worldPath);
  }

  remove() {
    rmSync(this.path, { recursive: true, force: true });
  }

  /** What this world is, in one object: the recipe, what it stands, and what was built from it. */
  summary() {
    const spec = this.readSpec();
    const built = existsSync(this.worldPath) ? this.read().adventure : null;
    return {
      name: this.name,
      path: this.path,
      spec,
      assets: this.assets().map((a) => ({ id: a.id, file: a.glbUrl, size: a.size, doors: a.doors })),
      buildings: (spec.buildings ?? []).map((pin) => ({
        at: `${pin.block}:${pin.slot}`,
        label: pin.label,
        asset: pin.asset,
        program: pin.program,
        floors: pin.floors,
        storeys: pin.storeys,
        accessible: pin.accessible,
      })),
      built: built
        ? { places: built.instances.length, title: built.meta.title, seed: built.meta.seed }
        : null,
    };
  }
}
