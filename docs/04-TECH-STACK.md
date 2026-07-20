# 04 - Tech Stack (mid-2026, researched and fact-checked)

Result of a 7-domain web survey with an independent adversarial fact-check per domain (all seven
returned "high" confidence). Every load-bearing choice below is permissively licensed,
three.js-native or local-AMD-capable, and plugs in behind exactly ONE layer's contract, so a wrong
bet changes one folder, not the architecture. Sources are linked inline.

## Headline verdict: kits-first, generation optional

Build the entire playable engine on curated **CC0 asset kits** that already ship rigged, animated,
glTF/GLB characters and props on a shared skeleton. Treat ALL AI 3D generation as the optional,
async enrichment the `asset-gen` layer already isolates. The two pieces most likely to be rewritten
as models improve (scenario-creator and the NPC brain) are the only LLM callers, at their
respective phases, matching the author-time/play-time split.

## The stack, per layer

| Architecture layer | Choice | License | Local on gfx1151? |
|---|---|---|---|
| `asset-registry` + `runtime` (source) | Kenney + KayKit + Quaternius CC0 kits; Poly Pizza v1.1 REST API (filtered `license=CC0`) as the live catalog | CC0-1.0 | Yes, static files, zero GPU |
| `runtime` (in-scene text) | troika-three-text wrapped in a reusable NpcLabel/SpeechBubble rig; @pmndrs/uikit for rich panels/HUD | MIT | Yes, browser WebGL |
| `runtime` (movement) | recast-navigation-js + @recast-navigation/three: runtime navmesh + Detour + Crowd steering | MIT | Yes, WASM in browser |
| `runtime` (animation) | three.js AnimationMixer crossfading each kit's own clips on its native shared skeleton; NO runtime retargeting | MIT / CC0 clips | Yes, browser WebGL |
| `scenario-creator` (layout) | LLM emits an abstract room-adjacency graph (grammar-constrained); deterministic geometry solver + validator + regenerate-on-reject | project code atop MIT/ISC libs | Yes |
| cross-cutting `providers/text` | Local GGUF via llama.cpp, grammar-constrained JSON output (GBNF from JSON Schema) | MIT | Yes, Vulkan (RADV), no ROCm needed |
| `npc` (brain) | Small local GGUF instruct model (Qwen3-series A3B MoE Q4_K_M; a 3B-8B instruct fallback) called only on interaction | Apache-2.0 (Qwen3) | Yes |
| `asset-gen` (optional) | TRELLIS.2-4B via ComfyUI ROCm fork (GGUF Q4) + UniRig rigging + meshopt decimation; API generator (Tripo/Meshy) as hosted fallback | MIT (TRELLIS.2, UniRig code) | Viable but UNPROVEN on gfx1151 |

## Per-layer detail (with the fact-check corrections folded in)

### Asset kits (primary content) -> `asset-registry`
- **Kenney, KayKit, Quaternius, all CC0** (public domain, commercial, no attribution, no revenue cap,
  no region limit). KayKit characters ship ~161 humanoid animation clips; Quaternius ships a
  Universal Animation Library on a shared humanoid rig, so characters arrive rigged AND animated on a
  common skeleton, which removes the runtime-retargeting problem entirely.
- **Poly Pizza v1.1 REST API filtered to `license=CC0`** is the scenario-creator's live, queryable
  catalog (this is the concrete backing for the `asset-registry.query` contract).
- **AVOID Synty**: proprietary EULA whose generative-AI and metaverse clauses make raw-GLB streaming
  to a browser a real license risk.
- Loading: KayKit and most Kenney kits are native GLB (drop straight into `GLTFLoader`); Quaternius
  and some Kenney packs need a one-time FBX-to-GLB / repack (gltf-transform or Blender), or pull the
  Quaternius GLBs from the Poly Pizza mirror. Normalize scale/handedness on import into
  `asset-registry` (exporters differ).
- Rendering primitives: `InstancedMesh` for identical repeated pieces, `BatchedMesh` for mixed
  geometry in one draw call. Correction: `BatchedMesh` is in three.js core since **r159** (not r156).
- The offline-manifest + constraint-solver + navigability-repair pattern is grounded in Xu and
  Verbrugge, AAAI AIIDE-25 (arXiv 2508.18533).
- https://kenney.nl/assets/category:3D , https://kaylousberg.itch.io/kaykit-character-animations ,
  https://quaternius.com/ , https://poly.pizza/

### In-scene NPC text (speech bubbles, labels) -> `runtime`
- **troika-three-text** (npm 0.52.4, MIT, active, last commit 2026-04-12). Renders real SDF geometry
  that depth-tests in the WebGL scene (correct occlusion behind geometry, which no HTML/CSS2D overlay
  can do), stays antialiased at any distance, and shares one glyph atlas across all NPCs so hundreds
  of labels stay cheap. Wrap it once in an `NpcLabel`/`SpeechBubble` rig (auto-billboard, auto
  z-offset, frustum + distance culling) so a bubble is declarative data (`label.text = utterance`),
  not per-NPC code.
- **@pmndrs/uikit** (npm 1.0.74, MIT) for rich declarative dialogue/HUD panels. It is the maintained
  successor to the effectively-dead three-mesh-ui (last commit 2023-03).
- Keep ALL in-world text in WebGL; reserve DOM/CSS2D overlays for the screen HUD only.
- Corrections: three-msdf-text-utils is ISC (not MIT); three-msdf-text 2.0.0 has no declared license
  (treat as all-rights-reserved). If the runtime later moves to WebGPU/TSL, swap troika for an MSDF
  text path behind the same `NpcLabel` blackbox.
- https://github.com/protectwise/troika/tree/main/packages/troika-three-text

### NPC movement / pathfinding -> `runtime`
- **recast-navigation-js + @recast-navigation/three** (MIT, v0.43.0, still newest in mid-2026). It is
  the only option that BOTH builds a navmesh at runtime (`generateTiledNavMesh`, needed because the
  scenario-creator's rooms are generated) AND queries it (Detour). Its `Crowd`/`CrowdAgent` is a
  single subsystem covering walk-to-point, follow-entity (re-target per frame), and inter-agent local
  avoidance; off-mesh connections cover portals/ladders. Pure client-side JS+WASM, no GPU, runs in the
  browser on the AMD box (await the WASM init).
- Alternatives: `navcat` (same author, MIT, v0.4.1) for a no-WASM / tree-shakeable build (bring your
  own agent stepping); `three-pathfinding` if you already have a static navmesh; `yuka` is dormant
  (mine it for steering/FSM concepts only).
- Drive the deterministic NPC modes (`move_to/follow/patrol/flee/wander`) from Crowd agents; derive
  the idle/walk/attack animation state from `CrowdAgent` velocity.
- https://github.com/isaac-mason/recast-navigation-js
- **Phase 3 status:** the runtime ships a pure, node-testable **portal-graph router** (`nav.js`):
  rooms are nodes, portals are edges, and a path is the straight run to each doorway centre in turn.
  It routes NPCs through doorways with no WASM and no navmesh, so the whole NPC sim stays
  deterministic and testable. recast-navigation-js (checked mid-2026 at `@recast-navigation/three`
  0.43.1, `threeToSoloNavMesh(meshes, cfg) -> { success, navMesh }`) is the planned browser upgrade
  behind the same `nav.findPath(from, to) -> waypoints[]` seam. It is deferred until real generated
  GLB geometry exists (a navmesh baked from placeholder boxes over the hand-authored 3-room fixture
  would add a WASM dependency with nothing testable to gain yet).

### NPC animation -> `runtime`
- **three.js AnimationMixer + AnimationAction** crossfading between clips keyed to the NPC mode
  (three.js r185 current; API stable). Deliberately **avoid runtime `SkeletonUtils.retargetClip`**:
  it is widely reported fragile (inverted feet, backward hands, proportion drift). Because the CC0
  kits already share one humanoid rig with a matching clip set, the engine maps mode -> clip name with
  zero retargeting. Mixamo is a design-time source only (bake/convert offline), never a runtime
  retarget.
- Controllers: `ecctrl` 2.0.0 (MIT, Rapier peer) for the physics/input-driven PLAYER; `BVHEcctrl`
  (MIT, physics-free BVH collision) is lighter for navmesh-driven NPCs whose position already comes
  from the Crowd agent. In R3F, drei `useAnimations` is the idiomatic wrapper.

### World layout (the hard one) -> `scenario-creator`
- The verified pattern, which strengthens the architecture's validated-mutation stance: **the LLM
  authors ONLY a small abstract room-adjacency graph; deterministic code owns ALL geometry AND
  topology verification.** The PlanQA benchmark (arXiv 2507.07644) shows LLM topological AND geometric
  reasoning both below 50% while metric queries exceed 95%, so never trust the model with coordinates
  or connectivity, only with the abstract graph.
- Deterministic geometry toolkit: Delaunator (ISC) + separation steering + MST + re-added loops + A*
  (the TinyKeep / VAZGRIZ dungeon method), graphology (MIT) for connectivity/reachability proofs,
  ndwfc (MIT, wave-function-collapse) and rot-js (BSD-3) for local detail/fallback, WebCola
  `avoidOverlaps` (MIT) plus Holodeck-style constraint solving for intra-room object placement.
- Validate against the layer invariants (no overlaps, full connectivity, portals aligned on both
  walls, goal reachable) and regenerate on reject. Define a grammar-guaranteed simple fallback layout
  so instance creation never hard-fails.
- **Phase 4 status:** shipped a deterministic **grid-packing solver** in `scenario-creator/src`. The
  injected `graphGen` (the LLM stand-in) emits the abstract graph (`room-graph.json`, topology only);
  the solver packs rooms onto a uniform integer grid so every adjacency is a shared full wall and each
  doorway coincides exactly with a wall of both rooms, which is what the runtime needs to cut a
  walkable opening. Float-positioned organic layouts (Delaunay + separation-steering + MST) make that
  plane coincidence fragile, so they are deferred behind the same `RoomGraph -> Instance` seam until
  real generated GLB geometry justifies them. Connectivity is guaranteed by a union-find repair pass,
  goal reachability by construction, and a straight-chain fallback keeps creation from hard-failing.
  The validator (`validate.js`) re-proves all four invariants independently of the solver.

### Structured output (the enforcement mechanism) -> cross-cutting, `providers/text`
- Both the scenario-creator (layout graph) and the npc brain (decision) constrain generation with a
  **GBNF grammar auto-generated from the layer's JSON Schema**, so the model physically cannot emit an
  off-contract object. This IS the validated-mutation doctrine at the sampling level.
- Two viable runtimes behind the `providers/text` adapter:
  - **node-llama-cpp** (MIT, v3.19.0): bundles llama.cpp with Node bindings, **Vulkan by default** (so
    it runs on gfx1151 with no ROCm dependency), and `createGrammarForJsonSchema` enforces the schema
    in-process during generation. Safer for grammar enforcement, simpler deploy.
  - A **standalone llama.cpp server** (RADV Vulkan) with GBNF grammars: better for parallel slots, KV
    prefix-cached personas, and hot model swap.
- Either way: **do NOT rely on the llama-server `response_format: json_schema` path** and always
  deterministically re-validate the returned object against the schema before applying it. Reason: a
  real fail-open defect (llama.cpp issue #19051, closed not-planned) where, if schema-to-grammar
  conversion succeeds but grammar parse fails, the server generates UNCONSTRAINED and still returns
  HTTP 200. Grammar-object enforcement + post-validate closes that hole.
- Known GBNF/json-schema gaps to design around: `additionalProperties:false`, integer-only min/max,
  no nested `$ref`, and `^...$` patterns are unsupported; shape schemas to avoid them or enable the
  LLGuidance backend. Zod 4.0 (stable May 2025) `z.toJSONSchema` authors the schemas; Ajv re-validates
  on the hot path (roughly ~7x faster than Zod v3; v4 narrows it).
- https://node-llama-cpp.withcat.ai/guide/grammar

### NPC brain + local LLM runtime -> `npc`, shared by `interviewer` / `narrator` / `scenario-creator`
- Two layers, per the verified pattern: (1) a per-tick deterministic FSM/behavior-tree/GOAP owning
  locomotion/combat/animation that executes the current mode; (2) a **stateless** local-LLM call fired
  only on discrete interaction triggers, returning a validated JSON delta
  `{new_mode, target, utterance, emote}` (extensible with `params`, `memory_write`, `ttl_s`). The mode
  enum is the single narrow interface; the game stays fully playable (keep-current-mode) if the model
  is slow or offline, so the LLM is pure enhancement.
- Runtime: one shared llama.cpp server on the **RADV Vulkan** backend (Vulkan outperforms ROCm/HIP on
  gfx1151 in mid-2026; if using ROCm, set `HSA_OVERRIDE_GFX_VERSION=11.5.1` and `HSA_ENABLE_SDMA=0`).
  Cache the static persona as a KV/prefix prompt. After decode, hard-validate `new_mode` in
  `allowedModes`, `target` in the real entities, and clamp params (the paper's SchemaOK/PermOK/RuleOK).
- Model: a Qwen3-series A3B MoE (Apache-2.0) Q4_K_M is a strong default (~45 t/s single-user on Strix
  Halo, good JSON/function-calling); a 3B-8B instruct model is the lightweight fallback. GGUF matches
  the box's stated preference over fp8. NVIDIA ACE is a design-pattern reference only (RTX-only, cannot
  run on AMD). Borrow Stanford generative-agents' bounded-observation + memory idea, never its per-tick
  call frequency (its successor runs 1,052 agents).
- https://strixhalo.wiki/AI/llamacpp-with-ROCm

### AI 3D asset generation (optional, async) -> `asset-gen`
- **TRELLIS.2-4B** (Microsoft, MIT, Dec 2025) is the highest-fidelity open PBR image-to-3D under a
  clean license (no region or revenue limit) and the only current-SOTA model with an end-to-end-proven
  AMD ROCm + ComfyUI path (toastmanAu/trellis-2-rocm-comfyui, GGUF Q4). Four independent stages, none
  on the play path: generate -> texture -> retopo (gltf-transform/meshopt decimation; MeshAnything V2,
  MIT, only for sub-1600-face props) -> rig (UniRig, MIT code; verify the HF checkpoint license).
- Alternatives by need: Hunyuan3D-2.1 is the best open PBR generator BUT its Tencent Community License
  excludes the EU, UK, and South Korea (hard blocker if those markets matter); SF3D/SPAR3D give the
  cleanest low-poly UV-unwrapped PBR (near drop-in) but under Stability's Community License with a
  US$1M revenue cap.
- Hosted fallback for rig-ready hero characters (only the API tier gives quad topology + auto-rig +
  T/A-pose today): Tripo / Meshy / Rodin, behind the same `providers/gen3d` adapter.
- https://github.com/toastmanAu/trellis-2-rocm-comfyui , https://github.com/microsoft/TRELLIS.2

## Local 3D generation verdict (the gfx1151 reality)

Viable but **unproven on Strix Halo gfx1151 specifically**, so it stays behind the optional `asset-gen`
blackbox, never on the critical path. Every working AMD 3D pipeline was validated on discrete RDNA3
(gfx1100 7900 XTX, gfx1102 7600 XT), NOT on gfx1151. kyuz0's toolboxes prove ComfyUI + ROCm runs on
gfx1151 for image/video gen, but no source shows the six custom HIP kernels (nvdiffrast OpenGL backend,
custom_rasterizer, o_voxel, cumesh, nvdiffrec_render, flex_gemm) built and running on gfx1151. Bringing
it up is a real build-and-debug spike: rebuild those kernels for gfx1151, provide a headless GL context
(EGL/GBM or Xvfb), and accept ~1.5-5 min per mid-res asset and ~8-15 min per high-res PBR asset because
the APU's ~215-256 GB/s unified memory is ~4x below a 7900 XTX. The 96GB unified memory removes any VRAM
ceiling; kernel compatibility and bandwidth are the constraints. Default to GGUF quantization everywhere.

Plan: (1) PRIMARY = curated CC0 kits, engine fully playable from these alone; (2) OPTIONAL async = local
TRELLIS.2 GGUF Q4 via ComfyUI as a budgeted spike; (3) FALLBACK for rig-ready hero assets where offline
is not required = an API generator behind the same adapter.

## Risks

- gfx1151 3D-generation port is unproven (see verdict). Mitigated by keeping gen optional/async and
  shipping on kits.
- The llama-server `response_format:json_schema` fail-open (issue #19051) would silently break the
  validated-mutation doctrine. Mitigation is in the stack: grammar objects + deterministic re-validate.
- ROCm on gfx1151 is nightly/community (kernel 6.19.x misidentifies gfx1151 as gfx1100; needs the HSA
  overrides). Prefer Vulkan for the LLM runtime; pin working image digests.
- Strix Halo memory bandwidth caps LLM t/s and any local gen time. Fine for sparse NPC calls and
  author-time batches; interactive high-res local gen is impractical.
- Kit visual coherence: constrain the scenario-creator to one kit family per instance theme; normalize
  scale/orientation on import.
- Rig fragmentation: the no-retargeting strategy holds only while every character shares the kit rig.
  Gate any generated/third-party character behind an offline bake/retarget step, never runtime.
- troika is WebGL-first; a future WebGPU move needs an MSDF text path behind the same `NpcLabel` blackbox.

## Open questions (resolve at build time, not now)

- Which single Qwen3-series A3B checkpoint is current/best on gfx1151 (guides mention both 3.5 and 3.6
  35B-A3B). Benchmark the latest Apache-2.0 A3B GGUF Q4_K_M for single-user t/s and JSON-schema adherence
  before pinning the `npc-ai` default.
- Embed the model in-process (node-llama-cpp, safer grammar, simpler deploy) vs a standalone llama.cpp
  server (parallel slots, hot swap). Decide by how many concurrent author-time instances run.
- Confirm UniRig's HF checkpoint license for commercial use, and whether its output rig matches a kit
  skeleton well enough to reuse kit clips or needs its own clip set.
- Retry budget + deterministic fallback for the world-layout regenerate loop so instance creation never
  hard-fails.
- Bake navmeshes at author-time into the Adventure document vs rebuild per instance-load at play-time.
  Measure `generateTiledNavMesh` on representative multi-room layouts.
- Whether the offline/local requirement rules out the API `asset-gen` fallback entirely.
- WebGLRenderer vs WebGPURenderer/TSL, which decides troika vs an MSDF text path long-term.
