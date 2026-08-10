# city-planner - Contract

## Purpose
Lay out ONE outdoor level: open ground with buildings standing on it, the entry point the run starts
at, the exit gate it ends at, and a front door on every building. The outdoors is not made of rooms.
It is one open floor, a lattice of building masses, and the gaps between them, which are the streets.
What is inside a building is a separate instance built by `building-planner`, and the two agree on
ids, never on coordinates.

## Inputs (params in)
- `createStreets(CitySpec, assetQuery, opts?) -> { instance, lots, report }`
  - `CitySpec`: `{ id, theme, label?, blocks?, sizeHint?, lots?, floorsPerLot?, accessibleRatio?,
    buildings?, npcs?, exit?, seed? }`. `blocks` is exactly how many city blocks to build on, and
    `sizeHint` is the shorthand for it. `floorsPerLot` sets how tall each building STANDS, in order,
    repeating its last value. `accessibleRatio` is the share of buildings with a front door: 1 by
    default, and 0 as soon as `buildings` names any, so naming the places you want makes everything
    else scenery.
    `buildings[]` pins individual premises by `{ block, slot }` (label, asset, program, floors,
    accessible, quest); the block is split into enough premises to hold the slot, and everything
    unpinned is generated around it. A pin naming an `asset` stands a whole building from one GLB
    there: see [Buildings that arrive at their own size](#buildings-that-arrive-at-their-own-size). `wet` (0 to 1) says how wet the streets are, which the renderer reads off
    `rules`; it never rains. `npcs` is read by the toolkit that populates the level, not by the layout.
    schema: [schema/city-spec.json](schema/city-spec.json)
  - `assetQuery`: a handle to `asset-registry.query` (injected, never imported), used for the road and
    facade kits.
  - `opts.validateInstance?`: a handle to `scenario-creator.validateLayout` (injected). When given,
    the street is proved against it before being returned and `LAYOUT_INVALID` is thrown if it fails.
    This layer writes no second definition of "a correct map".
  - `opts.programFits?`: a handle to `building-planner.programFits` (injected). With it, a premises is
    only given a room mix that fits inside it, and an author who pins one that does not is told so.
    Without it, every program is assumed to fit and the caller owns that.
  - `opts.assetFor?`: a handle to `asset-registry.get` (injected), used to look up a pin's `asset`.
    Without it, a spec that pins one is refused rather than quietly ignored.
  - `opts.seed?`: overrides `CitySpec.seed`. Same seed and spec give the same street, always.

## Outputs (params out)
- `instance` - a persistence Instance holding ONE `open` room (the ground), its `zones[]` (the
  roadway, and a pavement per city block), its `blocks[]` (one mass per BUILDING, several to a
  block, each carrying its `floors` and `program` so its outside can be dressed to suit), its
  `lights[]` (a lamp on each side of every block, a sign over every front door), one `LINK`
  portal per building you can enter carrying `blockId` (the door is on that mass's face), and one
  `EXIT` portal in the boundary carrying `lock: { rule: "all_cleared" }`.
  `rules` carries `{ mapKind: "street", label }` so `map-state` and the map overlay can name it.
  schema: owned by `persistence` (`instance.json`).
- `lots` - `LotPlan[]`, the brief `building-planner` builds from: one per building WITH A DOOR, so a
  sealed building appears in `blocks[]` and nowhere else.
  schema: [schema/lot-plan.json](schema/lot-plan.json)
- `report` - the `ValidationReport` from the injected validator, or a passing report when none was
  injected. schema: owned by `scenario-creator`.

## Buildings that arrive at their own size
A pin may name an `asset`: a `building` in the catalog, which is a whole building in one GLB. Then
the street is laid out around the file rather than the file being squashed into a plot.

- The mass IS the asset's `size`, and the block it stands on is cut big enough to hold it: a column
  of the lattice is as wide as its widest block and a row as deep as its deepest, so the streets stay
  straight and the ground stays square.
- The mass carries the asset's id as its `assetRef`, so the runtime knows to load the file instead of
  facing a plain mass.
- A file that brought its own front door (`doors: "own"`) is turned in quarter turns until that door
  faces the street, and the mass's `rotationY` says by how much. Its plot is cut square enough to hold
  it either way round.
- How tall it stands is the file's own height; how many storeys that reads as comes from the asset's
  `floors`, or from its height when it does not say.

## How the two sides meet (ids, not coordinates)
Crossing a door moves play to another instance, so the street and a building interior are separate
coordinate spaces: a blueprint of its own. They only have to agree on names, all carried in `LotPlan`:

| Field | Promise |
| --- | --- |
| `floorInstanceIds[]` | The building's floors, ground floor first. The street door links to `[0]`. |
| `entryRoomId` | The room the street door opens into. The ground floor must contain it. |
| `returnInstanceId` / `returnRoomId` | Where the building's way out puts the player back. |
| `footprint` / `floors` / `program` | Size, height and room mix the building should be built to. |
| `quest` | Present only where an author pinned the objective: the item to place and the floor it waits on. |

## Errors
- `NO_ASSET_FOR_KIND` - the theme has no road or facade kit in the registry.
- `LAYOUT_INVALID` - the injected validator rejected the street (a bug in this layer; never returned).
- `CITY_SPEC_INVALID` - the spec asks for something unbuildable: an unknown `sizeHint`, more
  buildings than the lattice holds, fewer than the pins need, a pin on a block or slot that does not
  exist, two pins on the same place, a quest inside a building sealed shut, or a pinned `asset` that
  is unknown, is not a building, or has no catalog to be looked up in.

## Invariants this layer will never break
- The outdoors is open. One room, marked `open`: its edge stops you and is drawn as nothing, so the
  level ends in empty space instead of a wall. There are no corridors and no doorways out here.
- City blocks stand on a lattice with a full street between any two and a street all the way round the
  outside, so the streets are connected by construction and every block fronts one on all four sides.
  A block only ever grows to hold what stands on it, and it grows by its whole column and row, so no
  street ever bends.
  A block is a pavement with one to four buildings on it, each with its own footprint, height and door;
  no two masses touch, and none leaves the ground or its pavement.
- The roadway is what no block covers. Pavement is a zone, so it is walked over, never collided with,
  and NPCs are given it as the place to be.
- Every building's door is on a face of ITS OWN mass, and you can walk to it: proved by the injected
  validator's flood fill of the open floor, not assumed.
- A building without a door has nothing behind it: no `LotPlan`, so no instance, so no node on the
  map and nothing for the exit gate to wait on. At least one building always has a door.
- Light is PLACED here, never designed here: a lamp says where it stands and what it is, and how tall
  it is, what colour it burns and how many are lit at once are the renderer's decisions.
- How tall a building STANDS and how much of it you can walk into are two different numbers: a mass
  carries its storeys, a `LotPlan` carries the floor or three behind its door. A city has a skyline;
  a run through it is a few conversations.
- The spawn stands in a street, never inside a building.
- Exactly one entry (the spawn) and exactly one exit gate, and the gate is locked `all_cleared`.
- Every `LotPlan` names a door that exists in the returned instance, and no two lots share a door.
- Deterministic: no `Math.random`, no clock.

## Dependencies (contracts only)
- `asset-registry` (kit query), `scenario-creator` (the geometry validator), `building-planner`
  (`programFits`, and the LotPlan it builds from), `persistence` (the Instance shape). All injected
  as handles; it imports no other layer's `src/`.

## How to modify this blackbox safely
Where the buildings stand, and so where the streets run, is `src/lattice.js` (block size, street
width, how a block splits into plots). What stands on each plot is `src/premises.js` (how many, how
tall, what for, which have doors, where an author's pins land): every seeded choice is made there, so
`src/index.js` stays plain assembly. Swap the lattice for a ring, a river or an organic scatter
without touching anything else, as long as the invariants above hold: the validator will tell you if
a building has sealed off a door. Keep `tests/` green: masses never touch and stay on the ground,
every lot gets its own door on its own mass, taller lots get taller masses, a sealed building has no
door and no brief, a pinned building is built as asked, the gate is locked, the same seed repeats,
and a spec asking for more than there is room for is refused.
