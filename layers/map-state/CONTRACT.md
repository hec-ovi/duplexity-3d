# map-state - Contract

## Purpose
The rogue's ledger for one run: which instances the player has entered and cleared, which rooms they
have seen, which doors are open right now, and whether the exit gate has opened so the run can be won.
It derives the world map from the authored Adventure (it authors nothing) and answers every question
with pure functions over that map plus the run's progress.

## Inputs (params in)
- `buildWorldMap(adventure) -> WorldMap`
  - `adventure`: an Adventure document (schema owned by `persistence`). The map is DERIVED, never
    authored separately: nodes are `adventure.instances`, doors are the portals carrying `link`, exits
    are the portals whose `roomB` is `"EXIT"`, and the entry node is `adventure.progression.start`.
  - schema out: [schema/world-map.json](schema/world-map.json)
- `createProgress(worldMap) -> MapProgress` - a fresh run, standing in the entry instance.
  schema: [schema/map-progress.json](schema/map-progress.json)
- `enterInstance(progress, worldMap, instanceId) -> MapProgress`
- `visitRoom(progress, instanceId, roomId) -> MapProgress` - what the blueprint overlay reveals.
- `clearInstance(progress, worldMap, instanceId) -> MapProgress` - the instance's goal was met.
- `win(progress, worldMap, portalId) -> MapProgress` - the player walked into the exit gate.

Every write returns a NEW progress; the argument is never mutated.

## Outputs (params out)
- `WorldMap` - `{ entry, nodes[], doors[], exits[], required[] }`. `nodes` are instance ids with a
  label and kind; `doors` are cross-instance links `{ portalId, from, to, kind, lock }`; `exits` are
  `{ portalId, instanceId, lock }`; `required` lists the instances `all_cleared` counts.
  schema: [schema/world-map.json](schema/world-map.json)
- `MapProgress` - `{ contractVersion, entered[], cleared[], visitedRooms{}, won }`.
  schema: [schema/map-progress.json](schema/map-progress.json)
- Queries (pure reads, no new progress):
  - `doorState(worldMap, progress, portalId) -> { open, rule|null, remaining[] }` - `remaining` names
    the instances still to clear, so a locked door can say why in one line.
  - `exitState(worldMap, progress) -> { open, remaining[], portalId }` - the run's win condition, and
    which gate it is. A map with no exit reads as shut with `portalId: null`.
  - `unlockedInstances(worldMap, progress) -> string[]` - every instance reachable from the entry
    through doors that are open right now, in map order.
  - `isCleared(progress, instanceId) -> boolean`, `isVisited(progress, instanceId, roomId) -> boolean`

## Events
None. It is called; it emits nothing.

## Errors
- `MAP_INVALID` - the Adventure cannot form a map: a door links to an instance that does not exist, or
  the entry names an instance that does not exist.
- `UNKNOWN_NODE` - an instance id that is not a node on the map.
- `UNKNOWN_PORTAL` - a portal id that is not a door or an exit on the map.
- `EXIT_LOCKED` - `win` was called on an exit whose lock rule is not satisfied yet.

## Invariants this layer will never break
- Pure and deterministic: same map plus same progress gives the same answer, with no clock, no random,
  and no I/O. Progress objects are never mutated in place.
- `all_cleared` never counts the instance the exit gate stands in, so a level can never require
  clearing itself to be allowed to leave.
- Clearing is monotonic: a cleared instance stays cleared, an opened door stays open, and `won` never
  goes back to false within a run.
- It reads the authored Adventure and never writes to it.

## Dependencies (contracts only)
- `persistence` (the Adventure + Portal schemas, as data). It imports no other layer's `src/`.

## How to modify this blackbox safely
Add a lock rule by extending the `lock.rule` enum in `persistence/schema/portal.json` and handling it
in `src/rules.js`; every other layer keeps working because they only ever ask `doorState`/`exitState`.
Keep `tests/` green: a map derived from a two-building city, a gate that stays shut until the last
building is cleared, `remaining` naming what is left, room reveal, and each error code.
