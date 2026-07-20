# 00 - Raw Idea (the brief, in Hector's words)

> This file is the source of truth for intent. It captures the original vision as stated,
> lightly organized for reading but NOT reinterpreted. My interpretation lives in
> [01-INTERPRETATION.md](01-INTERPRETATION.md). If a later doc ever contradicts this one,
> this one wins on "what we are trying to build"; the later doc wins only on "how".

## One line

doplexity-3d is a 3D version of gamentic. Simple on the backend side in a way, complex on the frontend because everything is 3D.

## The specialist that builds worlds ("instances")

I want a specialist that generates "instances", which are maps dynamically created. Each
instance must have its own rules and an isolated contract. This specialist creates the
worlds: rooms, inventories, doors, room connections. All of it is 3D, god quality. The
MOST important thing is correct, well defined positions: doors, rooms, and the connections
between rooms.

This specialist is focused only on this. Give it different skills for different kinds of
assets: rooms, objects to create, different gates/doors, etc. (Research the gbrain
"resolver + fat skill" approach for how to structure these skills.) Each of our instances
has its own context and is its own agent, created to focus ONLY on its own domain.

## The NPC / character domain

Another domain is the characters of that world, the NPCs. They must be sentient. That
means they must be aware of where they are, of their own body, and of their own possible
actions, so they can follow, attack others, and so on.

IMPORTANT: because of context and cost, these actions (attack, follow, etc.) are kind of
automatic. The NPCs are not doing things all the time. But if you interact with one, it can
take an action: go, move, follow. Once an action is done, that is its actual state. So an NPC
is either following, or defending something, or idle, etc. That means an LLM handles the
interaction and changes the AI mode to attack, follow, idle, or any other action.

## The narrator (orchestrator)

The narrator just orchestrates all of these things and starts the state of the actual
instance. Think of it almost like a roguelike but in 3D. It is NOT a roguelike really (it is
not 2D), BUT to solve the "progression" problem we can borrow that shape: a well defined
goal, an exit, a dialog unlocked with an NPC, something to discover. From there, once you
solve that, you advance to a new stage. The narrator then saves all the user's interactions
with the NPCs.

Same as gamentic, NPCs have voice and chat, but not as complex. Try to simplify this part so
we do not end up with a lot of intrinsic logic messed up.

## The interviewer / creative-thinking layer (starting a new adventure)

In the UX experience you have a layout (obviously also isolated) of the adventure itself, and
then you start playing. You can export adventures and import adventures, or start a new one.

Starting a new one is simply an interview, with another layer. This layer is the creative
thinking. At ANY moment you can skip it, and it auto-generates with no info or with small
info. Or you can give it more information, and this interviewer asks you: which universes do
you like? which NPCs would you like to see? etc. Based on that, this agent goes to the
narrator, which is the creator (another isolated layer). The narrator then decides how many
instances it wants to create, how many NPCs per instance, the goals of each instance, and so
on.

## MOST CRITICAL: isolation of every contract

My most important requirement is ISOLATION of each contract. Each thing is extremely
plug and play. Whatever we modify inside a blackbox (for example the scenario creator) does
NOT affect anything at all in the rest. Same with the NPC blackbox: nothing there impacts the
others. Each isolated layer has its own `contract.md` that defines the input and output of
that blackbox, plus documentation of how to use it.

The purpose: this project will grow to millions of tokens in codebase. So each isolated layer
must be flexible enough that ANY agent can read its own contract, readme, and instructions and
modify that blackbox alone. If something is added, we modify the output or the input, params
in, params out, on each layer.

So basically:
- A UX layer (isolated) for the adventure and its layout.
- The interviewer / creative layer (isolated), skippable.
- The narrator / creator layer (isolated).
- The scenario / instance creator specialist (isolated), with per-asset-kind skills.
- The NPC layer (isolated), sentient NPCs with LLM-driven mode switching.
- Export / import of adventures.

## Things to research (mid 2026)

There are surely many options in mid 2026. For example:
- Create dynamic assets with ComfyUI?
- A template to create 3D assets (textures, etc.) to enrich the worlds?
- 3D assets for three.js that are stable and that the AI does not have to code from scratch?
- Chat bubbles: a way to make speech bubbles already built in for NPCs, inside the three.js
  scene, rather than hand coding them?

## Deliverables Hector asked for

1. Save the architecture. The repo is created, so keep commits and pushes active.
2. Save doc files (for us) with the architecture etc.
3. Save this idea raw, then my interpretation of it, then milestones/phases so we can compact
   between them.
