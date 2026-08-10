# city-planner

Builds the outside: open ground, buildings standing on it, a door on each one, an entry and a locked
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

## Why there are no rooms out here

Indoors is rooms and doorways. Outdoors is not: it is one open floor with solid masses on it, and the
gaps between the masses are the streets. So the level has no corridors, nothing to squeeze through,
and its edge is a limit that stops you while being drawn as nothing, which is why the city ends in
empty space rather than in a wall.

Buildings sit on a lattice with a full street between any two of them and a street all the way round
the outside. That makes the streets connected by construction and gives every building four frontages.
A building's height comes from how many floors it holds, so a tall one reads as tall from the street
before you go in.

## A building that arrives at its own size

A pin can name an `asset`: a whole building in one GLB. Then the block is cut big enough to hold that
file and the streets are laid around it, rather than the building being squashed into a plot. A file
that brought its own front door is turned in quarter turns until that door faces the street.

## What it does not decide

What is inside a building, who lives there, or how the map is unlocked. It hands out briefs and gets
out of the way. It also does not decide whether the layout is legal: the injected validator walks the
open floor and refuses a level where a building has been parked across the only way to a door.

## Modifying it

See [CONTRACT.md](CONTRACT.md). Block size, street width, how a block grows for what stands on it and
which cells get built on are in `src/lattice.js`; what stands on each plot is `src/premises.js`; door
and gate sizes are at the top of `src/index.js`. Run this layer's tests with
`npx vitest run layers/city-planner`.
