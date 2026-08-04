# runtime - Contract

## Purpose
Load and PLAY one instance in the browser. It simulates: it moves the player and the NPCs, resolves
collisions, tracks which room they are in, pathfinds, checks goals and triggers progression. Round
that it wires a camera, the controls, the renderer, and the HTML laid over the canvas (names, the
dialogue panel, the map). What the place LOOKS like is `cityscape`, handed in. It runs no LLM. It is
the whole play-time engine minus the single interaction call.

## Inputs (params in)
- `load(Adventure, instanceId, opts?)` - builds the scene from the Adventure document and
  `asset-registry`. Consumes the Adventure schema (owned by persistence) and the `Instance` within it.
  `opts.spawnRoomId` starts the player in that room instead of the instance spawn: the far side of a
  door they just walked through. Arriving that way, they are stood clear of the doors that LEAVE that
  room and turned to look into the place, so walking in and holding forward does not walk you straight
  back out. `opts.spawnAt` / `opts.facing` place them exactly instead, which is what coming out of a
  building onto open ground needs: the middle of a whole street is nowhere near the door you came out
  of.
- player input - local, never leaves the client. WASD or the arrows walk, the mouse looks, `E` talks,
  **shift** runs, **space** jumps (one hop: there is nothing to land on but the floor), and holding the
  **right button** pulls the view in.
- `applyInteractionResult(npcId, InteractionResult)` - applies an NPC decision returned from the
  backend. schema: `schema/interaction-result.json` (owned by npc).
- `deps.createCityscape(model, deps) -> Cityscape` - injected city builder, normally `cityscape`.
  Given one, the place is built, lit and moved: ground, buildings, doors, windows, lamps, parked
  vehicles, rails, traffic, projections and a shuttle. The shell adds its `group` to the scene, calls
  `update` each frame and `dispose` on the way out, and asks it whether the player can step on the
  shuttle. Absent, the world is empty and only the simulation runs, which is what a head-less test
  wants.
- `deps.onLoading(busy)` - raised while a place is being built and its materials compiled, and
  lowered when it can be drawn. Nothing renders in between: on WebGPU a shader is compiled the first
  time it is drawn, so compiling up front turns a multi-second stall on a black screen into a loading
  screen that says what it is doing.
- `deps.isPortalOpen(portalId) -> boolean` - injected lock oracle, normally `map-state`. It is asked
  ONLY about portals that carry an authored `lock`; an ordinary doorway has nothing to satisfy and is
  open. Absent means every portal is open. A locked portal is scenery: the player cannot leave through
  it and it does not satisfy `reach_exit`. A thrown or unanswerable check fails CLOSED.

## Outputs (params out) - the events it emits to the backend
- `onInteraction(selfContext, interaction) -> InteractionResult` - the ONLY per-frame-ish thing that
  may call the backend, and only when the player actually interacts with an NPC. The runtime
  assembles `selfContext` (schema owned by npc).
- `onHistoryAppend(InteractionRecord)` - to narrator.
- `onGoalMet(instanceId, GoalResult)` then `onRequestNextInstance()` - to narrator; narrator returns
  the next instance id (or done) and the runtime transitions.
- `onTransit({ portalId, from, fromRoom, link })` - the player walked into an open door whose far side
  is another instance (a street door, a stairwell). Reported ONCE per door; the host loads
  `link.instanceId` passing the `link` itself as the load options, since it carries where to arrive
  (`spawnRoomId`, `spawnAt`) and which way to be looking (`facing`). The runtime plays one instance at
  a time and never loads the next one itself.
- `blueprint()` - the floor plan for the map overlay: `{ instanceId, label, mapKind, floor, player,
  rooms[], blocks[], doors[] }`, in world XZ metres. Each door carries its `kind`, its `to` instance,
  what that place is called (`label`) and whether it is `open` right now; `blocks[]` are the buildings
  standing on open ground. The overlay it feeds (`src/blueprint-hud.js`) keeps the player centred at a
  scale taken from the room they are IN, so discovering a room slides the map instead of rescaling it.
  That overlay also exports `placesLeft(plan, left?)`: the places still to go, nearest first, each
  with the metres to it and the bearing off where the player is looking. `drawBlueprint` takes the
  same `left` list and marks them, pinning one that is off the map to its edge so it still points
  the way.
- `getVisitedRooms()` - the rooms walked into so far, in first-entry order.
- `placePlayer({ x, y?, z })` - put the player somewhere without walking them there and without
  asking the collider: for being CARRIED, by a shuttle or anything else that moves you. Room tracking
  still follows, so arriving by vehicle counts as having been there.

## What it lays over the canvas
Names and speech are HTML, never glyphs in the scene: glyphs are sized in metres, so a line looks
fine across a room and swallows the screen when someone stands next to you. A NAME hangs over whoever
it belongs to, small and quiet; what someone SAYS goes in one panel at the bottom of the screen, in
the same place every time, with a header naming who is talking and the controls under it, so a line
is readable whether or not you can see who said it. The map is a 2D canvas the host draws with
`drawBlueprint`.

## How a place is drawn
The renderer, the camera and the post chain live here: WebGPU where the browser has it and WebGL2
where it does not, film tone mapping, bloom taken from the scene's emissive output alone, a haze that
lies on the streets and thins as it climbs, and a grade that pulls the shadows towards violet. What
stands IN that scene is `cityscape`, injected: the shell holds one per instance and never has to know
a rail from a lamp.

Open ground is kept STANDING while the player is inside a building: a street costs the most to build
and is the one place they always come back to, so stepping back out is immediate rather than a rebuild.
Everything else is disposed the moment it is left.

The browser shell (`src/app.js`) adds three host hooks on top: `goTo(instanceId, link)` rebuilds the
place in another instance (disposing the one it leaves), `onFrame(dt)` fires after every tick so a
host can draw a HUD outside the 3D scene, and `ride()` steps the player on and off the shuttle while
it is standing at a stop. `src/blueprint-hud.js` is that HUD: it draws a `blueprint()` onto a 2D
canvas context and marks the places still to go.

## Responsibilities (all local, no backend)
Camera, controls, collision, portal traversal between rooms, NPC deterministic mode behavior
(idle/wander/patrol/move_to/follow/guard/flee/attack/talk), navmesh pathfinding, the name tags and the
dialogue panel over the canvas, HUD readouts, goal evaluation each tick, the renderer and the post
chain, positional audio.

## Errors
- `ASSET_LOAD_FAILED` - a referenced asset id could not load; substitute a placeholder and warn (do
  not crash the scene).
- `INSTANCE_INVALID` - the loaded instance failed a client-side sanity check (should never happen if
  scenario-creator honored its contract; logged and surfaced).

## Invariants this layer will never break
- A room marked `open` (a street, a plaza) still collides at its edge and renders no wall there, so
  the level ends in empty space you cannot walk into. A `block` (a building on that ground) is solid:
  nothing walks through one, and a door on its face is reached, not passed through.
- `blueprint()` never contains a room the player has not walked into. The overlay cannot leak a floor
  plan the player has not earned, because the data is not there to draw.
- It NEVER mutates the authored Adventure data. Play-time state (positions, modes, flags) is a
  separate mutable layer; authoritative changes are requested through the backend contracts only.
- Goal checks and progression transitions read authored data; they never call an LLM.
- Every NPC mode has a deterministic client-side behavior; the backend only ever changes WHICH mode.

## Dependencies (contracts only)
- Adventure schema + `Instance` (persistence), `InteractionResult` + `selfContext` schemas (npc),
  `asset-registry` (load assets by id), and `cityscape` (`createCityscape`), injected. It imports no
  backend code and no other layer's `src/`.

## How to modify this blackbox safely
Swap the render approach, controls, pathfinding lib, animation, or bubble library inside this
folder. Adding an NPC mode's behavior happens here (paired with the additive enum change in npc).
Because the runtime depends only on schemas, the entire author-time stack can be replaced and the
runtime is untouched. Keep `tests/` green: component/interaction tests (render an instance fixture,
drive controls, assert portal traversal, mode behavior, and bubble rendering) with HTTP mocked.
