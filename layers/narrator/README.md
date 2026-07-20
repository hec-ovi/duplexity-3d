# narrator

Plans and assembles the whole Adventure from a creativeBrief, and at play-time owns instance
initialization, history recording, and progression-graph reads. It orchestrates; it never draws
geometry or voices an NPC itself.

## Entry points (see CONTRACT.md)

- `planAdventure(creativeBrief, ctx) -> AdventurePlan` (the deterministic planner / LLM stand-in)
- `composeAdventure(creativeBrief, deps) -> Adventure` (author-time)
- `initInstance(adventure, instanceId) -> instanceRuntimeState`
- `recordInteraction(adventureId, record, deps) -> history.appended payload`
- `nextInstance(adventure, currentInstanceId, goalResult) -> { instanceId } | { done: true }`

## Phase 5 status (real pipeline)

The delegated layers (scenario-creator, npc, persistence) and the model providers are all passed
through `deps`, never imported. Author-time is two validated steps:

1. `planAdventure` (the LLM stand-in, injectable via `deps.plan`) emits an AdventurePlan: meta, one
   InstanceSpec per instance, and a linear gated progression DAG (each instance's goal unlocks the
   next). Instance count scales with the brief's difficulty; the theme is resolved against the
   registry so a brief asking for a kit that does not exist still lays out (it maps to an available
   theme instead of failing downstream).
2. `composeAdventure` structurally validates the plan (`PLAN_INVALID`) and its progression
   (`PROGRESSION_DEADEND`), then realises it: one `scenarioCreator.createInstance` per instance
   (`INSTANCE_BUILD_FAILED` on failure) and one `npc.authorNpcs` per roster, folded into a
   schema-valid Adventure saved through the injected `persistence`.

`nextInstance` stays a pure progression-graph read with no model in the loop, exactly as the
contract requires. The `POST /adventure` route that drives all of this lives in `server/`.

## Run the tests

`npm test`. Unit tests inject fakes for the delegated layers and assert: `planAdventure` emits a
schema-valid multi-instance plan with a valid DAG; theme resolution falls back to a buildable kit;
`composeAdventure` realises a multi-instance plan into matching distinct instances and rejects a
malformed plan (`PLAN_INVALID`), a dead-end progression (`PROGRESSION_DEADEND`), and a failed build
(`INSTANCE_BUILD_FAILED`). The end-to-end route test lives in `server/`.

## Modify safely

Change planning prompts, the model, goal mix, or graph shape inside this folder. Adding an
`InstanceSpec` field is additive. Keep the progression a real DAG (one start, at least one
terminal). Keep `tests/` green.
