# 05 - Gamentic lineage (what we inherit, what we change)

duplexity-3d is the 3D sibling of gamentic. Gamentic is a self-hosted, browser-based AI dungeon
RPG where one local LLM plays every role (narrator plus each NPC) through purpose-built contexts,
and every world change passes through a validated tool that writes to SQLite (the single source of
truth). It is 2D and text-first. This doc records exactly what carries over and what has to change,
so we do not relearn gamentic's hard-won lessons or re-inherit its 2D assumptions by accident.

## Inherit almost verbatim (the conceptual core)

- **Validated-mutation doctrine.** The model changes nothing except through a registered tool with
  a JSON schema and a deterministic handler; "a field the schema does not describe does not exist."
  In gamentic the handler contract is `(conn, gid, args, actor) -> {kind, text, cue, reactions}`.
  We keep the doctrine: every LLM state change is schema-constrained and validated on apply. See
  [02-ARCHITECTURE.md](02-ARCHITECTURE.md) cross-cutting doctrines.
- **Narrator-as-engine + NPCs-as-cued-agents.** Gamentic's narrator advances an explicit state
  machine and never voices a character; it cues each NPC, which then runs as its own agent with
  only its own persona, private knowledge, and the beats it personally witnessed. We keep this
  split: narrator orchestrates; each NPC reasons from its own self-context.
- **Provider adapters (swap any model by config).** Gamentic resolves text/audio/image providers
  per modality from env, with deterministic capability degradation. We keep a per-modality adapter
  layer so local GGUF vs cloud is a config switch.
- **NPC data model + memory.** Port the useful fields: identity/persona/knowledge (private),
  appearance, disposition (a tiny 3-4 value mood enum), relation (free-text bond), following,
  alive/present, life, inventory, traits (unlocked through play), moments (pivotal shared events),
  and a private folded `memory_summary`. Keep the private "whisper" chat channel as the simple
  chat model.
- **Finite vocabularies as enforced enums.** Dispositions, statuses, difficulties, and (for us)
  NPC modes and goal types are deliberately tiny closed sets, enforced both in code and as JSON
  Schema enums, so a small local model stays constrained.
- **Deterministic voice-design composer + emotion tags.** A voice identity is a natural-language
  description string composed deterministically from a hash of the character id (gender/age/pitch/
  pacing/accent from spaced pools, with an exclude set so a cast sounds distinct), plus an
  emotion-tag translator. This is cheap, portable, and provider-agnostic. Keep it.
- **The resolver / thin-harness-fat-skills module convention.** Gamentic uses `INDEX.md` resolver
  files per module ("find the thing you want to change, go straight to the file that owns it"). We
  extend this with explicit per-layer `CONTRACT.md` + `schema/` (params in, params out), which the
  raw brief specifically requires.
- **Turn-hardening lessons.** Even though 3D moves most movement to the client, keep the wisdom for
  the interaction turn: deterministic pre-checks before the model, default-accept of queued valid
  attempts, output scrubbers/stop-sequences so a small model does not emit tool syntax as prose,
  dedup of repeated calls, and end-of-turn asserts (e.g. player at 0 life => lost regardless of
  what the model wrote).

## Change for 3D (the real departures)

- **World generation becomes geometric and up-front.** This is the single biggest change. In
  gamentic a "scene" is a text key with free-text `exits[]`, furnished lazily on arrival ("NEW
  PLACE" protocol); a 2D text game can conjure a room on demand. A 3D engine cannot: it needs
  explicit geometry before you enter (room layouts with positions/sizes, portals with coordinates
  and alignment, spawn points, navmesh/collision, object transforms). Our `scenario-creator` layer
  exists precisely to emit and validate that geometry. The exit graph becomes a real, validated
  scene graph. See [02-ARCHITECTURE.md](02-ARCHITECTURE.md) and Phase 4 in
  [03-MILESTONES.md](03-MILESTONES.md).
- **Two phases with a hard seam.** Gamentic resolves the world continuously, one REST turn at a
  time, creating scenes lazily. We split into author-time (build the whole Adventure as data) and
  play-time (run it deterministically, call the LLM only on interaction). This is what keeps a 3D
  scene smooth and token cost bounded. See [01-INTERPRETATION.md](01-INTERPRETATION.md).
- **Rendering: three.js, not 2D image cards.** Gamentic renders scene art, character 3-view
  reference sets, and item cards with FLUX in ComfyUI, morphing a DOM frontend. We render a live
  three.js scene; character portraits become 3D avatars; "look" collapses from generating a 2D
  image to just the camera plus optional narration/discovery triggers.
- **Movement is client-side and continuous.** Gamentic's tagged-segment turn (say/do/attack/give/
  whisper/look) is text-paced. We keep the sequential "one request = one resolved beat" loop ONLY
  for dialogue and consequential actions; walking, looking, and following are deterministic on the
  client and never hit the backend.
- **Voice simplified.** Gamentic runs a Maya1-3B GGUF sidecar with SNAC codec CPU decode and
  sliding-window streaming (~40% of the voice code). Drop that; point the audio provider adapter at
  a hosted or lighter local TTS. Keep the cheap, portable parts (voice-design composer, emotion
  tags, per-adventure asset ownership/cleanup). Add 3D positional audio.
- **Progression made explicit.** Gamentic has no discrete stage machine; progression is continuous
  SQLite state. We use an explicit, machine-checkable goal per instance and a progression graph the
  narrator authors once, so "advance to the next stage" is a local graph read, no model in the loop.

## Gamentic stack, for reference (shared AMD box)

- Frontend: vanilla ES modules, no build step, nginx, DOM-morph. (We replace with a three.js app +
  bundler.)
- Orchestrator: FastAPI + stdlib `sqlite3` (WAL, no ORM) + httpx, Python 3.12. One `llm.chat()`
  client, no agent framework; agents differ only by messages/tools. (We can keep this shape.)
- Local text model: an uncensored finetune of Gemma 4 26B-A4B (MoE, ~4B active), Q4_K_M GGUF, on
  llama.cpp Vulkan (Strix Halo), 128K context, OpenAI-wire-compatible.
- Image: FLUX.2 [klein] in ComfyUI (ROCm) behind a REST adapter. Voice: Maya1-3B GGUF + SNAC.
- The `gamentic-anna` variant proves the seam: same brain byte-for-byte, only the invocation edge
  (Anna iframe/Executa) and the model edge (Anna reverse-RPC) swapped. That "stable brain,
  replaceable edges" property is exactly what duplexity-3d clones, with the presentation/generation
  edge becoming a 3D engine.
