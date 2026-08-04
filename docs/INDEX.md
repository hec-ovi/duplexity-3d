# INDEX (the dispatcher)

Read this first. It routes you to the ONE folder you need to open for a given change, so you
never load the whole codebase. This is the "resolver" in the thin-harness-fat-skills sense (see
[CONTRACT-CONVENTION.md](CONTRACT-CONVENTION.md)).

## Design docs (read in order once)

| Doc | What it gives you |
|---|---|
| [00-RAW-IDEA.md](00-RAW-IDEA.md) | The vision in Hector's words. Intent, source of truth. |
| [01-INTERPRETATION.md](01-INTERPRETATION.md) | How that vision becomes a system + vocabulary. |
| [02-ARCHITECTURE.md](02-ARCHITECTURE.md) | The layers, the data flow, the Adventure document. |
| [03-MILESTONES.md](03-MILESTONES.md) | Phases, in build order. Where we are, what is next. |
| [04-TECH-STACK.md](04-TECH-STACK.md) | The researched 2026 tooling per layer. |
| [05-GAMENTIC-LINEAGE.md](05-GAMENTIC-LINEAGE.md) | What we inherit from gamentic vs what changes. |
| [CONTRACT-CONVENTION.md](CONTRACT-CONVENTION.md) | The isolation rule every layer obeys. |

## "I want to change X" -> open this layer

| If your task touches... | Open only this folder |
|---|---|
| The 3D world rendering, camera, controls, HUD frame drawing | `layers/runtime/` |
| NPC movement, pathfinding, animation, deterministic behavior modes | `layers/runtime/` (behavior) + `layers/npc/` (definitions) |
| Speech/chat bubbles or name labels above NPCs in-scene | `layers/runtime/` |
| What an NPC says / does when the player interacts (mode switch, dialogue, the model seam) | `layers/npc/` |
| NPC data model (personality, body, allowed actions, memory, voice design) | `layers/npc/` |
| Turning an NPC line into speech, or a spoken player turn into text (TTS/STT, emotion tags) | `layers/voice/` |
| How rooms/doors/positions are laid out and validated | `layers/scenario-creator/` |
| Streets, blocks, front doors, the entry point and the exit gate | `layers/city-planner/` |
| Floors behind a door, room mixes, stairwells, houses | `layers/building-planner/` |
| How many instances, goals, progression graph, adventure planning | `layers/narrator/` |
| What the run has unlocked/cleared, whether the exit gate opens, what the map overlay may reveal | `layers/map-state/` |
| The onboarding interview / creative brief / skip flow | `layers/interviewer/` |
| Saving, loading, export, import of an adventure | `layers/persistence/` |
| The Adventure document schema (the wire format between phases) | `layers/persistence/schema/` |
| The menus, adventure browser, new/import/export screens (app chrome) | `layers/ux-shell/` |
| The catalog of usable 3D pieces (kit parts, generated assets) | `layers/asset-registry/` |
| Generating or enriching 3D assets (ComfyUI / API) | `layers/asset-gen/` |
| Swapping a text LLM / TTS / image model provider | that layer's `providers/` adapter (config) |
| The `POST /adventure` author, `POST /interaction` brain, or `GET/POST` export/import routes | `server/` (backend composition root) |
| The playable three.js slice wiring (the play-time entry) | `app/` (frontend composition root) |

| Generating a level from the command line (the agent-facing toolkit) | `tools/` |

`app/`, `server/` and `tools/` are the composition roots. They live OUTSIDE `layers/` and are the only
places allowed to import several layers at once (the isolation checker does not scan them): `app/`
wires the play-time browser slice, `server/` wires the backend HTTP API (author-time `POST /adventure`
plus play-time `POST /interaction`, over one shared store), and `tools/` wires the level generators
behind one command line.

## The rule you carry into any folder

Change only inside that folder. Depend only on other layers' `CONTRACT.md` + `schema/`, never
their `src/`. Update the layer's `CONTRACT.md`/`schema/` if inputs or outputs change, keep its
`tests/` green, and touch no other layer. See [CONTRACT-CONVENTION.md](CONTRACT-CONVENTION.md)
for the definition of done.
