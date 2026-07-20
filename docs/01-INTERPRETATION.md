# 01 - Interpretation (how I read the vision as a system)

This is my engineering read of [00-RAW-IDEA.md](00-RAW-IDEA.md). Where the brief was open, I
make a decision and mark it **[decision]**. The architecture in
[02-ARCHITECTURE.md](02-ARCHITECTURE.md) is built on these decisions.

## The one insight that makes this cheap: two phases, not one

The brief's hardest constraint is cost and context ("because of context, these actions are kind
of automatic ... not all the time doing things"). The clean way to honor it is to split the
system into two phases with a hard seam between them:

- **Author-time** (LLM-heavy, happens rarely): interview -> narrator plans the adventure ->
  a scenario-creator agent builds each instance -> NPCs are authored. Output is a static,
  self-contained **Adventure** document. This is where the expensive thinking lives.
- **Play-time** (LLM-light, happens continuously): the browser loads an instance and runs it
  deterministically. NPCs sit in cheap finite-state behavior. The ONLY thing that crosses back
  to an LLM during play is a **player interaction** with an NPC, which returns a new mode plus a
  line of dialog. Nothing else calls a model.

**[decision]** Everything expensive is precomputed at author-time into data. Play-time is a
deterministic engine plus sparse, single-NPC interaction calls. This is what lets an instance
run smoothly and keeps token cost bounded to "only when the player actually talks to someone."

## Vocabulary (the domain, pinned down)

I fix these terms so every contract uses the same words.

- **Adventure** - the top-level unit you export/import. Contains a set of instances, a
  progression graph over them, saved interaction history, and metadata. The interviewer +
  narrator produce one Adventure.
- **Instance** - one dynamically created 3D world (the brief's "map"). Its own rules, its own
  isolated context, its own rooms, NPCs, and goal(s). This is also a "stage": you solve it to
  advance. **[decision]** An instance is authored by its OWN scenario-creator agent invocation,
  sandboxed to that instance's theme and domain, so instances never bleed into each other.
- **Room** - a bounded 3D space inside an instance: position, dimensions, floor/wall kit,
  contents (objects, inventories), and the portals on its walls.
- **Portal** (door / gate) - a connection with a precise 3D position that joins two rooms, or
  joins a room to the instance **exit**. Getting portals geometrically correct (aligned on both
  rooms' walls, non-overlapping, actually reachable) is the crux the brief calls out.
- **Goal** - an instance's win condition. **[decision]** A small closed set of goal types so the
  runtime can check them without an LLM: `reach_exit`, `unlock_dialog` (get a specific NPC to a
  specific mode/flag via conversation), `discover_item`, `defeat`/`survive`. Composable ("do A
  then B").
- **NPC** - a sentient character: identity, body (which model + which animations/actions it
  physically has), position, current **mode**, a short memory, and a list of allowed actions.
- **Mode** - the NPC's current high-level state. **[decision]** Closed set:
  `idle | wander | patrol | move_to | follow | guard | flee | attack | talk | dead`. Each mode
  is pure deterministic behavior at play-time.
- **Interaction** - a player act toward an NPC (chat text, transcribed voice, or a gesture like
  "attack"). This is the single event that triggers a play-time LLM call.
- **Interviewer** - the skippable creative onboarding layer. Asks about universes/NPCs you like,
  or auto-fills. Output: a **creative brief**.
- **Narrator** - the creator/orchestrator. Consumes the creative brief and plans the whole
  Adventure (how many instances, their themes, goals, NPC rosters, the progression graph). At
  play-time it also owns setting the initial state of the current instance and recording the
  player's interaction history.
- **Scenario Creator** - the world-building specialist. Given one instance's spec, it produces a
  validated 3D layout. It has per-asset-kind skills (rooms, objects, gates) in the
  gbrain "fat skill" style.
- **Runtime** - the three.js browser client that renders and plays an instance.

## "Sentient" NPCs, made concrete

The brief wants NPCs "aware of where they are, their own body, and their own possible actions."
**[decision]** That awareness is just the context we hand the interaction LLM call, not a
constant background process:

```
NPC self-context (assembled fresh at interaction time):
  who_am_i:      identity + personality + current goal/allegiance
  my_body:       the animations/actions this model can actually perform (walk, attack, sit, ...)
  where_i_am:    my room, my position, what is near me (entities + notable objects), exits
  my_state:      current mode + who/what it targets + short memory of recent events
  allowed_modes: the closed set I may switch to
```

The LLM receives that snapshot plus the player's interaction and returns
`{ new_mode, target, utterance, emote }`. Between interactions the NPC is "sentient" only in the
sense that it keeps executing its mode deterministically (a guard keeps guarding, a follower
keeps following). That matches "once an action is done, that is its actual state."

## Progression, made checkable without an LLM

The roguelike-shaped loop ("goal, exit, unlock a dialog, discover something -> advance") is
handled by the runtime as data, not narration. Each instance ships with a machine-checkable
goal. The runtime evaluates it every tick from game state (position, inventory, NPC flags). When
it passes, the runtime asks the narrator layer for the next instance in the progression graph
and transitions. The narrator does not need a model in the loop to advance a stage; it just
reads the graph it authored.

## Voice and chat, deliberately simplified

The brief says NPC voice/chat should be "not as complex" and warns against tangled intrinsic
logic. **[decision]** Model it as one narrow layer with a tiny contract: text/audio in, one
interaction result out, plus append-to-history. STT and TTS are pluggable adapters behind that
contract. No per-NPC dialog trees, no branching-dialog engine. All "memory" is the narrator's
flat interaction log, summarized into the next self-context. This is the part I will keep
smallest on purpose.

## Where the LLM is (and is not)

| Moment | LLM? | Which layer |
|---|---|---|
| Interview about preferences | yes (or skipped) | interviewer |
| Plan the adventure (instances, goals, progression) | yes | narrator |
| Author one instance's layout | yes, structured | scenario-creator |
| Author NPC personalities/rosters | yes | narrator/scenario-creator |
| Rendering, movement, pathfinding, animation | never | runtime |
| Checking a goal, advancing a stage | never | runtime + narrator (graph read) |
| Player talks to / provokes an NPC | yes, one small call | npc (via interaction layer) |

## Isolation, restated as the thing I will not compromise

Every layer above is a blackbox folder with its own `CONTRACT.md` and `schema/`. The author-time
pipeline and the play-time loop both pass **data** between layers, validated at each boundary. No
layer imports another's internals. See [CONTRACT-CONVENTION.md](CONTRACT-CONVENTION.md). The
reason this matters here specifically: the scenario creator and the NPC brain are exactly the two
parts most likely to get rewritten repeatedly as 2026 models improve, so they must be swappable
without touching the runtime or the narrator.

## Open decisions deferred to the tech research

These wait for [04-TECH-STACK.md](04-TECH-STACK.md):

- Do we generate 3D assets locally (ComfyUI on the AMD box) or lean on curated modular kits with
  optional async generation? (leaning kits-first, generation-as-enrichment)
- Which library renders NPC speech bubbles in-scene.
- Which pathfinding/animation stack the runtime uses.
- How the scenario creator's structured layout output is constrained (JSON Schema vs grammar).
