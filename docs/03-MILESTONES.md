# 03 - Milestones (build order, made to compact between)

Each phase is a checkpoint. At the end of a phase the docs + contracts fully describe the state,
so we can compact the conversation and resume from the phase boundary without losing anything.

Every phase ships with LOCAL contract tests for the behavior it adds (per the repo test rule). No
CI is added, ever. Tests run through each layer's real entry points against its `fixtures/`.

Legend: [x] done, [~] in progress, [ ] not started.

## Phase 0 - Design lock (this repo, now) [x]

- [x] Raw idea, interpretation, architecture, contract convention, dispatcher captured in `docs/`.
- [x] Tech stack researched (7 domains, fact-checked) and written to `04-TECH-STACK.md`.
- [x] One `CONTRACT.md` per layer under `docs/layers/`.
- Definition of done: a new agent can read `docs/INDEX.md` and know exactly which blackbox owns
  what, and the wire formats between them are named.

## Phase 1 - Skeleton + contract tests (isolation is real from day one) [ ]

- Create `layers/<name>/` folders with `CONTRACT.md`, `README.md`, `schema/`, `tests/`, `fixtures/`.
- Author the shared **Adventure** JSON Schema (`layers/persistence/schema/adventure.schema.json`)
  and a hand-written example Adventure fixture (one instance, 3 rooms, 2 portals, 2 NPCs, 1 goal).
- Stand up a contract-test harness that validates fixtures against schemas and drives each layer's
  (mocked) entry points. Every layer is a stub that satisfies its contract with canned data.
- DoD: `npm test` (and backend test cmd) pass; every schema validates its fixtures; no layer
  imports another's internals.

## Phase 2 - Runtime vertical slice (render + walk, no AI) [ ]

- three.js app in `layers/runtime/` loads the Phase 1 Adventure fixture, builds one instance from
  modular kit pieces (`asset-registry`), player-controlled camera + movement + collision, portals
  you can walk through between rooms.
- DoD: you can walk a hand-authored instance in the browser. Proves the play-time Adventure
  contract and the rendering pipeline. Component/interaction tests for the loader + controls.

## Phase 3 - NPCs at play-time (deterministic, still no LLM) [ ]

- Spawn NPCs from `NpcDef`, run deterministic modes (idle/wander/patrol/move_to/follow), navmesh
  pathfinding, animation state machine, and in-scene speech bubbles + name labels.
- Interaction endpoint is a stub returning a canned `interactionResult`.
- DoD: NPCs move and animate correctly; talking to one shows a bubble from canned data. Proves the
  NPC data contract and the in-scene UI. Tests for mode transitions + bubble rendering.

## Phase 4 - Scenario creator (the hard layer: geometry that is valid) [ ]

- `layers/scenario-creator/`: LLM emits an abstract room-adjacency GRAPH (structured output); a
  deterministic solver places rooms and aligns portals, guarantees no overlaps + full
  connectivity + reachable exit, and selects kit pieces from `asset-registry`. Invalid layouts are
  regenerated, never shipped.
- DoD: given an instance spec, it produces a validated instance the Phase 2 runtime can load and
  walk. Tests: geometry validator (overlap/connectivity/portal-alignment) on generated + adversarial
  fixtures.

## Phase 5 - Author-time pipeline (interview -> plan -> world -> npcs) [ ]

- `layers/interviewer/` (creative brief, skippable) -> `layers/narrator/` (adventure plan:
  instances, goals, progression graph, NPC rosters) -> per-instance `scenario-creator` ->
  `layers/npc/` authoring -> assembled Adventure doc via `layers/persistence/`.
- DoD: `POST /adventure` with (or without) a brief yields a complete, playable multi-instance
  Adventure with a progression graph. End-to-end author test through the real route.

## Phase 6 - NPC interaction brain + voice/chat (the play-time LLM) [ ]

- `layers/npc/` resolve: selfContext + interaction -> `{new_mode, target, utterance, emote}` via a
  small local model, constrained by schema. Narrator appends interaction history. Voice/chat as one
  narrow layer: text/audio in, one result out, TTS/STT behind provider adapters (simplified vs
  gamentic: no local codec sidecar; keep the deterministic voice-design composer + emotion tags).
- DoD: talking to an NPC changes its mode and it speaks; provoking it flips to attack/flee. Tests
  through the interaction route with a fake LLM asserting mode transitions + history append.

## Phase 7 - Persistence + UX shell (export/import, adventure browser) [ ]

- `layers/persistence/`: export an Adventure to a portable file (bundling generated assets),
  import one, save/load. `layers/ux-shell/`: menus, adventure browser, new/import/export screens,
  HUD frame, isolated from the runtime canvas.
- DoD: full round trip (author -> play -> export -> import -> play) works. Tests for the transfer
  format and the shell flows.

## Phase 8 - Asset generation (optional enrichment, last on purpose) [ ]

- `layers/asset-gen/`: generate/enrich 3D assets (ComfyUI on the AMD box if the research says it is
  viable, otherwise a cloud API) asynchronously and register outputs in `asset-registry`. The engine
  already runs from kits, so this only enriches.
- DoD: an async generation request eventually adds a usable, licensed asset the scenario-creator
  and runtime can pick up. Tests: registry write contract + graceful behavior when gen is disabled.

## Phase 9 - Polish [ ]

- Spatial/positional audio, more goal types, more NPC modes, more kits/themes, performance passes
  (instancing, LOD), accessibility. Each addition is an additive contract change on one layer.

## Compaction points

Good places to compact the working context: end of Phase 0 (design locked), end of Phase 1
(contracts + schemas frozen), and the end of each subsequent phase. The phase's DoD list plus the
updated docs are a complete handoff.
