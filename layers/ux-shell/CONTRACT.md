# ux-shell - Contract

## Purpose
The application chrome around the game: main menu, adventure browser, new/import/export screens, and
the HUD frame. It frames and launches the runtime; it contains no game logic and no three.js scene
code. Keeping it isolated is what lets the same runtime be embedded elsewhere (for example an
Anna-style host app, exactly as gamentic-anna reuses the gamentic brain).

## Inputs (params in)
- user navigation (local UI state).
- the adventure list and a chosen Adventure from `persistence` (`load`, list).

## Outputs (params out)
- mounts the `runtime` with a chosen `{ adventure, instanceId }` (via the runtime's `load` contract)
  and unmounts it on exit.
- triggers author (`POST /adventure`), export/import (persistence), and new-adventure (interviewer
  entry) flows. It calls those layers only through their documented endpoints.

## Events
Consumes `progression.advanced` / `history.appended` (from narrator, via the runtime) to update
chrome (e.g. an objectives readout). Emits nothing others depend on.

## Errors
- surfaces the errors of the layers it calls; it defines none of its own domain errors.

## Invariants this layer will never break
- No game logic, no scene graph, no LLM calls live here. It only frames and launches.
- Swapping the shell, restyling it, or embedding the runtime in a different host must not require
  any change inside `runtime` or the backend layers.

## Dependencies (contracts only)
- `runtime` (mount/load), `persistence` (list/load/import/export), `interviewer` (start new),
  `narrator` (author). All via documented endpoints, never internals.

## How to modify this blackbox safely
Redesign menus, add screens, restyle, or change the framework inside this folder. As long as it
mounts the runtime through the runtime's contract and calls backend layers through their endpoints,
nothing else is affected. Keep `tests/` green: component tests for the browser/new/import/export
flows with the backend mocked at the network layer, asserting the runtime is mounted with the
correct Adventure and instance.
