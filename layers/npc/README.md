# npc

Everything about NPCs: author full NpcDefs at author-time, and resolve one player interaction into a
mode switch plus dialogue at play-time. It decides; it never renders or moves anything.

## Entry points (see CONTRACT.md)

- `authorNpcs(instanceContext, rosterSpec, deps?) -> NpcDef[]`
- `resolveInteraction(selfContext, interaction, { brain? }) -> InteractionResult`
- `sanitizeDecision(raw, selfContext)` / `buildInteractionPrompt(selfContext, interaction)` (the model seam)
- `composeVoiceDesign(seedKey, { exclude? }) -> VoiceDesign`

## Status

`authorNpcs` (author-time) builds NpcDefs from the narrator's roster. Given an injected
`deps.assetQuery`, it picks a real `asset-registry` character body per NPC and bounds `allowedModes`
by the modes that body can actually animate (an NPC never gets a mode whose clip the body lacks: no
attack clip means no attack mode), narrowed by disposition. Each NPC spawns inside its home room
rather than at the world origin, so authored adventures are walkable. With no `assetQuery` it falls
back to a generic humanoid body, so the author path still runs offline.

`resolveInteraction` (play-time) resolves one interaction to an InteractionResult. With no `brain` it
runs a deterministic stand-in; when a `brain` (the injected text provider / LLM) is supplied it drives
the decision. Either way the raw decision passes through `sanitizeDecision`, which re-validates against
the live snapshot: `newMode` must be within `selfContext.allowedModes` (an off-contract mode is
rejected wholesale to the current-mode fallback), a `target` is kept only if it references a real
nearby entity, notable object, exit, or world position (an invented one is dropped), and bad JSON, a
non-object, or a thrown/timed-out model all collapse to the safe fallback so play never blocks. The
async model call itself lives in the `server` composition root, which awaits a grammar-constrained
local model (Qwen3 A3B, per 04-TECH-STACK.md) on `buildInteractionPrompt` and hands the raw completion
to `sanitizeDecision`. `composeVoiceDesign` stamps each NPC a deterministic, distinct voice descriptor
(shape owned by the `voice` layer) at author-time.

## Schema note

`NpcDef` is owned canonically by `persistence` (it is embedded in the Adventure), so
`schema/npc-def.json` here is a thin `$ref` to it. The interaction I/O schemas (self-context,
interaction, interaction-result, roster-spec) are genuinely owned here.

## Run the tests

`npm test`. Asserts a provoke gesture flips to attack or flee within allowedModes, chat produces a
talk-mode line that echoes the input, an NPC never returns a disallowed mode, and authored NpcDefs
are schema-valid with `startMode` inside `allowedModes`. The Phase 6 tests add the brain seam: an
injected model drives a re-validated decision, an off-contract mode falls back, an invented target is
dropped, malformed/thrown model output collapses to the fallback, and `composeVoiceDesign` is
deterministic, schema-valid, and distinct across a cast.

## Modify safely

Swap the model, prompt, or memory folding, or add an allowed mode (additively in
`persistence/schema/mode.json`, then teach the runtime its deterministic behavior). Keep `tests/`
green.
