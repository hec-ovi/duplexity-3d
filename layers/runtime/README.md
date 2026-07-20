# runtime

Load and PLAY one instance in the browser with three.js. It renders, moves, pathfinds, animates,
draws speech bubbles, checks goals locally, and triggers progression. It runs no LLM; the only thing
that crosses to the backend is a single interaction call.

## Entry points (see CONTRACT.md)

- `load(adventure, instanceId)` - build the play-time scene model.
- `applyInteractionResult(npcId, result)` - apply a backend NPC decision.
- emits `onInteraction`, `onHistoryAppend`, `onGoalMet`, `onRequestNextInstance` (injected).

## Phase 2 status (walkable slice)

You can load the shared Adventure fixture and walk it in three.js. The layer is split so the
simulation is testable without a browser:

- `scene-model.js` (pure) turns an instance into floors, walls (with the portal openings cut out and
  shared walls deduped), colliders, objects, pickup items, and npc placements.
- `collision.js` (pure) slides the player (an XZ box) along walls; portal openings are simply absent
  from the collider set, so you walk through them.
- `controls.js` (pure) maps keys plus camera yaw to a movement delta.
- `index.js` (`createRuntime`) owns play-time state and `step(dt, input)`: move, resolve collisions,
  track which room you are in, auto-pick-up nearby items, evaluate the goal. Play-time state stays
  SEPARATE from the authored document, so playing never mutates it.
- `three-scene.js` builds the three.js object graph from the scene model. Phase 2 renders coloured
  primitive placeholders sized from `asset-registry` (injected, never imported); a missing asset
  warns and falls back to a default box, honouring the ASSET_LOAD_FAILED contract. Real GLB kit
  pieces drop in later behind this same builder.
- `app.js` (`createApp`) is the browser shell: renderer, first-person camera, keyboard + pointer-lock
  look, and the render loop. The renderer is injectable and the loop is a manual `tick(dt)`, so it
  runs head-less in tests.

Pathfinding, animation, and speech bubbles are Phase 3 (see 04-TECH-STACK.md); NPCs render as static
placeholders for now.

## Run it

- `npm test` runs the contract + simulation + jsdom interaction tests (no browser needed).
- `npm run dev` (from the repo root) serves the playable slice from `app/`: WASD to move, mouse to
  look, walk onto the amulet to meet the goal. `app/` is the composition root that wires this runtime
  to `asset-registry` and the shared fixture (the one place allowed to import several layers).
