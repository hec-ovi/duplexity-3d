# tools - the level and world toolkits

The third composition root, next to `app/` (the browser slice) and `server/` (the HTTP API). It is
the only place besides those two allowed to hold several layers at once, and it holds them behind two
command lines so an agent can build levels and worlds without reading any code.

`level.js` builds one level and prints it. `world.js` keeps a world: a folder you make once, change,
rebuild and export.

```bash
node tools/level.js city --id ashgate --theme city --lots 3 --floors 2,1,3 --out city.json
node tools/level.js city --spec ashgate.spec.json --out city.json   # pin buildings by hand
node tools/level.js validate --in city.json     # schema + geometry + map, exit code 1 if not ok
node tools/level.js map --in city.json          # what is unlocked, what the gate is waiting for
node tools/level.js save --in city.json --name ashgate     # keep a city you liked
node tools/level.js load --name ashgate --out city.json    # open it again
```

Run `node tools/level.js` with no arguments for the full flag list.

| command | builds |
| --- | --- |
| `city` | a street, every building on it, and the Adventure holding them |
| `street` | the outdoor level alone, plus a LotPlan per front door |
| `building` | every floor behind one door |
| `house` | a single-floor building (its front door is the way out) |
| `validate` | nothing: proves an Adventure file |
| `map` | nothing: reads an Adventure file's map |
| `save` / `load` | nothing: keeps an Adventure file under a name, and opens it again |

## Worlds

A world is a folder: the recipe it was asked for, the buildings it stands, the game built from it, and
the city as assets and coordinates.

```bash
node tools/world.js new ashgate --size medium --lots 4 --seed 11
node tools/world.js add ashgate --glb the-vault --door south   # a .glb, or a building you built
node tools/world.js set ashgate --at 1:0 --label "The Vault" --glb glb.the-vault
node tools/world.js build ashgate                              # rebuild from the recipe
node tools/world.js export ashgate --out dist/ashgate          # a folder you serve and play
node tools/world.js export ashgate --out share/ --data         # assets and coordinates only
```

```text
worlds/ashgate/
  spec.json      what was asked for. Edit this, rebuild, and the same world comes back
  assets/        the GLBs it stands, and the catalog entry for each
  world.json     the game: the level, the people in it, and the files it needs
  city.json      the portable city: what stands where, and which file each building is
```

A building arrives at its own size: `add` measures the GLB, and the block is cut to hold it rather
than the building being squashed into a plot. Say `--door <face>` when the file brought its own front
door, and the building is turned so that door faces the street.

Worlds go to `$DUPLEXITY_WORLDS`, or `worlds/` where you ran the command, or `--dir`.

`node tools/fetch-textures.js` (or `npm run textures`) fetches the CC0 materials the `surfaces` layer
names, into `app/public/textures`. They are not committed and nothing needs them: without them the
surfaces are painted on a canvas instead.

Everything is deterministic. The same flags produce the same level, so a seed is a level you can
share by name.

A `--spec` file is a `CitySpec` (schema: `layers/city-planner/schema/city-spec.json`); flags override
what it says. It is where a building gets pinned to a place, a name, a height, a program, a sealed
front (`accessible: false`) or the run's quest.

Checkpoints go to `$DUPLEXITY_CHECKPOINTS`, or `checkpoints/` where you ran the command, or `--dir`.
They are the portable bundle `persistence` exports, validated before they are written.

## What it wires

`city-planner` lays the street and hands out lot briefs, `building-planner` builds the floors behind
each door, `scenario-creator` proves every layout, `asset-registry` supplies the kits, and
`map-state` derives the map and the exit rule. Each of those knows only its own contract; the wiring
lives here.

`persistence` is wired in too, behind `save` / `load`.

`world.js` wires the same layers plus `glb` (measuring a file somebody else built), `city-doc` (the
portable city) and `persistence` (the game and the files it travels with).

`tools/compose-city.test.js` is the end-to-end proof: a generated city is schema-valid, passes the
real geometry validator, is walkable by the real runtime through a real front door, and its gate
opens only once every building is cleared. `tools/checkpoints.test.js` and `tools/worlds.test.js`
drive the command lines as real processes: a spec file builds the city it describes, a checkpoint
round trips unchanged, and a world rebuilds to the same thing, stands an imported building at its own
size, and exports a folder you can serve.
