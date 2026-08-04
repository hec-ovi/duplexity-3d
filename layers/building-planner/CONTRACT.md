# building-planner - Contract

## Purpose
Build what is behind one front door: a building's floors, one instance each, joined by a stairwell,
with a way back out to the street. A house is this with a single floor. Each floor is its own
coordinate space, laid out like a blueprint, so nothing here has to line up with the street outside.

## Inputs (params in)
- `createBuilding(LotPlan, assetQuery, opts?) -> { instances, report }`
  - `LotPlan`: the brief from `city-planner` (schema owned there: `lot-plan.json`). It fixes the
    instance id of every floor, the room the front door opens into, where the way out leads back to,
    the footprint, the floor count and the program. Its optional `quest { itemId, floor? }` puts the
    run's objective here: the named item is placed on that floor (the top one by default) and finding
    it is that floor's goal, while every other floor keeps its own token.
  - `assetQuery`: a handle to `asset-registry.query` (injected, never imported).
  - `opts.validateInstance?`: a handle to `scenario-creator.validateLayout` (injected). Every floor is
    proved against it before return; a failure raises `LAYOUT_INVALID`.
  - `opts.goalFor?(floorIndex, floorInstanceId) -> Goal`: override the win condition of a floor.
    Return nothing for a floor to leave it alone. The default puts one item in the far room and asks
    for it, which is always satisfiable; a goal you name is yours to make satisfiable.
- `programFits(program, { width, depth }) -> boolean` - can that room mix be laid out in that
  footprint? The street asks before it hands out a brief, so the answer lives next to the room mixes
  it depends on and is never written twice.

## Outputs (params out)
- `instances` - one persistence Instance per floor, ground floor first, ids exactly
  `LotPlan.floorInstanceIds`. Each carries `rules { mapKind, label, floor }`. Every room carries one
  `ceiling` light overhead (a room lights itself, since there is no street outside it) and a `name`
  saying what it is FOR: a house is a hall, a living room, a kitchen and a bathroom, an office is a
  reception and the rooms behind it. A floor plan should read as a place, not as four grey squares.
  schema: owned by `persistence` (`instance.json`).
- `report` - the `ValidationReport` for the whole building (the checks of every floor, merged).
  schema: owned by `scenario-creator`.

## What it promises the street
- The ground floor contains a room named `LotPlan.entryRoomId`, so the street door has somewhere to
  open into.
- The ground floor has a `leave` door back to `LotPlan.returnInstanceId` / `returnRoomId`. A lot with
  no return named stands on its own, and the same door becomes a plain `EXIT`.
- Floor n and floor n+1 are joined by a matching pair, each on its own wall face: `stairs_up` /
  `stairs_down` in a small building, `elevator_up` / `elevator_down` from four storeys up. Both work
  the same way; the name is what the sign over it and the map icon read from.

## Errors
- `NO_ASSET_FOR_KIND` - the theme has no floor or wall kit in the registry.
- `LOT_PLAN_INVALID` - the brief cannot be built (no floors, a footprint too small for its program -
  nothing narrower than 3.4m is a room - or a quest on a floor above the top of the building).
- `LAYOUT_INVALID` - a floor failed the injected geometry validator (a bug here; never returned).

## Invariants this layer will never break
- Rooms on a floor are packed on a uniform grid inside the footprint, so every interior door is a
  shared FULL wall with an exactly coincident opening on both sides.
- Every room on a floor is reachable from that floor's arrival room on foot.
- A door that leaves the floor (the street door, a stairwell) sits on an OUTER wall and has a face to
  itself: two of them can never land on the same wall.
- Every floor this layer sets a goal for is winnable on that floor: whatever must be found is placed
  there, including a pinned quest item. A run can never be blocked by an unwinnable floor.
- Deterministic: no `Math.random`, no clock. The same LotPlan builds the same building.

## Dependencies (contracts only)
- `city-planner` (the LotPlan shape), `asset-registry` (kit query), `scenario-creator` (the geometry
  validator), `persistence` (the Instance shape). All data or injected handles; it imports no other
  layer's `src/`.

## How to modify this blackbox safely
Room mixes live in `PROGRAMS` in `src/index.js`: how many rooms a house, shop, apartments or office
floor gets, and what each one is called. The partition is in `src/floor.js`. Change either without touching the street: the street
knows only the ids in the LotPlan. Keep `tests/` green: floors use the promised ids, the ground floor
holds the entry room and the way out, stairs pair up in both directions, and a three-floor building is
walkable end to end.
