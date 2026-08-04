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

## Phase 10 - Connected levels + the rogue's ledger [x]

- [x] A portal can lead to ANOTHER instance: `roomB: "LINK"` plus `link { instanceId, spawnRoomId,
  kind }` (additive on `persistence/schema/portal.json`), and can be locked with `lock { rule }`. The
  street door, the stairwell and the exit gate are all the same shape.
- [x] `layers/map-state/`: derives the WorldMap from the Adventure (nodes = instances, doors = linked
  portals, exits = EXIT portals, entry = `progression.start`), so no second document can drift from
  the geometry. Tracks entered / cleared / visited rooms as pure monotonic writes and answers
  `doorState`, `exitState`, `unlockedInstances`. The `all_cleared` gate never counts the instance it
  stands in, so a level can never require clearing itself to be left.
- [x] `runtime`: walking into an open linked door reports `onTransit` once; `load(..., { spawnRoomId })`
  arrives on the far side; a locked gate is scenery (fails closed on an unanswerable lock); visited
  rooms are recorded and `blueprint()` serves a floor plan holding ONLY rooms walked into.
- [x] DoD met: `npm test` = 225 local tests (no CI), 48 schemas compile, isolation clean. The city
  fixture (one street, two buildings, three floors, a gate) is a schema-valid Adventure driven by both
  layers' tests.

## Phase 11 - Street, building and house generators (the level creator) [x]

- [x] `layers/city-planner/`: roads packed on an integer grid (so every join is a shared full wall),
  a front door per lot, one spawn, one `all_cleared` exit gate, and a `LotPlan` per building. One
  portal per wall face, so a door, a road join and the gate can never overlap.
- [x] `layers/building-planner/`: each brief becomes floors joined by a stairwell, with a way back out;
  a house is a one-floor building whose front door is the exit. Floors are separate coordinate spaces,
  so the street and the building agree on ids alone.
- [x] `scenario-creator.validateLayout` is a public contract entry: ONE definition of a correct map,
  injected into both generators. It learned one-sided doors (`EXIT` / `LINK`) and now rejects one on an
  interior wall, where the runtime cuts the opening on one side only.
- [x] DoD met: `tools/compose-city.test.js` generates a city, proves every instance against the real
  validator, derives the map, walks the street into a building with the real runtime, and shows the
  gate opening only after the last building is cleared.

## Phase 12 - The skill, the toolkit, and voice on a real provider [x]

- [x] `tools/` is the third composition root: `node tools/level.js city|street|building|house|validate|map`,
  deterministic, JSON in and out. Generated levels come populated with NPCs (public roles outdoors,
  private ones behind the doors).
- [x] `SKILL.md` at the root, mirrored into `skills/` and `plugins/` (with `.claude-plugin/`
  marketplace + plugin manifests) so any installer finds it; `npm run skill:sync` writes the copies and
  a test fails if they drift.
- [x] `layers/voice/providers/fish.js`: Fish Audio TTS split into a key-free, I/O-free request handle
  and a fetch that performs it, so only `server/` (behind `POST /speech`) ever holds the key. Emotion
  cues return as `[warm]` directions Fish performs; pacing becomes a prosody speed. No key, a refusal
  or an outage all degrade to text.
- [x] DoD met: `npm test` = 265 local tests (no CI), 50 schemas compile, isolation clean. Verified
  against the live API: a real key returns real mp3 through the project's own code path.

## Phase 13 - The city, played [x]

- [x] `runtime/src/app.js` can change instance mid-run: `goTo(id, { spawnRoomId })` rebuilds the scene
  (disposing the old geometry, so crossing doors does not leak GPU buffers) and an `onFrame` hook lets a
  host draw a HUD outside the 3D scene.
- [x] `runtime/src/blueprint-hud.js` draws the floor plan from above: rooms walked into, the doors on
  their walls (locked ones in red, stairs picked out), and where the player stands and faces. It draws
  only what `blueprint()` hands over, so an unexplored floor cannot leak through the map.
- [x] `app/` plays a GENERATED city: map-state answers the locks, walking into a door loads the far
  side, finishing a place ticks it off the gate's list, and reaching the open gate wins the run.
  `?seed=1234` replays the same city.
- [x] Fixed: the runtime asked the lock oracle about every portal, including plain interior doorways
  that map-state rightly does not know, so they failed closed and drew as locked. A portal with no
  authored `lock` is now open without asking.
- [x] DoD met: `npm test` = 269 local tests, 50 schemas, `npm run build` clean, and the page verified in
  a real headless browser: the generated city renders, the overlay draws, the gate reports what is left,
  and the console is silent.

## Phase 14 - Open world outdoors [x]

- [x] Additive on `persistence`: `room.open` (an edge that stops you, drawn as nothing), `room.blocks[]`
  (solid masses standing on the floor), `portal.blockId` (a door on a mass's face, cutting nothing), and
  `elevator_up` / `elevator_down` link kinds.
- [x] `runtime`: open rooms collide without rendering, blocks render and collide, a block door is
  reached rather than passed through, and `blueprint()` carries the blocks. The overlay is now centred
  on the player at a scale taken from the room they are in, so discovery slides the map instead of
  rescaling it. Outdoor instances get a sky instead of the indoor black.
- [x] `city-planner` rebuilt around a block lattice: one open ground room, building masses with a full
  street between any two, a door on each mass, a spawn in the street and a gate in the boundary. The
  corridor-street solver it replaces is gone.
- [x] `scenario-creator` proves open ground: blocks inside their room, no two overlapping, block doors
  on their own face, and every door walkable, by flooding the open floor (`src/walkable.js`). A portal
  graph cannot see a building parked across an approach; this can.
- [x] `building-planner`: four storeys or more gets a lift instead of stairs.
- [x] DoD met: `npm test` = 278 local tests, 50 schemas, and the page verified in a real headless
  browser: open streets between building masses under a sky, the overlay reading as a city map, the
  console silent.

## Phase 16 - Look and feel, and the skill's authoring surface [ ]

Reference: `~/Pictures/Screenshots` (a three.js street: wet reflective road, emissive signs, video
billboards, bloom, fog, lit windows, awnings and balconies, a HUD in the corner). Take the technique,
not the saturation. No rain; standing water optional.

Ordered so each step is one box and lands green.

### 16a - Authoring surface (generator + contracts) [x]
- [x] **Inaccessible buildings.** A mass with no door and no `LotPlan`: never a map node, so the gate
  never waits on it. `CitySpec.accessibleRatio` seals a share of them, `buildings[].accessible: false`
  seals a chosen one, and one building always opens.
- [x] **Per-lot overrides.** `CitySpec.buildings[]` pins a premises by `{ block, slot }`: label,
  program, floors, accessible, quest. The block is split into enough premises to hold the slot, and
  everything unpinned is generated around it. Every seeded choice moved into `city-planner/src/premises.js`,
  leaving `src/index.js` as plain assembly.
- [x] **Quest placement.** `LotPlan.quest { itemId, floor? }`: `building-planner` places the named item
  on that floor (the top one by default) and makes finding it that floor's goal, while every other
  floor keeps its own token. Fixed alongside: a caller-supplied `goalFor` that returned nothing for a
  floor left that floor with a goal whose item was never planted.
- [x] **Checkpoints.** `tools/level.js save --in city.json --name ashgate` / `load --name ashgate`,
  over the export/import `persistence` already has, validated before writing. Plus `city --spec
  <file>`, so an author (or an agent) hands the toolkit a whole `CitySpec` and flags override it.
- [x] DoD met: `npm test` = 291 local tests. `tools/checkpoints.test.js` drives the real command line
  as a process: a spec file builds the city it describes, the quest item exists exactly once on the
  floor asked for, and a checkpoint round trips unchanged.

### 16b - Surfaces (own geometry, own textures) [x]
- [x] `layers/surfaces/` is its own box, not part of the runtime: it paints asphalt, paving, plaza and
  concrete as tiling sheets, and a building's whole outside as one sheet (a window per storey per bay
  in a seeded lit/dark mix, a ledge under each storey, a glazed shopfront, a parapet). It draws onto a
  canvas the caller hands it and imports no three.js and no DOM, so it is proved with a recording stub.
- [x] `runtime/src/surface-materials.js` wraps them onto the scene: repeat computed from the metres a
  tile covers, sRGB colour space on both the albedo and the emissive, a facade per building on all four
  sides with the bays the same width whichever way you look, and disposal when a scene is torn down.
  No painter injected, flat colours, which is what a head-less test sees.
- [x] A mass carries its `floors` and `program` (additive on `persistence/schema/room.json`), so its
  outside can be dressed to suit.
- [x] Fixed: a quarter-block premises could be given an `office` room plan that does not fit in it, so
  some seeds threw `LOT_PLAN_INVALID` in the browser. `building-planner.programFits` is now public and
  injected into `city-planner`, which only offers a mix that fits and rejects a pinned one that does
  not. `tools/compose-city.test.js` builds every size at 30 seeds.
- Ledges, shopfront and parapet are PAINTED here. Modelled relief (balconies, awnings, signs standing
  off the wall) is 16d.

### 16c - Lighting (its own runtime module) [x]
- [x] `runtime/src/lights.js` is the night rig: a hemisphere and a low moon for the sky, plus a pool of
  six real point lights that follows the player and lands on whichever authored lights are nearest. A
  street holds forty; a forward renderer will not. The rest are still there to look at, as glowing
  geometry that costs nothing.
- [x] Light is DATA (`room.lights[]`, additive on `persistence`): `street_lamp` on the pavement, `sign`
  over a front door, `ceiling` in a room. `city-planner` puts a lamp on each side of every block and a
  sign over every door; `building-planner` gives every room a lamp overhead. Placement is the
  generator's; height, colour and how many burn at once are the renderer's.
- [x] ACES tone mapping with exposure, exponential fog the far end of the street fades into (a darker,
  denser one indoors), and **bloom** through `EffectComposer` -> `UnrealBloomPass` -> `OutputPass`. A
  head-less test gets a stub renderer and draws straight through, so none of it needs a GPU to test.
- [x] A sign burns the colour that building's own front is painted: `surfaces` returns the shopfront's
  `signColour` and the rig tints the light and the plate with it.
- [x] `CitySpec.wet` (0 to 1, default dry, and it never rains): wet asphalt goes darker, holds standing
  water, and comes back smoother, so the lamps reflect down it. `--wet` on the toolkit, `?wet=0.8` in
  `npm run dev`.
- [x] DoD met: `npm test` = 311 local tests, `npm run build` clean, and the page verified in a real
  headless browser, outdoors and in: a lamp-lit street with signs glowing into the haze, a lit interior
  behind a door, console silent.

### 16d - Facade parts, real doors, and places with names [x]
- [x] `layers/facade/` is its own box: give it the shape of a building and it returns what is bolted
  to it, in the building's own frame. One function per part in `src/parts.js` (balcony, awning,
  cartel), what places are called in `src/naming.js`, and `src/index.js` deciding which building gets
  what. No three.js, no DOM.
- [x] Carteles carry LETTERS: `surfaces` paints a sign (`src/sign.js`) with the name on the board and
  the same name in the emissive map, so the type is what burns. A tall building also gets a blade
  sign at right angles to the wall.
- [x] Doors are built, not painted: a surround proud of the wall, a leaf set back in it, a handle and
  a step (`runtime/src/doorways.js`). An interior doorway is a real hole, so it gets the surround only.
- [x] You come out of the front door you went in by: `link.spawnAt` / `link.facing` (additive on
  `persistence`), supplied by `city-planner` as `LotPlan.returnAt` and put on the leave door by
  `building-planner`. It used to drop you at the middle of the room it named, which on open ground is
  the middle of the city.
- [x] A building's front is painted to FIT its walls: one sheet for the wide sides, one for the narrow
  ones, a whole number of bays across each. Nothing tiles.
- [x] A wet road is a mirror under thinned asphalt (`Reflector`), so the lamps and the signs come back
  up the street.
- [x] Names hang over NPCs; what they say goes in one dialogue panel at the bottom of the screen.

### Still open
- Video billboards (`VideoTexture` on a cartel), and per-building bespoke textures an agent authors
  by hand rather than by seed.
- GLB props: cars, bikes, people, traffic lights. The city fabric stays ours.

Definition of done for the phase: `npm run dev` reads as a street at night rather than boxes, every
step keeps `npm test` green and the contracts true, and an agent can build a city, pin one building
in it, and save the result by name.

## Phase 17 - The city Hector asked for [ ]

Everything still open, in the order it is worth doing. Raw asks are in `docs/REQUIREMENTS.md`; the
look reference is `~/Pictures/Screenshots` plus SynthCity (https://github.com/jeffbeene/synthcity,
MIT, so its code and models may be used) and https://threejspunk.vercel.app (the street-level one).

The technique agreed with Hector: OUR shapes, THEIR method. A small library of shapes and parts,
swappable texture sets per building, seeded per instance. Not downloaded city meshes.

### 17a - The run, and how an LLM writes it
- [ ] **Six or seven places, spread out.** A generated city puts far too many doors on the map. Cap
  the real places and space them across the blocks (one per block at most, and prefer blocks far
  apart), so a run is a walk between landmarks rather than a street of doors. `city-planner`.
- [ ] **A marker on the map** pointing at the next place to go. `runtime/src/blueprint-hud.js` plus
  whatever `map-state` has to say about which node is next.
- [ ] **Custom buildings only where a place is real.** The named places get our full treatment (real
  door, real rooms behind it); everything else is scenery and never builds an interior. Mostly true
  already; make it explicit and cheap.
- [ ] **All of it parameter-driven**, so a prompt is "eight blocks, six places called X..Z, wet 0.4"
  and nothing else has to be touched. `CitySpec` covers most of this; finish it and document it in
  `SKILL.md` as the one thing an LLM writes.

### 17b - Variety in the parts
Today there is one window, one door, one balcony, one lamp. The reference has dozens.
- [ ] Window types: ribbon, tall, square, bay, shopfront-glazed. Per building, from the seed.
- [ ] Door types: shopfront, flush, recessed, double, roller shutter.
- [ ] Balcony types: slab, cage, corner, French.
- [ ] Street lamp types, and lamps on the buildings as well as the pavement.
- [ ] Sign mountings: fascia, blade, roof box, projecting frame.
- [ ] **The advert words look bad.** Random names on giant panels read as nonsense; give them a
  vocabulary that looks like a city (a trade, a district, a product) or drop the lettering for
  graphics on most of them.

### 17c - Alive
- [ ] **Holograms.** The reference has a figure projected on a building. A `VideoTexture` (or a
  seeded animated canvas) on an advert panel, plus a haze cone so it reads as projected.
- [ ] **Elevated rails / train paths** threading between the towers, with something running on them.
- [ ] **Travel.** A city big enough to feel like one is too big to walk. A ride you board that moves
  you along the street at passenger height, with the controls handed over: it reuses the runtime's
  position and yaw, and it fits the game (go somewhere, talk, leave).
- [ ] GLB props where they earn it: cars, bikes, people, traffic lights. The city fabric stays ours.

### 17d - Surfaces and grade
- [ ] **Pavements in the cyan material** from the reference; the asphalt stays as it is (Hector likes
  it).
- [ ] Per-building facade texture SETS, swapped by seed, so two buildings never wear the same wall.
- [ ] Finish the atmosphere pass: the reference is violet haze plus light shafts plus a grade. Height
  fog and emissive-only bloom are in; shafts and grading are not.

### 17e - The game
- [ ] **The NPC dialogue UI**, styled like the menu in the reference (a panel with choices), not the
  plain line at the bottom of the screen it is now. `runtime/src/labels-overlay.js` is where the
  panel lives today.
- [ ] Interiors are empty rooms. Hector said not to worry yet; furniture is what makes them places.

### 17f - Housekeeping
- [ ] The reorganisation pass Hector asked for: every box lean, `CONTRACT.md` true, `docs/INDEX.md`
  current. `runtime/` has grown a lot of files (surfaces, lights, traffic, doorways, facade-parts,
  massing) and some of them may want to be their own box.
- [ ] Keep modernising: `BatchedMesh` for the varied geometry (tiers, bands, doors) now that the
  renderer is WebGPU, and KTX2 for the CC0 materials.

### Done in this phase already
- WebGPU renderer with automatic WebGL2 fallback, node post-processing, bloom taken from the
  emissive buffer only, exponential height fog.
- The city's facade parts drawn in one pass instead of per building; the skyline wearing one painted
  sheet per tower. Scene meshes 3614 -> 708.
- Buildings as stacks of tiers from a shape library, standing tall, with storeys and playable floors
  as separate numbers.
- Windows, adverts, neon, doors and signs as objects with their own materials.

## Compaction points

Good places to compact the working context: end of Phase 0 (design locked), end of Phase 1
(contracts + schemas frozen), and the end of each subsequent phase. The phase's DoD list plus the
updated docs are a complete handoff.
