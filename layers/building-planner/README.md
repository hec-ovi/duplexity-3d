# building-planner

Builds what is behind a front door: floors, rooms, doors between them, a stairwell, and a way back
out. A house is the same thing with one floor.

```js
import { createBuilding } from "./src/index.js";

const { instances } = createBuilding(lotPlan, assetQuery, { validateInstance });
// instances[0] is the ground floor, and its id is the one the street door links to
```

## Floors are separate levels

Crossing a door moves play to another instance, so a floor never has to line up with the street or
with the floor below: it is its own coordinate space, laid out like a blueprint. The building and the
street agree on names only (which ids the floors use, which room the front door opens into, where the
way out goes back to), all carried in the LotPlan.

The stairwell sits in the same corner on every floor, and each flight lands you in the other floor's
stairwell, so walking up and back down returns you where you started.

## Room mixes

| program | rooms |
| --- | --- |
| `house` | 2 x 2 |
| `apartments` | 2 x 2 |
| `office` | 3 x 2 |
| `shop` | 2 x 1 |

Each floor gets one thing to find, in the room furthest from where you come in, unless the caller
sets its win condition with `goalFor`.

## Modifying it

See [CONTRACT.md](CONTRACT.md). Room mixes are `PROGRAMS` in `src/index.js`; the partition is
`src/floor.js`. Run this layer's tests with `npx vitest run layers/building-planner`.
