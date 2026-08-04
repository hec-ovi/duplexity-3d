# scenario-creator - Contract

## Purpose
Turn ONE `InstanceSpec` into a geometrically valid 3D **Instance**: rooms with positions and
sizes, portals with coordinates aligned on both rooms' walls, object and inventory placements, a
spawn point, and a satisfiable goal. This is the specialist the raw brief centers on. Each call is
sandboxed to its instance's theme and domain (its own context, its own agent).

## Inputs (params in)
- `createInstance(InstanceSpec, assetQuery, opts?) -> { instance: Instance, report: ValidationReport }`
  - `InstanceSpec` (from narrator): `{ id, theme, sizeHint, mood, goalSpec, npcRoster[], connectionHints }`.
    schema: `schema/instance-spec.json`
  - `assetQuery` is a handle to `asset-registry.query` (dependency-injected; not an internal import).
- `validateLayout(instance) -> ValidationReport` - the geometry proof on its own, for any layout from
  anywhere (a city street, a building floor, a hand-authored fixture). This layer owns what "a correct
  map" means, so every generator is held to the same bar rather than writing its own checks. It is
  robust to partial input: a missing spawn or goal is simply not checked.
  - `opts` (all optional): `graphGen(spec, seed) -> RoomGraph` is the abstract-graph generator (the
    LLM stand-in), injected the same way; it defaults to a deterministic stand-in and Phase 5/6 wires
    a grammar-constrained local model in here. `seed` (default: hash of the instance id) and
    `maxAttempts` (regenerate budget before the fallback) round it out. The `RoomGraph` the generator
    returns is topology only (rooms + roles + adjacencies + entry + goal room), never coordinates.
    schema: `schema/room-graph.json`

Precondition: the referenced asset kit(s) for the theme exist in `asset-registry`.

## Outputs (params out)
- `Instance` - `{ id, theme, rules, rooms[], portals[], spawn, goal }`: the instance subset of the
  Adventure schema owned by `persistence`, minus `npcs` (the narrator authors and folds those in
  afterward). Objects and inventories are nested inside each room (`room.objects[]` /
  `room.inventory[]`), matching the canonical Room shape. schema: `schema/instance.json`
- `ValidationReport` - `{ ok, checks[] }` proving the geometry is legal. schema: `schema/validation-report.json`

Coordinates are three.js convention: right-handed, Y-up, meters. Rooms are axis-aligned boxes.

## Internal method (documented so it can be rewritten freely)
1. The injected `graphGen` emits an ABSTRACT room-adjacency graph (rooms + which connect to which +
   rough roles), constrained by `room-graph.json` (structured output). Never raw coordinates.
2. A deterministic solver packs the rooms onto a uniform integer GRID so every adjacency becomes a
   shared full wall face, then places a portal (doorway) on each shared face. Grid packing makes the
   portal-plane coincidence exact (float-positioned rooms make it fragile), so no-overlap and
   portal-alignment hold by construction. It repairs connectivity with a union-find pass and adds an
   EXIT on an outer wall for `reach_exit` goals.
3. Validate (below). On failure, regenerate the graph (new seed) or re-solve, up to `maxAttempts`; a
   grammar-guaranteed straight-chain fallback then guarantees creation never hard-fails on geometry.
4. Select concrete kit pieces from `asset-registry` for floors/walls/props; place the goal item or
   exit; set the spawn (entry room centre, facing its first doorway).

The organic Delaunay + separation-steering + MST layout (04-TECH-STACK.md) is a later drop-in behind
this same `RoomGraph -> Instance` seam; the grid solver is the valid-by-construction Phase 4 choice.

## Errors
- `LAYOUT_INVALID` - could not produce a valid geometry, fallback included (does not occur in Phase 4:
  the grid fallback always validates).
- `NO_ASSET_FOR_KIND` - the theme lacks a required kit piece (floor or wall) in the registry.
- `GOAL_UNSATISFIABLE` - reserved: goal reachability is guaranteed by construction, so an unreachable
  goal is regenerated rather than returned.

## Invariants this layer will never break
- No two rooms overlap.
- Every room is reachable from `spawn` through portals (full connectivity).
- Every portal is aligned on a wall of BOTH rooms it connects and is walkable (no blocking prop). A
  one-sided portal (`roomB` is `"EXIT"` or `"LINK"`, the latter leading to another instance) is held
  to the same alignment on the one room it has, and joins no rooms for connectivity.
- The goal is satisfiable: its target room/item/NPC location is reachable from spawn.
- On OPEN ground (a room with `blocks`, i.e. buildings standing on a street), four more hold: every
  block is inside its room, no two blocks overlap, a door carrying `blockId` sits on a face of that
  block, and every door in the spawn's room can be WALKED to. The last one is a flood fill of the open
  floor (`src/walkable.js`), because open ground has no portal graph to reason over: a building parked
  across the only approach is invisible to every other check.
- Output validates against `instance.json`; an invalid layout is never returned.

## Dependencies (contracts only)
- `asset-registry` (query for pieces), `providers/text` (the graph LLM). Never touches runtime,
  narrator, or npc internals.

## How to modify this blackbox safely
Swap the solver, the model, the validator, or the kit-selection strategy inside this folder. The
narrator and runtime only see `Instance`; as long as it stays valid against `instance.json` and the
invariants hold, they cannot tell what changed. Keep `tests/` green: the geometry validator must
pass on generated instances AND reject adversarial fixtures (overlapping rooms, unaligned portals,
unreachable goal).
