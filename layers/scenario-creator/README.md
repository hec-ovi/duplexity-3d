# scenario-creator

Turn one InstanceSpec into a geometrically valid 3D layout: rooms with positions and sizes, portals
aligned on both rooms' walls, a spawn, and a satisfiable goal. This is the specialist the raw brief
centers on. Each call is sandboxed to its instance's theme.

## Entry points (see CONTRACT.md)

- `createInstance(InstanceSpec, assetQuery, opts?) -> { instance, report }`

## Phase 4 status (real solver)

Two injected dependencies, no imports: `assetQuery` (asset-registry.query) and `graphGen`, the
abstract room-adjacency graph generator that stands in for the layout LLM. `graphGen` emits topology
ONLY (rooms, roles, adjacencies, entry, goal room); a stochastic model is a drop-in behind the same
seam in Phase 5/6.

The deterministic solver packs rooms onto a uniform integer grid, so each adjacency becomes a shared
full wall and each doorway lands exactly on a wall of both rooms (which is what the runtime needs to
cut an opening the player can walk through). A union-find pass guarantees full connectivity, and a
`reach_exit` goal gets an EXIT on an outer wall. The validator re-proves the four invariants (no
overlap, full connectivity, portals aligned on both walls, goal reachable) independently, so a solver
bug is caught and the layout regenerated; a straight-chain fallback means creation never hard-fails on
geometry. It returns the persistence Instance minus `npcs` (the narrator folds those in later).

The Delaunay + separation-steering + MST "organic dungeon" layout (04-TECH-STACK.md) is the later
drop-in behind the same `RoomGraph -> Instance` seam; grid packing is the valid-by-construction choice
for Phase 4.

## Schema note

Owns `instance-spec.json` (input), `room-graph.json` (the abstract graph the model emits),
`instance.json` (layout output, referencing persistence room/portal/goal), and
`validation-report.json`.

## Run the tests

`npm test`. Asserts the generated layout is schema-valid with a passing report; the four invariants
hold on a generated instance; the validator rejects adversarial fixtures (overlapping rooms, an
unaligned portal, an unreachable room, an unreachable goal); the graph generator emits a schema-valid
graph; layout is deterministic and matches a committed golden fixture; a bad graph regenerates and a
hopeless one falls back; a missing kit throws `NO_ASSET_FOR_KIND`; and a 4-cycle graph closes into a
loop of doorways. A runtime test (`layers/runtime/tests/scenario-instance.test.js`) loads the
generated fixture and walks it spawn to goal with the real portal-graph router.

## Modify safely

Swap the solver, model, validator, or kit-selection strategy inside this folder. As long as the
output stays valid against `instance.json` and the invariants hold, the narrator and runtime cannot
tell what changed.
