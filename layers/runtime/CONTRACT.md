# runtime - Contract

## Purpose
Load and PLAY one instance in the browser with three.js. It renders, moves the player and NPCs,
pathfinds, animates, draws in-scene speech bubbles and labels, checks goals locally, and triggers
progression. It runs no LLM. It is the whole play-time engine minus the single interaction call.

## Inputs (params in)
- `load(Adventure, instanceId, opts?)` - builds the scene from the Adventure document and
  `asset-registry`. Consumes the Adventure schema (owned by persistence) and the `Instance` within it.
  `opts.spawnRoomId` starts the player in that room instead of the instance spawn: the far side of a
  door they just walked through.
- player input - local (keyboard/mouse/touch/gamepad); never leaves the client.
- `applyInteractionResult(npcId, InteractionResult)` - applies an NPC decision returned from the
  backend. schema: `schema/interaction-result.json` (owned by npc).
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
  `link.instanceId` with `opts.spawnRoomId = link.spawnRoomId`. The runtime plays one instance at a
  time and never loads the next one itself.
- `blueprint()` - the floor plan for the map overlay: `{ instanceId, label, mapKind, floor, player,
  rooms[], blocks[], doors[] }`, in world XZ metres. Each door carries its `kind`, its `to` instance,
  and whether it is `open` right now; `blocks[]` are the buildings standing on open ground. The
  overlay it feeds (`src/blueprint-hud.js`) keeps the player centred at a scale taken from the room
  they are IN, so discovering a room slides the map instead of rescaling it.
- `getVisitedRooms()` - the rooms walked into so far, in first-entry order.

The browser shell (`src/app.js`) adds two host hooks on top: `goTo(instanceId, { spawnRoomId })`
rebuilds the scene in another instance (disposing the one it leaves), and `onFrame(dt)` fires after
every tick so a host can draw a HUD outside the 3D scene. `src/blueprint-hud.js` is that HUD: it draws
a `blueprint()` onto a 2D canvas context.

## Responsibilities (all local, no backend)
Rendering, camera, controls, collision, portal traversal between rooms, NPC deterministic mode
behavior (idle/wander/patrol/move_to/follow/guard/flee/attack/talk), navmesh pathfinding, animation
state machine, billboarded speech bubbles + name labels, HUD readouts, goal evaluation each tick,
positional audio.

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
  `asset-registry` (load assets by id). It imports no backend code.

## How to modify this blackbox safely
Swap the render approach, controls, pathfinding lib, animation, or bubble library inside this
folder. Adding an NPC mode's behavior happens here (paired with the additive enum change in npc).
Because the runtime depends only on schemas, the entire author-time stack can be replaced and the
runtime is untouched. Keep `tests/` green: component/interaction tests (render an instance fixture,
drive controls, assert portal traversal, mode behavior, and bubble rendering) with HTTP mocked.
