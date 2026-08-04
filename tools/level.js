#!/usr/bin/env node
// The level toolkit. One command per thing you can build, JSON on stdout (or to --out).
//
//   node tools/level.js city     --id ashgate --theme city --lots 3 --floors 2,1,3
//   node tools/level.js city     --spec ashgate.spec.json --out city.json
//   node tools/level.js street   --id ashgate --theme city --size large
//   node tools/level.js building --id ashgate-b1 --theme city --floors 3 --program office
//   node tools/level.js house    --id cottage --theme city
//   node tools/level.js validate --in city.json
//   node tools/level.js map      --in city.json
//   node tools/level.js save     --in city.json --name ashgate
//   node tools/level.js load     --name ashgate --out city.json
//
// Every command is deterministic: the same flags produce the same level, byte for byte.

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs, asInt, asIntList } from "./src/args.js";
import { composeCity } from "./src/compose-city.js";
import { checkpointsDir, loadCheckpoint, saveCheckpoint } from "./src/checkpoints.js";
import { createStreets } from "../layers/city-planner/src/index.js";
import { createBuilding, programFits } from "../layers/building-planner/src/index.js";
import { validateLayout } from "../layers/scenario-creator/src/index.js";
import { createRegistry } from "../layers/asset-registry/src/index.js";
import { buildWorldMap, createProgress, exitState } from "../layers/map-state/src/index.js";
import { validate, SCHEMA_ID } from "../harness/schemas.js";

const USAGE = `level - build a level, or check one you already have

  city      a street, the buildings on it, and the Adventure holding them
  street    the outdoor level on its own, plus a LotPlan per front door
  building  every floor behind one door
  house     a single-floor building
  validate  prove an Adventure file: schema, geometry, and the map
  map       what an Adventure file unlocks, and what the exit is waiting for
  save      keep an Adventure file as a named checkpoint
  load      open a named checkpoint

common flags
  --id <id>          instance id (required to build)
  --theme <theme>    kit theme, e.g. city (required to build)
  --label <text>     name shown on the map overlay
  --seed <n>         same seed, same level
  --out <file>       write JSON here instead of stdout
  --in <file>        the Adventure to read (validate, map, save)

city / street
  --spec <file>                a CitySpec in JSON; flags below override what it says
  --size small|medium|large    how many blocks (2x2, 3x3, 4x4). Default medium
  --lots <n>                   how many buildings across the city
  --floors 2,1,3               floors per building, in order. A short list repeats its last value
  --accessible <0..1>          share of buildings with a front door. Default 1
  --npcs <n>                   NPCs per instance (city only). Default 2, 0 for an empty level

  Pinning one building (its name, program, height, whether it opens, where the quest sits) is a
  --spec file: "buildings": [{ "block": 0, "slot": 1, "label": "The Vault", "floors": 6,
  "program": "office", "quest": { "itemId": "ledger" } }]

building / house
  --floors <n>                 how many floors (building only; a house is always 1)
  --program house|apartments|office|shop
  --width <m> --depth <m>      footprint. Default 10 x 10
  --return-to <instanceId> --return-room <roomId>
                               where the front door leads back to. Omit and it becomes an EXIT

save / load
  --name <name>                what to call the checkpoint
  --dir <path>                 where checkpoints live. Default $DUPLEXITY_CHECKPOINTS`;

const registry = createRegistry();
const assetQuery = (q) => registry.query(q);
const deps = { assetQuery, validateInstance: validateLayout, programFits };

function emit(args, payload) {
  const text = JSON.stringify(payload, null, 2);
  if (args.out && args.out !== true) {
    writeFileSync(args.out, `${text}\n`);
    console.log(`wrote ${args.out}`);
  } else {
    console.log(text);
  }
}

function need(args, key) {
  const value = args[key];
  if (!value || value === true) {
    console.error(`missing --${key}`);
    process.exit(2);
  }
  return value;
}

function readAdventure(args) {
  return JSON.parse(readFileSync(need(args, "in"), "utf8"));
}

const flag = (args, key) => (args[key] && args[key] !== true ? args[key] : undefined);

// A CitySpec from a file, from flags, or both: the file is the base, flags override it. Anything a
// building is pinned to (a name, a program, a height, the quest) is spec-file territory.
function citySpec(args) {
  const file = flag(args, "spec");
  const spec = file ? JSON.parse(readFileSync(file, "utf8")) : {};
  if (flag(args, "id")) spec.id = args.id;
  if (flag(args, "theme")) spec.theme = args.theme;
  if (flag(args, "label")) spec.label = args.label;
  if (flag(args, "size")) spec.sizeHint = args.size;
  if (args.lots) spec.lots = asInt(args.lots, 1);
  if (args.accessible !== undefined) spec.accessibleRatio = Number(args.accessible);
  if (args.npcs !== undefined) spec.npcs = asInt(args.npcs, 2);
  if (args.seed) spec.seed = asInt(args.seed, 0);
  const floors = asIntList(args.floors);
  if (floors?.length) spec.floorsPerLot = floors;
  spec.sizeHint ??= "medium";

  if (!spec.id || !spec.theme) {
    console.error("missing --id and --theme (or a --spec file that names them)");
    process.exit(2);
  }
  const check = validate(SCHEMA_ID.cityPlanner.citySpec, spec);
  if (!check.ok) {
    console.error(`CITY_SPEC_INVALID: ${JSON.stringify(check.errors.slice(0, 3), null, 2)}`);
    process.exit(2);
  }
  return spec;
}

// A building asked for directly still needs a LotPlan; this is that brief, from flags.
function lotFromArgs(args, floors) {
  const id = need(args, "id");
  const lot = {
    lotId: id,
    label: args.label && args.label !== true ? args.label : id,
    theme: need(args, "theme"),
    program: args.program && args.program !== true ? args.program : floors > 1 ? "apartments" : "house",
    floors,
    floorInstanceIds: Array.from({ length: floors }, (_, i) => `${id}-f${i + 1}`),
    entryRoomId: "entry",
    doorPortalId: `door-${id}`,
    footprint: {
      width: Number(args.width ?? 10),
      depth: Number(args.depth ?? 10),
    },
  };
  if (args["return-to"] && args["return-to"] !== true) {
    lot.returnInstanceId = args["return-to"];
    lot.returnRoomId = need(args, "return-room");
  }
  return lot;
}

const COMMANDS = {
  city(args) {
    const { adventure, lots, worldMap } = composeCity(citySpec(args), {
      ...deps,
      createdAt: new Date().toISOString(),
    });
    emit(args, adventure);
    console.error(
      `built ${adventure.instances.length} instance(s): 1 street, ${lots.length} building(s); ` +
        `clear ${worldMap.required.length} to open the gate`
    );
  },

  street(args) {
    const { instance, lots, report } = createStreets(citySpec(args), assetQuery, deps);
    emit(args, { instance, lots, report });
  },

  building(args) {
    const lot = lotFromArgs(args, Math.max(1, asInt(args.floors, 1)));
    emit(args, createBuilding(lot, assetQuery, deps));
  },

  house(args) {
    const lot = { ...lotFromArgs(args, 1), program: "house" };
    emit(args, createBuilding(lot, assetQuery, deps));
  },

  validate(args) {
    const adventure = readAdventure(args);
    const schema = validate(SCHEMA_ID.persistence.adventure, adventure);
    const geometry = adventure.instances.map((instance) => ({
      instanceId: instance.id,
      ...validateLayout(instance),
    }));
    let map = { ok: true };
    try {
      buildWorldMap(adventure);
    } catch (error) {
      map = { ok: false, code: error.code, detail: error.message };
    }
    const ok = schema.ok && geometry.every((g) => g.ok) && map.ok;
    emit(args, {
      ok,
      schema: { ok: schema.ok, errors: schema.errors?.slice(0, 5) ?? [] },
      map,
      geometry: geometry.map((g) => ({
        instanceId: g.instanceId,
        ok: g.ok,
        failed: g.checks.filter((c) => !c.ok),
      })),
    });
    if (!ok) process.exitCode = 1;
  },

  save(args) {
    const dir = flag(args, "dir") ?? checkpointsDir();
    const { file, id } = saveCheckpoint(readAdventure(args), need(args, "name"), { dir });
    console.log(`saved ${id} to ${file}`);
  },

  load(args) {
    const dir = flag(args, "dir") ?? checkpointsDir();
    const { adventure } = loadCheckpoint(need(args, "name"), { dir });
    emit(args, adventure);
  },

  map(args) {
    const worldMap = buildWorldMap(readAdventure(args));
    const fresh = createProgress(worldMap);
    emit(args, {
      entry: worldMap.entry,
      nodes: worldMap.nodes,
      doors: worldMap.doors,
      exits: worldMap.exits,
      required: worldMap.required,
      exitAtStart: exitState(worldMap, fresh),
    });
  },
};

const args = parseArgs(process.argv.slice(2));
const command = COMMANDS[args._[0]];
if (!command) {
  console.log(USAGE);
  process.exit(args._.length ? 2 : 0);
}
try {
  command(args);
} catch (error) {
  console.error(`${error.code ?? "ERROR"}: ${error.message}`);
  process.exit(1);
}
