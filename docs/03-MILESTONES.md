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

## Phase 3 - NPCs at play-time (deterministic, still no LLM) [x]

- [x] NPCs spawn from their `NpcDef` and run deterministic modes (idle/wander/patrol/move_to/follow/
  guard/flee/attack/talk/dead) in a pure, seeded (no `Math.random`/`Date.now`) sim. Movement steers
  through doorways via a portal-graph router (`nav.js`) and slides on the same wall colliders the
  player uses. `animationForMode` maps each mode to a clip name; the actor plays a procedural
  placeholder animation (walk bob, death topple) until real GLB clips land behind the same field.
- [x] In-scene UI: billboarded name labels + speech bubbles via troika-three-text (browser), injected
  as a text factory so the sim + jsdom tests stay head-less. Bubbles carry a ttl counted in sim dt.
- [x] The interaction endpoint is a stub: the runtime assembles a schema-valid `selfContext`, calls an
  injected canned "brain" (app/main.js: a talker greets, a mute hostile lunges), then VALIDATES the
  returned `interactionResult` against the NPC's `allowedModes` and live context (a string target must
  exist there). Off-contract decisions, a missing brain, or a thrown brain all apply the deterministic
  fallback (keep mode, stay silent). `E` talks to the nearest NPC in range.
- [x] DoD met: NPCs move + animate; pressing `E` shows a bubble from canned data. `npm test` = 111
  local tests (no CI), isolation stays clean (runtime imports no other layer's src; troika lives only
  in the browser composition root). An adversarial review pass ran; its confirmed findings were fixed.
  navmesh via recast-navigation-js is deferred behind the `nav.findPath` seam (see 04-TECH-STACK.md).

## Phase 4 - Scenario creator (the hard layer: geometry that is valid) [x]

- [x] `layers/scenario-creator/`: an injected `graphGen` (the LLM stand-in) emits an abstract
  room-adjacency GRAPH (topology only, schema `room-graph.json`); a deterministic grid-packing solver
  places rooms and aligns portals so every adjacency is a shared full wall (exact doorway coincidence,
  which the runtime's opening-cut needs), guarantees no overlaps + full connectivity (union-find) +
  a reachable goal/exit, and selects kit pieces from the injected `asset-registry.query`. A validator
  re-proves the four invariants independently; an invalid layout is regenerated, and a straight-chain
  fallback means creation never hard-fails on geometry.
- [x] DoD met: `createInstance` produces a validated Instance (persistence wire format minus npcs).
  A runtime test loads the generated fixture and walks it spawn to goal through the doorways with the
  real portal-graph router. Tests cover the geometry validator (overlap / connectivity / portal
  alignment / goal reachability) on generated AND adversarial fixtures, plus determinism, the
  regenerate-on-reject loop, the never-hard-fail fallback, `NO_ASSET_FOR_KIND`, and loop closing.
  `npm test` = 129 local tests (no CI); isolation stays clean (scenario-creator imports no other
  layer's src; the graph LLM and asset query are injected). An adversarial review pass ran; its
  confirmed findings were fixed. The organic Delaunay/MST layout is deferred behind the same
  `RoomGraph -> Instance` seam (04-TECH-STACK.md).

## Phase 5 - Author-time pipeline (interview -> plan -> world -> npcs) [x]

- [x] `layers/interviewer/` (creative brief, skippable) -> `layers/narrator/` (a deterministic
  planner, the LLM stand-in behind an injectable `plan` seam, emits a multi-instance AdventurePlan
  with a gated progression DAG) -> per-instance `scenario-creator` (Phase 4 grid solver) ->
  `layers/npc/` authoring (real registry body, allowedModes bounded by the body's animation clips,
  each NPC spawned in its home room) -> assembled Adventure via `layers/persistence/`. The narrator
  resolves each instance's theme against the registry, so a fantastical brief lays out against an
  available kit instead of failing with `NO_ASSET_FOR_KIND`. The plan is structurally validated
  (`PLAN_INVALID`), its progression checked (`PROGRESSION_DEADEND`), and a failed layout surfaces as
  `INSTANCE_BUILD_FAILED`.
- [x] DoD met: `POST /adventure` (the real node HTTP route in `server/`, the backend composition root
  outside `layers/`) with a brief OR without one (the skip path fills defaults) returns a schema-valid,
  playable, multi-instance Adventure with a progression graph, and persists it (`GET /adventure/:id`
  returns the saved document). The end-to-end test drives the real route and then loads and walks the
  authored first instance with the real runtime. `npm test` = 146 local tests (no CI); isolation stays
  clean (every layer imports only its own src; the pipeline is wired in `server/`). An adversarial
  review pass ran; its confirmed findings were fixed.

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
