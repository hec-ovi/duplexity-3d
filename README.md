# duplexity-3d

A 3D, LLM-driven adventure engine, and a level toolkit an agent can drive. It generates small
explorable worlds (streets, buildings, floors, dungeons), fills them with NPCs you can talk to, and
locks the way out until you have cleared the map.

Every subsystem is an isolated blackbox with its own contract, so the codebase can grow without one
change rippling into the rest.

## What it does

- **Generates levels.** One command builds a street, the buildings on it, the floors behind each door,
  and a cast to live in them. Deterministic: the same flags build the same level.
- **Proves the geometry.** No overlapping rooms, every room reachable on foot, every doorway aligned on
  both sides, and a goal you can actually reach. A layout that fails is regenerated, never shipped.
- **Runs a roguelike map.** Doors lead between instances, each instance has a goal, and the exit gate
  opens only once every required one is cleared.
- **Thinks only when spoken to.** NPCs run deterministic modes in the browser (idle, patrol, follow,
  guard, flee, attack); talking to one resolves a single model call, re-validated against what that NPC
  is allowed to do before it applies.
- **Speaks.** NPC lines are voiced by Fish Audio through the backend, so the key never reaches the
  browser. With no key, lines come back as text and play carries on.
- **Stands buildings other tools made.** A GLB is measured on the way in and the block is cut to hold
  it, so it stands at its real size. The rest of the city is still generated around it.
- **Travels.** A world exports as a folder you serve and play, or as `city.json` plus its GLBs: which
  files the city uses and where everything stands, for any engine.

## Keep a world

```bash
npm install
node tools/world.js new ashgate --size medium --lots 4 --seed 11
node tools/world.js add ashgate --glb the-vault --door south     # a .glb, or a building you built
node tools/world.js set ashgate --at 1:0 --label "The Vault" --glb glb.the-vault
node tools/world.js export ashgate --out dist/ashgate            # a folder you serve and play
```

A world is a folder: `spec.json` is what was asked for, `assets/` the buildings it stands,
`world.json` the game, `city.json` the city as assets and coordinates. Edit the recipe and rebuild;
the same recipe always gives the same city back.

## Build a level

```bash
npm install
node tools/level.js city --id ashgate --theme city --lots 3 --floors 2,1,3 --out city.json
node tools/level.js validate --in city.json    # schema, geometry, and the map. Exit 1 if broken
node tools/level.js map --in city.json         # what is unlocked, what the gate is waiting for
node tools/level.js save --in city.json --name ashgate   # keep a city you liked, and load it later
npm run textures                               # optional: fetch the CC0 materials (see below)
```

Flags shape a whole city. To choose one building in it, pass a `CitySpec` file with `--spec`: it pins
a premises to a block, gives it a name, a program, a height, a sealed front (a building with no way
in) or the run's quest, and everything else is generated around it.

`node tools/level.js` on its own lists every command and flag. [SKILL.md](SKILL.md) is the same thing
written for an agent, and installs as a skill or a plugin.

## Materials

The city paints its own surfaces on a canvas, so it runs with nothing downloaded. `npm run textures`
fetches photographed materials for the road, the pavement, interior floors, walls and ceilings from
[Poly Haven](https://polyhaven.com), all CC0 (public domain), into `app/public/textures`. The files
are not committed; the catalogue that names them is (`layers/surfaces/materials/manifest.json`).

## Run it

```bash
npm run dev              # walk the world in the browser (three.js, WASD and mouse, E to talk)
node server/index.js     # the API: POST /adventure, POST /interaction, POST /speech, export/import
npm test                 # every schema, every layer's contract tests, both composition roots
npm run schemas          # compile the schemas and check cross-references on their own
```

For speech, copy `.env.example` to `.env`, fill in `FISH_API_KEY`, and start the server with
`node --env-file=.env server/index.js`.

## How it is built

One rule carries the whole codebase: **a layer may depend only on another layer's `CONTRACT.md` and
`schema/`, never its `src/`.** Cross-layer calls arrive as injected handles, and every wire format has a
JSON Schema. Swap what is inside a box and nothing outside it can tell.

Start at [`docs/INDEX.md`](docs/INDEX.md): it maps "the thing you want to change" to the one folder to
open.

| Folder | What it holds |
| --- | --- |
| [`layers/`](layers/) | The isolated blackboxes, each with `CONTRACT.md`, `README.md`, `schema/`, `src/`, `tests/`, `fixtures/` |
| [`app/`](app/) | Composition root: wires the browser slice |
| [`server/`](server/) | Composition root: wires the HTTP API over one shared store |
| [`tools/`](tools/) | Composition root: wires the level generators and the world folders behind two command lines |
| [`harness/`](harness/) | Shared test tooling: the schema loader and the isolation checker |
| [`docs/`](docs/) | The vision, the architecture, the contract convention, the milestones |

## Design docs

- [`docs/00-RAW-IDEA.md`](docs/00-RAW-IDEA.md) - the original vision, in plain words.
- [`docs/01-INTERPRETATION.md`](docs/01-INTERPRETATION.md) - how that vision reads as a system.
- [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md) - the layers and how they connect.
- [`docs/03-MILESTONES.md`](docs/03-MILESTONES.md) - phases, in build order.
- [`docs/04-TECH-STACK.md`](docs/04-TECH-STACK.md) - the researched 2026 tooling.
- [`docs/CONTRACT-CONVENTION.md`](docs/CONTRACT-CONVENTION.md) - the isolation rule every layer obeys.
- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) - what was asked for, in the words it was asked in.

## Frontend and backend, split

Frontend is three.js in the browser: heavy on rendering, light on logic. Backend is local LLMs on AMD
(Strix Halo, GGUF) plus optional local ComfyUI for asset generation, with hosted providers behind the
same adapters. Every backend subsystem is a blackbox behind a JSON contract.
