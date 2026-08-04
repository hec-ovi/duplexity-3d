# tools - the level toolkit

The third composition root, next to `app/` (the browser slice) and `server/` (the HTTP API). It is
the only place besides those two allowed to hold several layers at once, and it holds them behind one
command line so an agent can build levels without reading any code.

```bash
node tools/level.js city --id ashgate --theme city --lots 3 --floors 2,1,3 --out city.json
node tools/level.js validate --in city.json     # schema + geometry + map, exit code 1 if not ok
node tools/level.js map --in city.json          # what is unlocked, what the gate is waiting for
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

Everything is deterministic. The same flags produce the same level, so a seed is a level you can
share by name.

## What it wires

`city-planner` lays the street and hands out lot briefs, `building-planner` builds the floors behind
each door, `scenario-creator` proves every layout, `asset-registry` supplies the kits, and
`map-state` derives the map and the exit rule. Each of those knows only its own contract; the wiring
lives here.

`tools/compose-city.test.js` is the end-to-end proof: a generated city is schema-valid, passes the
real geometry validator, is walkable by the real runtime through a real front door, and its gate
opens only once every building is cleared.
