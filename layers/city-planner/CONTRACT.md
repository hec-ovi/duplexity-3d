# city-planner - Contract

## Purpose
Lay out ONE outdoor street level: a walkable road network, the entry point the run starts at, the exit
gate it ends at, and a front door for every lot along the road. It builds the outside only. What is
behind each door is a separate instance built by `building-planner`, and the two agree on ids, never
on coordinates.

## Inputs (params in)
- `createStreets(CitySpec, assetQuery, opts?) -> { instance, lots, report }`
  - `CitySpec`: `{ id, theme, sizeHint?, lots?, label?, seed?, exit? }`.
    schema: [schema/city-spec.json](schema/city-spec.json)
  - `assetQuery`: a handle to `asset-registry.query` (injected, never imported), used for the road and
    facade kits.
  - `opts.validateInstance?`: a handle to `scenario-creator.validateLayout` (injected). When given,
    the street is proved against it before being returned and `LAYOUT_INVALID` is thrown if it fails.
    This layer writes no second definition of "a correct map".
  - `opts.seed?`: overrides `CitySpec.seed`. Same seed and spec give the same street, always.

## Outputs (params out)
- `instance` - a persistence Instance: street rooms joined by full-wall openings, one `EXIT` portal
  carrying `lock: { rule: "all_cleared" }`, and one `LINK` portal per lot. `rules` carries
  `{ mapKind: "street", label }` so `map-state` and the map overlay can name it.
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
- Streets are packed on a uniform integer grid, so every join between two segments is a shared FULL
  wall and its opening is exactly coincident on both sides. This is what makes doorways correct.
- Every street segment is reachable from the spawn on foot.
- One portal per wall face: a lot door, a road join and the exit gate can never overlap.
- Exactly one entry (the spawn) and exactly one exit gate, and the gate is locked `all_cleared`.
- Every `LotPlan` names a door that exists in the returned instance, and no two lots share a door.
- Deterministic: no `Math.random`, no clock.

## Dependencies (contracts only)
- `asset-registry` (kit query), `scenario-creator` (the geometry validator), `persistence` (the
  Instance shape). All injected as handles; it imports no other layer's `src/`.

## How to modify this blackbox safely
The road shape lives in `src/grid.js` (a main avenue plus side streets on an integer grid). Swap it
for a denser grid, a ring road or an organic layout without touching anything else, as long as the
invariants above hold. Keep `tests/` green: grid adjacency yields aligned openings, lots get unique
doors, the gate is locked, the same seed repeats, and a spec with no room for its lots is refused.
