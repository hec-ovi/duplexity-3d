# runtime

Load and PLAY one instance in the browser with three.js. It renders, moves, pathfinds, animates,
draws speech bubbles, checks goals locally, and triggers progression. It runs no LLM; the only thing
that crosses to the backend is a single interaction call.

## Entry points (see CONTRACT.md)

- `load(adventure, instanceId)` - build the play-time scene model.
- `applyInteractionResult(npcId, result)` - apply a backend NPC decision.
- emits `onInteraction`, `onHistoryAppend`, `onGoalMet`, `onRequestNextInstance` (injected).

## Phase 1 status (stub)

No three.js yet. `createRuntime(deps)` builds an in-memory scene model from the Adventure, keeps
play-time state (NPC modes, discovered items) SEPARATE from the authored document so the "never
mutate authored data" invariant holds, applies interaction results, and evaluates the goal locally.
The backend callbacks are injected, so this src imports no backend layer. Phase 2 replaces the scene
model with a real three.js scene behind the same contract (see 04-TECH-STACK.md for the render,
pathfinding, and speech-bubble stack).

## Run the tests

`npm test`. Loads the shared Adventure fixture, asserts the scene is built, an interaction changes
only play-time NPC mode (not the authored data), and a discover_item goal fires `onGoalMet`.
