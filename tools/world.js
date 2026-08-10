#!/usr/bin/env node
// The world toolkit. A world is a folder: the recipe it was asked for, the buildings it stands, the
// game built from it, and the city as assets and coordinates.
//
//   node tools/world.js new ashgate --size medium --lots 4 --seed 11
//   node tools/world.js add ashgate --glb the-vault        # a building you built, or a .glb
//   node tools/world.js set ashgate --at 1:0 --label "The Vault" --glb glb.the-vault
//   node tools/world.js build ashgate
//   node tools/world.js export ashgate --out dist/ashgate
//
// Every world is deterministic: the same recipe builds the same world, every time.

import { parseArgs, asInt, asIntList } from "./src/args.js";
import { World, worldsDir } from "./src/worlds.js";
import { exportGame } from "./src/export-game.js";

const USAGE = `world - make a world, change it, build it, export it

  new <name>       start a world and build it
  list             every world you have
  show <name>      the recipe, the buildings it stands, what was built
  set <name>       change the recipe, then build it again
  add <name>       bring a building into it: a .glb, or one the buildings toolkit built
  drop <name>      take a building out of it
  build <name>     build the world from its recipe
  export <name>    write it out: a playable folder, or just the assets and coordinates
  remove <name>    take the world away

the recipe (new, set)
  --theme <theme>       kit theme. Default city
  --label <text>        what the place is called
  --size small|medium|large   how many blocks (2x2, 3x3, 4x4). Default medium
  --blocks <n>          exactly this many blocks, whatever --size says
  --lots <n>            how many buildings across the city
  --floors 2,1,3        floors per building, in order. A short list repeats its last value
  --accessible <0..1>   share of buildings with a front door. Default 1
  --wet <0..1>          how wet the streets are. Default 0. It never rains
  --npcs <n>            how many people per place. Default 2
  --seed <n>            same seed, same world

one building (set)
  --at <block>:<slot>   which premises this is about, e.g. --at 1:0
  --glb <assetId>       stand one of this world's buildings here (see add)
  --label <text>        what it is called
  --program house|apartments|office|shop
  --floors <n>          how many floors you can walk into
  --storeys <n>         how tall it stands
  --sealed / --open     whether it has a front door
  --quest <itemId>      put the run's objective in it   [--quest-floor <n>]
  --clear               take this pin away

a building (add, drop)
  --glb <file|name>     a path to a .glb, or a building the buildings toolkit has built
  --as <id>             what to call it. Default from the file name
  --door north|south|east|west
                        which side its own front door is on. Without one, the city builds a door
  --license <text>      Default own-work
  --floors <n>          how many storeys it stands, if the file cannot say

export
  --out <dir>           where to write it. Default dist/<name>
  --data                only the assets and the coordinates: no page, no engine

everywhere
  --dir <path>          where worlds live. Default $DUPLEXITY_WORLDS, else worlds/`;

const flag = (args, key) => (args[key] && args[key] !== true ? args[key] : undefined);
const say = (payload) => console.log(JSON.stringify(payload, null, 2));

function need(args, index, what) {
  const value = args._[index];
  if (!value) {
    console.error(`name the world: world ${args._[0]} <name>`);
    process.exit(2);
  }
  return value;
}

const where = (args) => flag(args, "dir") ?? worldsDir();

/**
 * The parts of the recipe that describe the whole city. With `--at`, the flags a building also has
 * (its name, its floors) belong to that building and are left alone here.
 */
function applyCityFlags(spec, args) {
  const pinning = Boolean(flag(args, "at"));
  if (flag(args, "theme")) spec.theme = args.theme;
  if (flag(args, "label") && !pinning) spec.label = args.label;
  if (flag(args, "size")) spec.sizeHint = args.size;
  if (flag(args, "blocks")) spec.blocks = asInt(args.blocks, 1);
  if (flag(args, "lots")) spec.lots = asInt(args.lots, 1);
  if (flag(args, "accessible")) spec.accessibleRatio = Number(args.accessible);
  if (flag(args, "wet")) spec.wet = Number(args.wet);
  if (flag(args, "npcs")) spec.npcs = asInt(args.npcs, 2);
  if (flag(args, "seed")) spec.seed = asInt(args.seed, 0);
  const floors = asIntList(args.floors);
  if (floors?.length && !pinning) spec.floorsPerLot = floors;
  return spec;
}

/** One premises, pinned by where it stands. `--at 1:0` is block 1, slot 0. */
function applyPin(spec, args) {
  const at = flag(args, "at");
  if (!at) return spec;
  const [block, slot] = at.split(":").map((n) => asInt(n, NaN));
  if (!Number.isFinite(block) || !Number.isFinite(slot)) {
    console.error(`--at wants a block and a slot, like --at 1:0`);
    process.exit(2);
  }

  const pins = spec.buildings ?? [];
  const rest = pins.filter((p) => !(p.block === block && p.slot === slot));
  if (args.clear) {
    spec.buildings = rest;
    if (!spec.buildings.length) delete spec.buildings;
    return spec;
  }

  const pin = { ...(pins.find((p) => p.block === block && p.slot === slot) ?? {}), block, slot };
  if (flag(args, "label")) pin.label = args.label;
  if (flag(args, "glb")) pin.asset = args.glb;
  if (flag(args, "program")) pin.program = args.program;
  if (flag(args, "floors")) pin.floors = asInt(args.floors, 1);
  if (flag(args, "storeys")) pin.storeys = asInt(args.storeys, 1);
  if (args.sealed) pin.accessible = false;
  if (args.open) pin.accessible = true;
  if (flag(args, "quest")) {
    pin.quest = { itemId: args.quest, ...(flag(args, "quest-floor") ? { floor: asInt(args["quest-floor"], 1) } : {}) };
  }
  spec.buildings = [...rest, pin].sort((a, b) => a.block - b.block || a.slot - b.slot);
  return spec;
}

const COMMANDS = {
  new(args) {
    const name = need(args, 1);
    const world = World.create(name, applyCityFlags({ id: name, theme: "city", sizeHint: "medium" }, args), where(args));
    const { places } = world.build();
    say({ world: name, path: world.path, places, spec: world.readSpec() });
  },

  list(args) {
    const dir = where(args);
    say({ dir, worlds: World.list(dir) });
  },

  show(args) {
    say(World.open(need(args, 1), where(args)).summary());
  },

  set(args) {
    const world = World.open(need(args, 1), where(args));
    world.writeSpec(applyPin(applyCityFlags(world.readSpec(), args), args));
    const { places } = world.build();
    say({ world: world.name, places, spec: world.readSpec() });
  },

  add(args) {
    const world = World.open(need(args, 1), where(args));
    const { entry, facts } = world.addAsset(flag(args, "glb") ?? args._[2], {
      as: flag(args, "as"),
      doorFace: flag(args, "door"),
      license: flag(args, "license"),
      floors: flag(args, "floors") ? asInt(args.floors, 1) : undefined,
    });
    say({
      world: world.name,
      asset: entry.id,
      file: entry.glbUrl,
      size: entry.size,
      anchor: entry.anchor,
      doors: entry.doors,
      triangles: facts.triangles,
      stand: `world set ${world.name} --at <block>:<slot> --glb ${entry.id}`,
    });
  },

  drop(args) {
    const world = World.open(need(args, 1), where(args));
    const gone = world.removeAsset(flag(args, "glb") ?? args._[2]);
    say({ world: world.name, dropped: gone.id });
  },

  build(args) {
    const world = World.open(need(args, 1), where(args));
    const { places, city } = world.build();
    say({
      world: world.name,
      places,
      buildings: city.buildings.length,
      files: city.assets.length,
      game: world.worldPath,
      city: world.cityPath,
    });
  },

  async export(args) {
    const world = World.open(need(args, 1), where(args));
    const written = await exportGame(world, { out: flag(args, "out"), dataOnly: Boolean(args.data) });
    say(written);
  },

  remove(args) {
    const world = World.open(need(args, 1), where(args));
    world.remove();
    say({ removed: world.name });
  },
};

const args = parseArgs(process.argv.slice(2));
const command = COMMANDS[args._[0]];
if (!command) {
  console.log(USAGE);
  process.exit(args._.length ? 2 : 0);
}
try {
  await command(args);
} catch (error) {
  console.error(`${error.code ?? "ERROR"}: ${error.message}`);
  process.exit(1);
}
