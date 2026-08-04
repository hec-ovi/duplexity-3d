# Changelog

What the project does now, newest first.

## 0.2 - Levels that connect, and a run you can win

- A door can lead to another instance. A portal with `roomB: "LINK"` carries `link.instanceId`, so a
  street door opens into a building, a stairwell joins two floors, and each side is authored on its
  own portal.
- A door can be locked. `portal.lock` names a rule (`all_cleared`, `cleared`) that `map-state` weighs
  against the run. A locked gate is scenery: you cannot leave through it and it does not satisfy
  `reach_exit`.
- `map-state` is the run's ledger: it derives the world map from the Adventure (nodes are the
  instances, doors are the linked portals, the exit is the gate, the entry is `progression.start`),
  then tracks what has been entered, cleared and seen, and answers what is open. The exit gate opens
  when every required instance is cleared, and never counts the instance it stands in.
- The runtime reports `onTransit` once when the player walks into an open linked door, and `load`
  takes a `spawnRoomId` so they arrive on the far side. It also keeps the rooms walked into and
  serves `blueprint()`, a floor plan holding only those rooms.

## 0.1 - The engine

- Ten isolated layers behind contracts, one Adventure document as the wire format, and a playable
  first-person three.js slice: authored worlds, deterministic NPCs with an LLM interaction seam,
  voice, export/import, an adventure browser, and async asset generation.
