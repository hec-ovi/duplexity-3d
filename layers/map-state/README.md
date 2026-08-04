# map-state

The rogue's ledger. Give it an Adventure and it works out the map; give it the map and a run's
progress and it answers what is open.

```js
import { buildWorldMap, createProgress, clearInstance, exitState, win } from "./src/index.js";

const map = buildWorldMap(adventure);   // nodes, doors, exits, entry: all derived
let run = createProgress(map);          // standing in the entry instance

run = clearInstance(run, map, "bldg-a-f1");
exitState(map, run);                    // { open: false, remaining: ["bldg-a-f2"], portalId: "gate-out" }

run = win(run, map, "gate-out");        // throws EXIT_LOCKED while anything is left
```

## What it does not do

It holds no geometry, runs no clock, and stores nothing. Every function is pure: hand it the same
map and progress and it answers the same way. The runtime asks it whether a door is open; the map
overlay asks it what is unlocked; nobody writes to it except by keeping the progress it returns.

## Where the map comes from

Nowhere new. A city is an Adventure whose instances are a street and the buildings on it:

| Map piece | Where it already lives in the Adventure |
| --- | --- |
| nodes | `instances[]` (with `rules.label` / `rules.mapKind` for the overlay) |
| doors | portals whose `roomB` is `"LINK"`, carrying `link.instanceId` |
| exits | portals whose `roomB` is `"EXIT"` |
| locks | `portal.lock`, e.g. `{ "rule": "all_cleared" }` on the gate |
| entry | `progression.start` |

So the map can never drift from the geometry: it is the geometry, read a second way.

## Modifying it

See [CONTRACT.md](CONTRACT.md). New lock rules go in `src/rules.js` plus the `lock.rule` enum in
`persistence/schema/portal.json`; callers keep asking `doorState` and `exitState` and need no change.
Run this layer's tests with `npx vitest run layers/map-state`.
