# ux-shell

The application chrome around the game: main menu, adventure browser, new/import/export screens, and
the HUD frame. It frames and launches the runtime and calls backend layers only through their
documented endpoints. No game logic, no scene graph, no LLM calls live here.

## Entry points (see CONTRACT.md)

- `listAdventures()` - via `persistence.list`.
- `openAdventure(id, instanceId)` - loads via `persistence` and mounts the `runtime`.
- `newAdventure(brief)` - triggers the author flow (`POST /adventure`).

## Phase 1 status (stub)

`createShell(deps)` receives `runtime`, `persistence`, and an `author` function, all injected and
called only through their contracts, so this src imports no other layer. `openAdventure` loads the
chosen Adventure and mounts the runtime with `(adventure, instanceId)`; that is the whole job.

## Run the tests

`npm test`. Asserts `openAdventure` mounts the runtime with the correct, schema-valid Adventure and
instance id, with the backend mocked at the boundary.

## Modify safely

Redesign menus, add screens, restyle, or change the framework inside this folder. As long as it
mounts the runtime through the runtime's contract and calls backend layers through their endpoints,
nothing else is affected.
