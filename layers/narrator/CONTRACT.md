# narrator - Contract

## Purpose
Plan and assemble the whole **Adventure** from a creativeBrief, and at play-time own instance
initialization, interaction-history recording, and progression-graph reads. It orchestrates; it
never draws geometry or voices an NPC itself.

## Inputs (params in)
- `composeAdventure(creativeBrief) -> Adventure` (author-time, the `POST /adventure` body)
  - Plans instances, goals, and the progression graph; then calls `scenario-creator` per instance
    and `npc.authorNpcs` per roster; assembles and returns a full Adventure.
  - schema in: `../interviewer/schema/creative-brief.json` (owned by interviewer) ; out: the
    Adventure schema (owned by persistence).
- `initInstance(adventure, instanceId) -> instanceRuntimeState`
  - Produce the starting play-time state for one instance (NPC start modes, initial flags, spawn).
    schema: `schema/instance-runtime-state.json`
- `recordInteraction(adventureId, InteractionRecord) -> void`
  - Append one play-time interaction to history. schema: `schema/interaction-record.json`
- `nextInstance(adventure, currentInstanceId, GoalResult) -> { instanceId } | { done: true }`
  - A pure read of the authored progression graph. No LLM.

## Outputs (params out)
- `adventurePlan` (internal, before scenario-creator runs) - `{ meta, instances: InstanceSpec[], progression }`
  - `InstanceSpec = { id, theme, sizeHint, mood, goalSpec, npcRoster[], connectionHints }`.
    schema: `schema/adventure-plan.json`
- `Adventure` - the assembled document (schema owned by `persistence`).
- progression transitions and history side effects as above.

## Events
Emits `history.appended` and `progression.advanced` (payload schemas in `schema/`) for the runtime
and UX shell to observe. Consumes nothing.

## Errors
- `PLAN_INVALID` - the model's plan failed schema/structure checks after retries.
- `INSTANCE_BUILD_FAILED` - a delegated `scenario-creator` call could not produce a valid instance.
- `PROGRESSION_DEADEND` - graph has no next node and no `done` (a planning bug; caught in tests).

## Dependencies (contracts only)
- `interviewer` (brief in), `scenario-creator` (build each instance), `npc` (author rosters),
  `persistence` (Adventure schema + save), `providers/text` (planning LLM).

## Invariants this layer will never break
- Progression is a real DAG the narrator authored: every non-terminal node has a reachable next
  node keyed by a machine-checkable goal; there is exactly one `start` and at least one terminal.
- Advancing a stage at play-time is a graph read, never an LLM call.
- The narrator never emits geometry or NPC dialogue; it delegates those to their layers.

## How to modify this blackbox safely
Change planning prompts, the model, goal-mix, or graph shape inside this folder. Adding an
`InstanceSpec` field is additive: update `adventure-plan.json`; the scenario-creator reads what it
understands. Keep `tests/` green (fake LLM -> assert a valid, connected progression graph and that
`composeAdventure` returns a schema-valid Adventure by mocking the delegated layers at their
contracts).
