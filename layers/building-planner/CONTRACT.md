# building-planner - Contract

## Purpose
Build what is behind one front door: a building's floors, one instance each, joined by a stairwell,
with a way back out to the street. A house is this with a single floor. Each floor is its own
coordinate space, laid out like a blueprint, so nothing here has to line up with the street outside.

## Inputs (params in)
- `createBuilding(LotPlan, assetQuery, opts?) -> { instances, report }`
  - `LotPlan`: the brief from `city-planner` (schema owned there: `lot-plan.json`). It fixes the
    instance id of every floor, the room the front door opens into, where the way out leads back to,
    the footprint, the floor count and the program.
  - `assetQuery`: a handle to `asset-registry.query` (injected, never imported).
  - `opts.validateInstance?`: a handle to `scenario-creator.validateLayout` (injected). Every floor is
    proved against it before return; a failure raises `LAYOUT_INVALID`.
  - `opts.goalFor?(floorIndex, floorInstanceId) -> Goal`: override the default win condition of a
    floor. The default puts one item in the far room and asks for it, which is always satisfiable.

## Outputs (params out)
- `instances` - one persistence Instance per floor, ground floor first, ids exactly
  `LotPlan.floorInstanceIds`. Each carries `rules { mapKind, label, floor }`.
  schema: owned by `persistence` (`instance.json`).
- `report` - the `ValidationReport` for the whole building (the checks of every floor, merged).
  schema: owned by `scenario-creator`.

## What it promises the street
- The ground floor contains a room named `LotPlan.entryRoomId`, so the street door has somewhere to
  open into.
- The ground floor has a `leave` door back to `LotPlan.returnInstanceId` / `returnRoomId`. A lot with
  no return named stands on its own, and the same door becomes a plain `EXIT`.
- Floor n and floor n+1 are joined by a `stairs_up` / `stairs_down` pair, each on its own wall face.

## Errors
- `NO_ASSET_FOR_KIND` - the theme has no floor or wall kit in the registry.
- `LOT_PLAN_INVALID` - the brief cannot be built (no floors, or a footprint too small for its program).
- `LAYOUT_INVALID` - a floor failed the injected geometry validator (a bug here; never returned).

## Invariants this layer will never break
- Rooms on a floor are packed on a uniform grid inside the footprint, so every interior door is a
  shared FULL wall with an exactly coincident opening on both sides.
- Every room on a floor is reachable from that floor's arrival room on foot.
- A door that leaves the floor (the street door, a stairwell) sits on an OUTER wall and has a face to
  itself: two of them can never land on the same wall.
- Every floor's goal is reachable within that floor: a run can never be blocked by an unwinnable one.
- Deterministic: no `Math.random`, no clock. The same LotPlan builds the same building.

## Dependencies (contracts only)
- `city-planner` (the LotPlan shape), `asset-registry` (kit query), `scenario-creator` (the geometry
  validator), `persistence` (the Instance shape). All data or injected handles; it imports no other
  layer's `src/`.

## How to modify this blackbox safely
Room mixes live in `PROGRAMS` in `src/index.js` (how many rooms a house, shop, apartments or office
floor gets); the partition is in `src/floor.js`. Change either without touching the street: the street
knows only the ids in the LotPlan. Keep `tests/` green: floors use the promised ids, the ground floor
holds the entry room and the way out, stairs pair up in both directions, and a three-floor building is
walkable end to end.
