# facade - Contract

## Purpose
Dress one building: the small things bolted to its outside, and what the place is called. Balconies
on the storeys above the street, an awning over a shopfront, and the cartel that says whose it is.
It knows nothing about three.js, textures or the city around it: it takes a shape and returns boxes.

## Inputs (params in)
- `dressFacade(building) -> { name, shape, tiers, bands, parts, style, door }`
  - `building`: `{ id, size: { w, h, d }, floors?, storeyHeight?, program?, door?, seed? }`.
    `door` is `{ face: south|north|west|east, along }` - which wall the front door is on and how far
    it sits from the middle of it, which is where the sign and the awning go. A building with no
    door gets nothing bolted to it.
  - `seed` (or `id`) fixes every choice: the same building is dressed the same way every time.

## Outputs (params out)
- `name` - what the place is called, and what its cartel says. Null for a house, which has no sign.
- `shape` / `tiers` / `bands` - what shape it stands in. A building is a STACK of masses, not one
  extruded box: the ground tier fills its plot (that is what you walk up to) and the ones above step
  back, narrow or shoulder to one side, with a ledge where each step lands and a parapet on top. Five
  shapes, drawn from the seed.
- `style` - the look this one wears, drawn once from its seed so everything on it agrees:
  `{ window, balcony, mount, door }`. Windows are square, tall, ribbon, bay or grid; balconies slab,
  cage, French or corner; a sign hangs on the fascia, out on a blade, clear of the wall on a frame or
  on the parapet; a front door is a shopfront, flush, recessed, double or a roller shutter. A street
  where every part is the same part reads as one building repeated.
- `door` - `{ style, colour }` for whoever builds the front door, or null on a building with no way
  in. The facade chooses it, because a door is part of a building's look.
- `parts[]` - `window`, `balcony`, `awning`, `neon`, `advert` and `sign`, each a box in the BUILDING'S
  OWN frame: origin in the middle of its footprint, on the ground. `size` is `[across the wall, up,
  out from the wall]` and `facing` is the turn that points it out of the wall it is on. A renderer
  adds the building's position, turns each part, and is done. An `advert` carries either a trade
  written across it or a `graphic` and no words at all, since a made-up name five storeys tall reads
  as nonsense; a `figure` graphic is `holo`, projected into the air in front of its panel.
  schema: [schema/facade-parts.json](schema/facade-parts.json)

## Errors
- `BUILDING_INVALID` - no footprint to dress.

## Invariants this layer will never break
- Deterministic: no `Math.random`, no clock.
- Nothing is hung over a shopfront: balconies and windows start at the first storey above the street,
  except on a house, which is glazed all the way down.
- Every window is its OWN part, with its own light on or off, its own colour and its own blind. A wall
  of windows is a wall of separate things, never one sheet with rectangles painted on it.
- A part always stands clear of the wall it is on, on the outside, and faces away from the building.
- A flat sign is wide across the wall and thin through it; a blade sign is the other way round, so it
  reads from up the street rather than only from in front of it.
- Nothing is imported but its own `src/`: no three.js, no DOM, no other layer.

## Dependencies (contracts only)
None. It is a leaf: give it a shape and it dresses it.

## How to modify this blackbox safely
One file per thing. `src/parts.js` is the geometry of a window, a balcony, an awning and a cartel,
one function each; `src/styles.js` is which of them a building wears; `src/naming.js` is what places
are called; `src/adverts.js` is what the panels say; `src/index.js` decides which building gets what.
The shapes a building can stand in are `src/massing.js`. Add a part by adding a function to
`src/parts.js`, a `kind` to the schema, and a branch in the renderer that builds it
(`layers/runtime/src/facade-parts.js`). Keep `tests/` green: parts stand outside the wall
they are on and face away from it, a shop is not given balconies, a house has no sign, a building
with no door gets nothing, and the same building is dressed the same way twice.
