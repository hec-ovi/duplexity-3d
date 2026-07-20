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

## Phase 1 - Skeleton + contract tests (isolation is real from day one) [x]

- [x] `layers/<name>/` folders created with `CONTRACT.md` (moved out of `docs/layers/`),
  `README.md`, `schema/`, `src/`, `tests/`, `fixtures/`.
- [x] Shared **Adventure** JSON Schema (`layers/persistence/schema/adventure.schema.json`) plus 41
  sub/peer schemas (draft 2020-12), and a hand-written example Adventure fixture (1 instance, 3
  wall-adjacent rooms, 2 aligned portals, 2 NPCs, a `discover_item` goal) that validates against it.
- [x] Shared test harness (`harness/`): an Ajv loader with a canonical `SCHEMA_ID` map, and a static
  isolation checker (scans `src/` AND `tests/`, catches side-effect imports). Every layer is a
  dependency-injected stub that satisfies its contract with canned data.
- [x] DoD met: `npm test` passes (52 local contract tests, no CI); every schema validates its
  fixtures; no layer imports another's internals. An adversarial review pass ran and its 18 confirmed
  findings were fixed.

## Phase 2 - Runtime vertical slice (render + walk, no AI) [x]

- [x] three.js app served from `app/` (the composition root) loads the Phase 1 Adventure fixture and
  builds one instance: floors and walls from the room boxes with the portal openings cut out and a
  header over each doorway (from the authored opening height), plus placeholder props/items/NPC
  bodies sized from `asset-registry` (injected, never imported; a missing asset warns and falls back
  to a default box, per the ASSET_LOAD_FAILED contract). Real GLB kit pieces drop in later behind the
  same builder.
- [x] First-person camera + WASD movement + AABB collision with wall sliding; you walk through the
  portal openings and the runtime tracks which room you are in and picks up the amulet on contact.
- [x] DoD met: `npm run dev` lets you walk the hand-authored instance in the browser and solve the
  `discover_item` goal by reaching the amulet. The runtime is split into pure modules (scene-model,
  collision, controls) plus a three.js builder and an injectable-renderer app shell, so the loader
  and controls are tested with node + jsdom (`@testing-library/user-event`) interaction tests, no
  browser needed. `npm test` = 81 local tests (no CI); isolation stays clean (runtime imports no
  other layer's src). An adversarial review pass ran; its 5 confirmed findings (tunnelling at large
  dt, wall-dedupe vertical extent, doorway header height, a one-sided test assertion, and pointer
  lock on the play prompt) were fixed.

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
