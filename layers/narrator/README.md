# narrator

Plans and assembles the whole Adventure from a creativeBrief, and at play-time owns instance
initialization, history recording, and progression-graph reads. It orchestrates; it never draws
geometry or voices an NPC itself.

## Entry points (see CONTRACT.md)

- `composeAdventure(creativeBrief, deps) -> Adventure` (author-time)
- `initInstance(adventure, instanceId) -> instanceRuntimeState`
- `recordInteraction(adventureId, record, deps) -> history.appended payload`
- `nextInstance(adventure, currentInstanceId, goalResult) -> { instanceId } | { done: true }`

## Phase 1 status (stub)

The delegated layers (scenario-creator, npc, persistence) are passed in through `deps`, never
imported. `composeAdventure` builds a one-instance plan, calls the injected
`scenarioCreator.createInstance` and `npc.authorNpcs`, folds the NPCs into the layout, assembles a
schema-valid Adventure, and saves it through the injected `persistence`. `nextInstance` is a pure
progression-graph read with no model in the loop, exactly as the contract requires.

## Run the tests

`npm test`. The compose test injects fakes for the three delegated layers (mocking them at their
contracts) and asserts a schema-valid Adventure comes out and that persistence.save was called.

## Modify safely

Change planning prompts, the model, goal mix, or graph shape inside this folder. Adding an
`InstanceSpec` field is additive. Keep the progression a real DAG (one start, at least one
terminal). Keep `tests/` green.
