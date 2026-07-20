# scenario-creator

Turn one InstanceSpec into a geometrically valid 3D layout: rooms with positions and sizes, portals
aligned on both rooms' walls, a spawn, and a satisfiable goal. This is the specialist the raw brief
centers on. Each call is sandboxed to its instance's theme.

## Entry points (see CONTRACT.md)

- `createInstance(InstanceSpec, assetQuery) -> { instance, report }`

## Phase 1 status (stub)

Returns a fixed valid three-room layout (the persistence Instance minus `npcs`, which the narrator
folds in) and runs a real geometry validator on it (no room overlap, portals reference real rooms),
so the invariant-checking half of the contract already runs. `assetQuery` is injected as a function,
never imported. The LLM room-adjacency graph plus the deterministic solver (Delaunator + MST + A*,
per 04-TECH-STACK.md) arrive at Phase 4 behind this same signature.

## Schema note

Owns `instance-spec.json` (input), `instance.json` (layout output, referencing persistence
room/portal/goal), and `validation-report.json`.

## Run the tests

`npm test`. Asserts createInstance returns a schema-valid layout and a passing report, the validator
rejects overlapping rooms, and the injected asset query drives kit selection.

## Modify safely

Swap the solver, model, validator, or kit-selection strategy inside this folder. As long as the
output stays valid against `instance.json` and the invariants hold, the narrator and runtime cannot
tell what changed.
