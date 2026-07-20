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

## Phase 6 - NPC interaction brain + voice/chat (the play-time LLM) [x]

- [x] `layers/npc/` resolve gains an injected `brain` seam: `resolveInteraction(selfContext,
  interaction, { brain })` drives the decision through the model (a fake LLM in tests, a real GGUF
  later) and `sanitizeDecision` deterministically re-validates the raw completion against the live
  snapshot (newMode must be in allowedModes or the whole decision is rejected; an unreal target is
  dropped; bad JSON / a non-object / a thrown or absent model collapses to the safe fallback, so play
  never blocks). `buildInteractionPrompt` is the prompt a grammar-constrained provider is called with
  (the interaction-result schema is its GBNF). The narrator appends every exchange to `Adventure.history`.
- [x] Voice/chat as one narrow layer (`layers/voice/`): `synthesizeSpeech` (text -> Speech, TTS behind
  an injected adapter, degrades to text-only with no codec sidecar) and `transcribe` (audio -> text, STT
  behind an adapter). It owns the emotion-tag vocabulary + the VoiceDesign schema; the deterministic
  voice-design composer stays in `npc` (`composeVoiceDesign`, stamped onto each NpcDef, distinct per
  cast).
- [x] DoD met: `POST /interaction` (the real node HTTP route in `server/`, over the same shared store as
  `POST /adventure`) runs an NPC's brain and returns `{ result, record }`. The route rebuilds the
  security-critical selfContext fields (persona, body animations, allowedModes) from the authored NpcDef,
  so a client cannot smuggle a forbidden mode. The end-to-end test drives the real route with a fake LLM:
  talking flips an NPC to talk and it speaks, provoking flips it to attack/flee targeting the player, a
  dead model degrades safely (no 500) while still archiving, and every exchange lands in history.
  `npm test` = 171 local tests (no CI); isolation stays clean (npc + voice import no other layer's src;
  the brain and voice adapters are injected in `server/`); 46 schemas compile. An adversarial review pass
  ran; its confirmed findings were fixed (the default no-brain path could echo a client-forged
  `myState.mode` outside the authored allowedModes, since self-context validates the mode enum but not
  membership in allowedModes: the stand-in and the route now both clamp the current mode; and an
  array-returning TTS adapter no longer leaks a non-object audio handle). The real Qwen3 A3B GGUF and
  TTS/STT adapters drop in behind the same `brain` / `deps.tts` / `deps.stt` seams (04-TECH-STACK.md).

## Phase 7 - Persistence + UX shell (export/import, adventure browser) [x]

- [x] `layers/persistence/`: `exportFile(id)` serializes a `Bundle` (the Adventure plus any non-kit
  generated assets) to a portable JSON string; `importFile(text)` reads one back. Import runs
  `migrateForward`, which backfills fields an older same-major export may lack (an empty `history`) and
  refuses a newer MAJOR `contractVersion` it cannot read (`MIGRATION_FAILED`); a non-JSON or non-Bundle
  body is `BAD_BUNDLE`. The result opens byte-identical on a fresh store.
- [x] `server/`: `GET /adventure/:id/export` returns the Bundle; `POST /adventure/import` migrates,
  validates, and saves it. An import failure is client-actionable (`MIGRATION_FAILED` / `IMPORT_INVALID`
  -> 422, `BAD_BUNDLE` / bad JSON -> 400), never the 500 an author-time planner bug would be.
- [x] `layers/ux-shell/`: a headless controller (list / open / new / export / import) plus `mount`, a
  vanilla-DOM shell (adventure browser + New / Import / Export / Play) that renders and tests in jsdom,
  isolated from the runtime canvas (the runtime owns its own canvas; the shell only reveals the stage).
- [x] DoD met: the full round trip works across TWO independent backends. `server/roundtrip.test.js`
  authors through the real `POST /adventure`, walks the first instance with the real runtime, exports via
  `GET /adventure/:id/export`, imports the serialized bundle onto a FRESH backend via
  `POST /adventure/import`, and walks it again byte-identically. `ux-shell.dom.test.js` drives the shell
  the way a user does (Testing Library + user-event): browse/Play, New, Export (a re-importable Bundle),
  and Import (an uploaded file). `npm test` = 184 local tests (no CI); isolation stays clean (persistence
  is a leaf; ux-shell imports no other layer's src; the round trip is wired in `server/`); 46 schemas
  compile. An adversarial review pass ran; its confirmed findings were fixed (a malformed percent-encoded
  id in an export/read URL returned 500 instead of 400; the shell's import handler swallowed a rejected
  upload with no user feedback and left the file input unresettable). The import-overwrites-existing
  finding was refuted: that is the store's intended upsert-by-id, matching `save`.

## Phase 8 - Asset generation (optional enrichment, last on purpose) [x]

- [x] `layers/asset-gen/`: a real async job pipeline. `generate(req)` returns `{ jobId, completion }`
  immediately; the injected `providers/gen3d` adapter (ComfyUI/TRELLIS.2 on the AMD box or a cloud API)
  runs async, its output is normalized into a valid, licensed `asset-registry` AssetEntry and registered,
  and `completion` resolves to the final status. `status(jobId)` polls. Normalization is the gate: only a
  commercial-use-clear license (an explicit allow-list) with a valid bbox and glbUrl is registered (and a
  `character` must declare animations), else `NORMALIZE_FAILED`; every registered entry carries
  `source: "generated"`. It imports no other layer's src (provider + registry injected).
- [x] DoD met: with a fake provider, an async request registers a licensed, schema-valid AssetEntry the
  catalog then serves. `server/asset-enrichment.test.js` (a composition-root integration test) generates a
  `crystal` floor/wall/character for a theme the seed registry could not build, and shows scenario-creator
  then builds a valid crystal instance from the generated kit, the runtime loads it, and npc picks the
  generated character (bounding allowedModes by its clips). With generation disabled (no provider) every
  request fails with `PROVIDER_UNAVAILABLE`, registers nothing, and the kit-based engine is untouched.
  `npm test` = 196 local tests (no CI); isolation stays clean; 46 schemas compile. An adversarial review
  pass ran (its most productive: the normalization boundary was too trusting of provider output); its
  confirmed findings were fixed. Generated ids are now forced into a reserved `gen.` namespace so a stray
  provider id can never overwrite a curated kit asset; the completion catch no longer throws on a
  null/undefined rejection (it always resolves to a failed status); and normalization now validates the
  kind enum, non-string animations, malformed snapPoints, and the bbox (copied, not aliased), with an
  optional injected AssetEntry schema gate as a final check before register.

## Phase 9 - Polish [~]

- Spatial/positional audio, more goal types, more NPC modes, more kits/themes, performance passes
  (instancing, LOD), accessibility. Each addition is an additive contract change on one layer.
- [x] Full play-time goal evaluation in `runtime`: `discover_item` was the only implemented win
  condition; the rest are now live and latched, checked each frame with no LLM. `reach_exit` (walk up
  to an EXIT portal's opening), `defeat` (target NPC reaches dead), `survive` (accrued sim seconds, never
  a wall clock), `unlock_dialog` (the NPC reaches a required mode / a set flag), and the `all` (every
  sub-goal) and `sequence` (steps in order, via a per-goal step index) composites. An adversarial review
  of the evaluator ran; its five confirmed edge cases were fixed: a spawn-adjacent EXIT no longer
  auto-fires (an exit arms only once the player is clear of it); a required mode is satisfied only by an
  interaction-driven change, not a seeded/passive start mode; an empty `all`/`sequence` never auto-wins;
  `unlock_dialog`'s `flag` is now winnable via an additive `InteractionResult.flag` an interaction sets;
  and `interact()` archives under the current instance even when a goal advance reloads the next
  synchronously. `npm test` = 209 (`layers/runtime/tests/goals.test.js` drives each type + edge case
  through the real runtime). Also swept and fixed stale/incorrect comments and README headers left from
  earlier phases (two `(stub)` headers on fully-real layers; a couple of "arrives in Phase 6" notes that
  had since landed).
- Remaining polish (spatial audio, more NPC modes, more kits/themes, instancing/LOD, accessibility) is
  open-ended and additive; pick items as needed.

## Compaction points

Good places to compact the working context: end of Phase 0 (design locked), end of Phase 1
(contracts + schemas frozen), and the end of each subsequent phase. The phase's DoD list plus the
updated docs are a complete handoff.
