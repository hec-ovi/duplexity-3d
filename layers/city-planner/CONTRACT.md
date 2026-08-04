# city-planner - Contract

## Purpose
Lay out ONE outdoor level: open ground with buildings standing on it, the entry point the run starts
at, the exit gate it ends at, and a front door on every building. The outdoors is not made of rooms.
It is one open floor, a lattice of building masses, and the gaps between them, which are the streets.
What is inside a building is a separate instance built by `building-planner`, and the two agree on
ids, never on coordinates.

## Inputs (params in)
- `createStreets(CitySpec, assetQuery, opts?) -> { instance, lots, report }`
  - `CitySpec`: `{ id, theme, label?, sizeHint?, lots?, floorsPerLot?, npcs?, exit?, seed? }`.
    `floorsPerLot` sets how tall each building is, in order, repeating its last value. `npcs` is read
    by the toolkit that populates the level, not by the street layout.
    schema: [schema/city-spec.json](schema/city-spec.json)
  - `assetQuery`: a handle to `asset-registry.query` (injected, never imported), used for the road and
    facade kits.
  - `opts.validateInstance?`: a handle to `scenario-creator.validateLayout` (injected). When given,
    the street is proved against it before being returned and `LAYOUT_INVALID` is thrown if it fails.
    This layer writes no second definition of "a correct map".
  - `opts.seed?`: overrides `CitySpec.seed`. Same seed and spec give the same street, always.

## Outputs (params out)
- `instance` - a persistence Instance holding ONE `open` room (the ground), its `blocks[]` (the
  building masses), one `LINK` portal per building carrying `blockId` (the door is on that mass's
  face), and one `EXIT` portal in the boundary carrying `lock: { rule: "all_cleared" }`. `rules`
  carries `{ mapKind: "street", label }` so `map-state` and the map overlay can name it.
  schema: owned by `persistence` (`instance.json`).
- `lots` - `LotPlan[]`, the brief `building-planner` builds from.
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

## Errors
- `NO_ASSET_FOR_KIND` - the theme has no road or facade kit in the registry.
- `LAYOUT_INVALID` - the injected validator rejected the street (a bug in this layer; never returned).
- `CITY_SPEC_INVALID` - the spec asks for something unbuildable (no segments, or more lots than the
  road has faces to put them on).

## Invariants this layer will never break
- The outdoors is open. One room, marked `open`: its edge stops you and is drawn as nothing, so the
  level ends in empty space instead of a wall. There are no corridors and no doorways out here.
- Buildings stand on a lattice with a full street between any two of them and a street all the way
  round the outside, so the streets are connected by construction and every building fronts one on
  all four sides. No two masses touch, and none leaves the ground.
- Every building's door is on a face of ITS OWN mass, and you can walk to it: proved by the injected
  validator's flood fill of the open floor, not assumed.
- The spawn stands in a street, never inside a building.
- Exactly one entry (the spawn) and exactly one exit gate, and the gate is locked `all_cleared`.
- Every `LotPlan` names a door that exists in the returned instance, and no two lots share a door.
- Deterministic: no `Math.random`, no clock.

## Dependencies (contracts only)
- `asset-registry` (kit query), `scenario-creator` (the geometry validator), `persistence` (the
  Instance shape). All injected as handles; it imports no other layer's `src/`.

## How to modify this blackbox safely
Where the buildings stand, and so where the streets run, is `src/lattice.js` (block size, street
width, which cells are built on). Swap the lattice for a ring, a river or an organic scatter without
touching anything else, as long as the invariants above hold: the validator will tell you if a
building has sealed off a door. Keep `tests/` green: masses never touch and stay on the ground, every
lot gets its own door on its own mass, taller lots get taller masses, the gate is locked, the same
seed repeats, and a spec asking for more buildings than there are places is refused.
