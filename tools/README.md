# tools - the level toolkit

The third composition root, next to `app/` (the browser slice) and `server/` (the HTTP API). It is
the only place besides those two allowed to hold several layers at once, and it holds them behind one
command line so an agent can build levels without reading any code.

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

`tools/compose-city.test.js` is the end-to-end proof: a generated city is schema-valid, passes the
real geometry validator, is walkable by the real runtime through a real front door, and its gate
opens only once every building is cleared. `tools/checkpoints.test.js` drives the command line as a
real process: a spec file builds the city it describes, and a checkpoint round trips unchanged.
