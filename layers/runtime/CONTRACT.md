# runtime - Contract

## Purpose
Load and PLAY one instance in the browser with three.js. It renders, moves the player and NPCs,
pathfinds, animates, lays names and speech over the canvas as HTML, checks goals locally, and triggers
progression. It runs no LLM. It is the whole play-time engine minus the single interaction call.

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
- `deps.dressFacade(building) -> { name, parts }` - injected facade dresser, normally `facade`.
  Given one, every building gets its windows, its balconies, its awning and the cartel over its door
  built from the parts it returns. Windows are real objects standing in the wall, one per opening,
  each with its own light on or off; the ones that look alike are drawn together in one instanced
  mesh, so a street of them costs a handful of draws rather than hundreds. Absent, buildings are bare
  masses.
- `deps.paintSurface(kind, ctxFor, opts) -> SurfacePlan` - injected surface painter, normally
  `surfaces`. Given one, the scene is textured: the road, the pavement, interior concrete, and every
  building wrapped in a facade of its own, each repeated at its true size in metres. Absent, every
  surface is a flat colour and nothing else changes, which is what a head-less test sees.
- `deps.photoSurface(kind)` + `deps.textureBase` - where a surface has a photographed material and the
  files are being served, that is used instead of a painted one.
- `deps.assetBase` + `deps.loadModel(url) -> Promise<Object3D>` - where the GLB files a level
  references are served from, and how one is fetched. A mass whose `assetRef` names a `building` in
  the catalog IS that file: it is loaded into the scene at the mass's foot, turned by the mass's
  `rotationY` and offset by the asset's `anchor`. A plain box stands in its place until it arrives, so
  the street is walkable from the first frame, and stays there if it never does. A file that brought
  its own front door (`doors: "own"`) gets no door built over it, and nothing of ours is bolted to it.
  Absent, three's own GLB loader is used; a head-less test injects `loadModel` and touches no network.
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
  and whether it is `open` right now; `blocks[]` are the buildings standing on open ground. The
  overlay it feeds (`src/blueprint-hud.js`) keeps the player centred at a scale taken from the room
  they are IN, so discovering a room slides the map instead of rescaling it.
- `getVisitedRooms()` - the rooms walked into so far, in first-entry order.

## What it builds that the level does not describe
A door on a building's face has nothing cut out of it: the mass is solid and what is inside is
another instance. So the door is BUILT, not carved: a surround standing proud of the wall, a leaf set
back in it, a handle and a step. An interior doorway is a real hole, so it gets the surround alone. A
wet road is a mirror laid under the asphalt with the asphalt thinned over it, so what comes back is
the lamps and the signs rather than a second city. Every door is signed and lit: one that leaves says
so (EXIT, UP, LIFT DOWN), and one between two rooms says what is through it, a plate each side, so a
floor can be read without walking into every wall. Indoors has a ceiling, and a room's floor suits
what the room is for: boards in a living room, tiles in a kitchen, worn concrete in a shop.

Solid things throw shadows and take them. Outdoors that is one shadow across the level from the moon;
indoors and near to hand it is the two nearest lamps, since a point light shadow is six renders and
past those nobody can tell. What a shiny surface reflects is the scene itself, captured once it is
standing, so a wet road and a tiled floor come back with the sky and the signs in them.

Names and speech are HTML over the canvas, never glyphs in the scene. A NAME hangs over whoever it
belongs to, small and quiet; what someone SAYS goes in one panel at the bottom of the screen, in the
same place every time, so a line is readable whether or not you can see who said it.

## How it lights a place
The level says where light STANDS (`room.lights[]`: a lamp on the pavement, a sign over a door, a
ceiling lamp in a room). This layer decides everything else: how tall each is, what colour it burns,
and which of them are real lights at any moment. A street can hold forty and a forward renderer will
not take forty, so a pool of six follows the player and lands on whichever are nearest; the rest are
still there to look at, as glowing geometry that costs nothing. Outdoors is night with a haze the far
end of the street fades into; indoors is the room's own lamps over a dim fill. The renderer tone maps
(ACES) and blooms over what is brighter than the scene, so a sign glows into the air around it.

The browser shell (`src/app.js`) adds two host hooks on top: `goTo(instanceId, link)`
rebuilds the scene in another instance (disposing the one it leaves), and `onFrame(dt)` fires after
every tick so a host can draw a HUD outside the 3D scene. `src/blueprint-hud.js` is that HUD: it draws
a `blueprint()` onto a 2D canvas context.

## Responsibilities (all local, no backend)
Rendering, camera, controls, collision, portal traversal between rooms, NPC deterministic mode
behavior (idle/wander/patrol/move_to/follow/guard/flee/attack/talk), navmesh pathfinding, animation
state machine, the name tags and the dialogue panel over the canvas, HUD readouts, goal evaluation
each tick, positional audio.

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
  `asset-registry` (load assets by id), `surfaces` (`paintSurface`) and `facade` (`dressFacade`),
  both injected. It imports no backend code and no other layer's `src/`.

## How to modify this blackbox safely
Swap the render approach, controls, pathfinding lib, animation, or bubble library inside this
folder. Adding an NPC mode's behavior happens here (paired with the additive enum change in npc).
Because the runtime depends only on schemas, the entire author-time stack can be replaced and the
runtime is untouched. Keep `tests/` green: component/interaction tests (render an instance fixture,
drive controls, assert portal traversal, mode behavior, and bubble rendering) with HTTP mocked.
