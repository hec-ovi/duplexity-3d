# ux-shell

The application chrome around the game: main menu, adventure browser, new/import/export screens, and
the HUD frame. It frames and launches the runtime and calls backend layers only through their
documented endpoints. No game logic, no scene graph, no LLM calls live here.

## Entry points (see CONTRACT.md)

- `listAdventures()` - via `persistence.list`.
- `openAdventure(id, instanceId?)` - loads via `persistence` and mounts the `runtime` (defaults the
  instance to the progression's start).
- `newAdventure(brief)` - triggers the author flow (`POST /adventure`).
- `exportAdventure(id) -> string` / `importAdventure(text) -> adventure` - the portable-file flows.
- `mount(container, { onDownload? })` - render the vanilla-DOM shell (browser + New/Import/Export/Play).

## Status

`createShell(deps)` receives `runtime`, `persistence`, and an `author` function, all injected and
called only through their contracts, so this src imports no other layer. It exposes the headless
controller above plus `mount`, a plain vanilla-DOM shell: an adventure browser (a row per adventure
with Play and Export), a New button, and an Import file input. Play mounts the runtime; Export hands
the serialized Bundle to an injected `onDownload`; Import reads an uploaded bundle file and refreshes
the list. The runtime owns its own canvas; the shell only reveals the stage region.

## Run the tests

`npm test`. `ux-shell.test.js` asserts the controller (list/open/new/export/import) with the backend
mocked at the boundary; `ux-shell.dom.test.js` drives the rendered shell the way a user does
(Testing Library + user-event in jsdom): browse and Play (runtime mounted at the start instance),
New (author flow, appears in the browser), Export (a re-importable Bundle handed to onDownload), and
Import (an uploaded bundle file shows up in the browser).

## Modify safely

Redesign menus, add screens, restyle, or change the framework inside this folder. As long as it
mounts the runtime through the runtime's contract and calls backend layers through their endpoints,
nothing else is affected.
