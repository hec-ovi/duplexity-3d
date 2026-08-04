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

## Phase 3 status (NPCs at play-time, still no LLM)

NPCs now move, animate, and talk. Same split: pure logic is node-testable, browser bits are injected.

- `nav.js` (pure) is a portal-graph router: rooms are nodes, portals are edges, `findPath(from, to)`
  returns the waypoints through each doorway centre. recast-navigation-js drops in behind this seam
  later (see 04-TECH-STACK.md).
- `npc-sim.js` (pure) runs each NPC's deterministic mode (idle/wander/patrol/move_to/follow/guard/
  flee/attack/talk/dead): it steers through nav waypoints, slides on the player's wall colliders, and
  reports an animation clip. Any "random" choice comes from a seeded RNG (`rng.js`), never
  `Math.random`, so play replays identically.
- `self-context.js` (pure) assembles the schema-valid `selfContext` the npc brain receives.
- `speech.js` (pure) is the bubble model: one line per NPC with a ttl counted in sim dt.
- `index.js` grows `getNpcs`, `assembleSelfContext`, and `interact(npcId, interaction)`: it asks the
  injected brain for a decision and validates it against the NPC's `allowedModes` + live context,
  falling back deterministically (keep mode, stay silent) on anything off-contract. `applyInteraction
  Result` stays the lenient direct-apply path.
- `three-scene.js` wraps each NPC in a `npc:<id>` group; `npc-actor.js` drives that group from state,
  billboards a name label + speech bubble, and plays a procedural placeholder animation. Text is an
  injected factory (`speech-rig.js` wires troika-three-text in the browser; tests use a head-less
  stub), so the actor layer runs in jsdom with no GL context.
- `app.js` binds the actors and adds `E` to talk to the nearest NPC.

The real per-interaction brain now lives behind the backend `POST /interaction` route (added in
Phase 6); the browser slice in `app/main.js` still uses a small canned brain for the offline demo, and
could call the route instead. Play-time goal evaluation covers the full goal set (discover_item,
reach_exit, defeat, survive, unlock_dialog, and the sequence/all composites), all latched and checked
each frame with no LLM. NPC bodies are still primitive placeholders; real GLB kit characters drop in
behind the same builder + `animation` field.

## Run it

- `npm test` runs the contract + simulation + jsdom interaction tests (no browser needed).
- `npm run dev` (from the repo root) serves the playable slice from `app/`: WASD to move, mouse to
  look, `E` to talk, and walk into a door to go through it. `app/` is the composition root that wires
  this runtime to `asset-registry`, a generated city and `map-state` (the one place allowed to import
  several layers).
