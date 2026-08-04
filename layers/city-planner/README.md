# city-planner

Builds the outside: a street you can walk, a door for every building on it, one entry and one locked
exit gate.

```js
import { createStreets } from "./src/index.js";

const { instance, lots } = createStreets(
  { id: "ashgate", theme: "city", label: "Ashgate", sizeHint: "medium", lots: 3, floorsPerLot: [2, 1, 3] },
  assetQuery,                       // asset-registry.query
  { validateInstance }              // scenario-creator.validateLayout
);
```

`instance` is a persistence Instance you can hand straight to the runtime. `lots` is one brief per
front door, which `building-planner` turns into the floors behind it.

## Why the roads are on a grid

Two segments that are neighbours on an integer grid share a full wall, so the opening between them
lands on exactly the same plane from both sides. That exactness is what the runtime needs to cut a
doorway, and it is why a street built here is correct by construction instead of correct within a
tolerance. Doors and the gate only ever go on a face with nothing behind it, so no two ever collide
and no doorway is ever cut into one room's wall and not its neighbour's.

## What it does not decide

Where the buildings' rooms go, what is inside them, who lives there, or how the map is unlocked.
It hands out briefs and gets out of the way.

## Modifying it

See [CONTRACT.md](CONTRACT.md). The road shape is `src/grid.js`; metres, door sizes and the gate live
at the top of `src/index.js`. Run this layer's tests with `npx vitest run layers/city-planner`.
