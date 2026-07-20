# runtime - Contract

## Purpose
Load and PLAY one instance in the browser with three.js. It renders, moves the player and NPCs,
pathfinds, animates, draws in-scene speech bubbles and labels, checks goals locally, and triggers
progression. It runs no LLM. It is the whole play-time engine minus the single interaction call.

## Inputs (params in)
- `load(Adventure, instanceId)` - builds the scene from the Adventure document and `asset-registry`.
  Consumes the Adventure schema (owned by persistence) and the `Instance` within it.
- player input - local (keyboard/mouse/touch/gamepad); never leaves the client.
- `applyInteractionResult(npcId, InteractionResult)` - applies an NPC decision returned from the
  backend. schema: `schema/interaction-result.json` (owned by npc).

## Outputs (params out) - the events it emits to the backend
- `onInteraction(selfContext, interaction) -> InteractionResult` - the ONLY per-frame-ish thing that
  may call the backend, and only when the player actually interacts with an NPC. The runtime
  assembles `selfContext` (schema owned by npc).
- `onHistoryAppend(InteractionRecord)` - to narrator.
- `onGoalMet(instanceId, GoalResult)` then `onRequestNextInstance()` - to narrator; narrator returns
  the next instance id (or done) and the runtime transitions.

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
