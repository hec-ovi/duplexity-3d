# city-planner - Contract

## Purpose
Lay out ONE outdoor level: open ground with buildings standing on it, the entry point the run starts
at, the exit gate it ends at, and a front door on every building. The outdoors is not made of rooms.
It is one open floor, a lattice of building masses, and the gaps between them, which are the streets.
What is inside a building is a separate instance built by `building-planner`, and the two agree on
ids, never on coordinates.

## Inputs (params in)
- `createStreets(CitySpec, assetQuery, opts?) -> { instance, lots, report }`
  - `CitySpec`: `{ id, theme, label?, blocks?, sizeHint?, lots?, places?, floorsPerLot?,
    accessibleRatio?, buildings?, npcs?, exit?, seed? }`. `blocks` is exactly how many city blocks to
    build on, and `sizeHint` is the shorthand for it. `lots` is how many buildings STAND; `places` is
    how many of those you can walk into, 6 by default, spread as far apart as the city allows and one
    per block until the blocks run out. `accessibleRatio` picks places as a share of the buildings at
    random instead, and naming `buildings[]` makes exactly those the places. `floorsPerLot` sets how
    tall each building STANDS, in order, repeating its last value.
    `buildings[]` pins individual premises by `{ block, slot }` (label, program, floors, accessible,
    quest); the block is split into enough premises to hold the slot, and everything unpinned is
    generated around it. `wet` (0 to 1) says how wet the streets are, which the renderer reads off
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
  - `opts.seed?`: overrides `CitySpec.seed`. Same seed and spec give the same street, always.

## Outputs (params out)
- `instance` - a persistence Instance holding ONE `open` room (the ground), its `zones[]` (the
  roadway, and a pavement per city block), its `blocks[]` (one mass per BUILDING, several to a
  block, each carrying its `floors` and `program` so its outside can be dressed to suit), its
  `lights[]` (four lamps round every block, all of one kind so a street reads as a street, a bracket
  on some building faces, and a sign over every front door), one `LINK`
  portal per building you can enter carrying `blockId` (the door is on that mass's face), and one
  `EXIT` portal in the boundary carrying `lock: { rule: "all_cleared" }`.
  and its `skyline[]` (a ring of towers past the boundary, leaning in as they rise, plus a handful of
  MEGASTRUCTURES three to six times anything on the ground, spaced so one is in view from anywhere).
  `rules` carries `{ mapKind: "street", label }` so `map-state` and the map overlay can name it.
  schema: owned by `persistence` (`instance.json`).
- `lots` - `LotPlan[]`, the brief `building-planner` builds from: one per building WITH A DOOR, so a
  sealed building appears in `blocks[]` and nowhere else.
  schema: [schema/lot-plan.json](schema/lot-plan.json)
- `report` - the `ValidationReport` from the injected validator, or a passing report when none was
  injected. schema: owned by `scenario-creator`.

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
  exist, two pins on the same place, or a quest inside a building sealed shut.

## Invariants this layer will never break
- The outdoors is open. One room, marked `open`: its edge stops you and is drawn as nothing, so the
  level ends in empty space instead of a wall. There are no corridors and no doorways out here.
- City blocks stand on a lattice with a full street between any two and a street all the way round the
  outside, so the streets are connected by construction and every block fronts one on all four sides.
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
