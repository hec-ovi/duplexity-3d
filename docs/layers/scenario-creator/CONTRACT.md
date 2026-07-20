# scenario-creator - Contract

## Purpose
Turn ONE `InstanceSpec` into a geometrically valid 3D **Instance**: rooms with positions and
sizes, portals with coordinates aligned on both rooms' walls, object and inventory placements, a
spawn point, and a satisfiable goal. This is the specialist the raw brief centers on. Each call is
sandboxed to its instance's theme and domain (its own context, its own agent).

## Inputs (params in)
- `createInstance(InstanceSpec, assetQuery) -> Instance`
  - `InstanceSpec` (from narrator): `{ id, theme, sizeHint, mood, goalSpec, npcRoster[], connectionHints }`.
    schema: `schema/instance-spec.json`
  - `assetQuery` is a handle to `asset-registry.query` (dependency-injected; not an internal import).

Precondition: the referenced asset kit(s) for the theme exist in `asset-registry`.

## Outputs (params out)
- `Instance` - `{ id, theme, rules, rooms[], portals[], objects[], spawn, goal }` (the instance
  subset of the Adventure schema, owned by `persistence`). schema: `schema/instance.json`
- `ValidationReport` - `{ ok, checks[] }` proving the geometry is legal. schema: `schema/validation-report.json`

Coordinates are three.js convention: right-handed, Y-up, meters. Rooms are axis-aligned boxes.

## Internal method (documented so it can be rewritten freely)
1. LLM emits an ABSTRACT room-adjacency graph (rooms + which connect to which + rough roles),
   constrained by schema (structured output). Never raw coordinates from the model.
2. A deterministic solver assigns positions/sizes and places portals so walls align and nothing
   overlaps.
3. Validate (below). On failure, regenerate the graph or re-solve, up to N attempts.
4. Select concrete kit pieces from `asset-registry` for floors/walls/doors/props; place objects and
   inventories; set the spawn and the goal target.

## Errors
- `LAYOUT_INVALID` - could not produce a valid geometry within N attempts.
- `NO_ASSET_FOR_KIND` - the theme lacks a required kit piece in the registry.
- `GOAL_UNSATISFIABLE` - the chosen goal target is not reachable in the laid-out graph.

## Invariants this layer will never break
- No two rooms overlap.
- Every room is reachable from `spawn` through portals (full connectivity).
- Every portal is aligned on a wall of BOTH rooms it connects and is walkable (no blocking prop).
- The goal is satisfiable: its target room/item/NPC location is reachable from spawn.
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
