# npc

Everything about NPCs: author full NpcDefs at author-time, and resolve one player interaction into a
mode switch plus dialogue at play-time. It decides; it never renders or moves anything.

## Entry points (see CONTRACT.md)

- `authorNpcs(instanceContext, rosterSpec, deps?) -> NpcDef[]`
- `resolveInteraction(selfContext, interaction) -> InteractionResult`

## Status

`authorNpcs` (author-time) builds NpcDefs from the narrator's roster. Given an injected
`deps.assetQuery`, it picks a real `asset-registry` character body per NPC and bounds `allowedModes`
by the modes that body can actually animate (an NPC never gets a mode whose clip the body lacks: no
attack clip means no attack mode), narrowed by disposition. Each NPC spawns inside its home room
rather than at the world origin, so authored adventures are walkable. With no `assetQuery` it falls
back to a generic humanoid body, so the author path still runs offline.

`resolveInteraction` (play-time) is a deterministic stand-in for the LLM that honors every contract
invariant: `newMode` is always within `selfContext.allowedModes` (it falls back to the current mode
rather than emit an action the NPC cannot perform), and `target` references a real nearby entity.
The grammar-constrained local model (Qwen3 A3B, per 04-TECH-STACK.md) drops in behind the same
signature at Phase 6.

## Schema note

`NpcDef` is owned canonically by `persistence` (it is embedded in the Adventure), so
`schema/npc-def.json` here is a thin `$ref` to it. The interaction I/O schemas (self-context,
interaction, interaction-result, roster-spec) are genuinely owned here.

## Run the tests

`npm test`. Asserts a provoke gesture flips to attack or flee within allowedModes, chat produces a
talk-mode line that echoes the input, an NPC never returns a disallowed mode, and authored NpcDefs
are schema-valid with `startMode` inside `allowedModes`.

## Modify safely

Swap the model, prompt, or memory folding, or add an allowed mode (additively in
`persistence/schema/mode.json`, then teach the runtime its deterministic behavior). Keep `tests/`
green.
