# doplexity-3d

A 3D, LLM-driven adventure engine. It is the 3D sibling of gamentic: an AI narrator spins up
small explorable worlds ("instances"), fills them with sentient NPCs you can talk to by voice
or chat, and gives each one a goal to solve before you move to the next.

The design is locked, and the runtime is a walkable, living slice: `npm run dev` loads a hand-authored
Adventure and lets you walk it in three.js (WASD and mouse, reach the amulet to solve the instance).
The NPCs move on their own (a gruff smith idles in the hall, a skeleton patrols the vault), route
through doorways, and carry name labels; press `E` next to one and it turns to you and speaks a
scripted line in a bubble. Their decisions run through the real interaction contract, but the "brain"
is still a canned stub, the actual LLM call arrives later. The worlds themselves are no longer only
hand-authored: the scenario-creator turns an abstract room-adjacency graph into a geometrically valid
layout, packing rooms onto a grid so every doorway lands on a shared wall, proving no overlaps, full
connectivity, and a reachable goal, and regenerating anything that fails (so a bad layout is never
shipped). A generated layout loads and walks in the real runtime today; the graph comes from a
deterministic stand-in now and a local model later, behind the same seam. The whole author side is
wired: `POST /adventure` (a small backend in `server/`) takes a creative brief, or nothing, and
returns a complete multi-instance Adventure, a planner lays out a gated progression graph, the
scenario-creator builds each instance, and the npc layer fills them with bodies that only claim the
moves their kit animation actually has. No model is required for any of it yet; every LLM caller is a
deterministic stand-in behind a seam. Under that, every wire format has a JSON Schema and every one of
the nine layers has a contract test, behind a shared harness. The whole thing is built around one hard rule: every subsystem is an isolated blackbox with
its own contract, so the codebase can grow huge without any one change rippling into the rest.

## What lives here

- [`docs/00-RAW-IDEA.md`](docs/00-RAW-IDEA.md) - the original vision, in plain words.
- [`docs/01-INTERPRETATION.md`](docs/01-INTERPRETATION.md) - how I read that vision as a system.
- [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md) - the layers and how they connect.
- [`docs/03-MILESTONES.md`](docs/03-MILESTONES.md) - phases, in build order.
- [`docs/04-TECH-STACK.md`](docs/04-TECH-STACK.md) - the researched 2026 tooling (three.js, local AI).
- [`docs/CONTRACT-CONVENTION.md`](docs/CONTRACT-CONVENTION.md) - the isolation rule every layer obeys.
- [`docs/INDEX.md`](docs/INDEX.md) - the dispatcher: which folder to open for a given change.
- [`layers/`](layers/) - the nine isolated blackboxes. Each holds its own `CONTRACT.md`,
  `README.md`, `schema/`, `src/`, `tests/`, and `fixtures/`; a layer may depend only on another's
  `CONTRACT.md` + `schema/`, never its `src/`.
- [`harness/`](harness/) - shared test tooling: the JSON Schema loader and the isolation checker.
- [`app/`](app/) - the play-time composition root: the place that wires the browser slice (runtime +
  asset-registry + the example Adventure) and mounts it. It sits outside `layers/`, so the isolation
  rule (no layer reaches into another's `src/`) still holds.
- [`server/`](server/) - the author-time composition root: the `POST /adventure` backend that wires
  interviewer, narrator, scenario-creator, npc, and persistence into the pipeline. Also outside
  `layers/`, for the same reason.

Run `npm install`, then `npm run dev` to walk the slice in the browser, or `node server/index.js` to
serve the author API (`POST /adventure`). `npm test` validates every schema against its fixtures,
drives each layer's contract tests, runs the runtime's simulation and jsdom interaction tests, and
exercises the author route end to end. `npm run schemas` compiles the schemas and checks
cross-references on their own.

## The idea in one paragraph

You start an adventure by answering a short interview (which universes, which kinds of NPCs), or
you skip it and let the system invent one. A narrator turns that into a set of connected 3D
rooms, decides the goals, and populates them with NPCs. You explore in the browser (three.js).
NPCs mostly sit in a cheap deterministic state; when you talk to one, a small LLM call decides
what it does next (follow, guard, attack, move, idle) and what it says. Solve an instance's goal
(reach an exit, unlock a dialog, find something) and you advance. Adventures export and import as
self-contained files.

## Frontend and backend, split

- Frontend: three.js in the browser. Heavy on rendering, light on logic.
- Backend: local LLMs on AMD (Strix Halo, GGUF) plus optional local ComfyUI for asset
  generation. Every backend subsystem is a blackbox behind a JSON contract.
