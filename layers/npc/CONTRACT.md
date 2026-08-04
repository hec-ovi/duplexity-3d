# npc - Contract

## Purpose
Everything about NPCs, both as data and as behavior decisions. Two entry points: author full NPC
definitions at author-time, and resolve one player interaction into a mode switch plus dialogue at
play-time. It never renders or moves anything (that is the runtime); it only decides.

## Inputs (params in)
- `authorNpcs(instanceContext, rosterSpec) -> NpcDef[]` (author-time, LLM)
  - `instanceContext` = theme + room list + goal; `rosterSpec` = the narrator's roster asks.
    schema: `schema/roster-spec.json`
- `resolveInteraction(selfContext, interaction, { brain? }) -> InteractionResult` (play-time, LLM, sparse)
  - `selfContext` (assembled fresh by the runtime): `{ whoAmI, myBody, whereIAm, myState, allowedModes }`
    where `myBody` lists the animations/actions the model actually has, `whereIAm` lists room,
    position, nearby entities and notable objects and exits, `myState` is current mode + target +
    short memory. schema: `schema/self-context.json`
  - `interaction`: `{ type: chat|voice|gesture, text?, gesture?, playerRef }`. schema: `schema/interaction.json`
  - `deps.brain?`: the injected text provider `(selfContext, interaction) -> rawDecision` (a fake LLM in
    tests, a real GGUF later). Omitted -> the built-in deterministic stand-in resolves the turn. Whatever
    the brain returns is deterministically re-validated by `sanitizeDecision` before it is trusted.
  - `buildInteractionPrompt(selfContext, interaction) -> { system, user }` and `sanitizeDecision(raw,
    selfContext) -> InteractionResult` are the seam a real (async) provider uses: the composition root
    awaits the grammar-constrained model on the prompt, then re-validates the raw completion here.
- `composeVoiceDesign(seedKey, { exclude? }) -> VoiceDesign` (author-time, pure, deterministic): a
  per-character voice descriptor hashed from the character id, stamped onto each `NpcDef.voiceDesign`.
  Its shape is owned by the `voice` layer (`voice/schema/voice-design.json`).

## Outputs (params out)
- `NpcDef` - `{ id, name, persona, knowledge(private), appearance, disposition, relation,
  allowedModes[], bodyRef, homeRoom, spawn, voiceDesign, traits[], startMode }`. A cast is scattered
  over its room (or over the walk zones where a room has them), never inside a building and never
  within a couple of metres of where the player arrives: a body in your face makes a small room
  unreadable. `bodyRef` names an
  `asset-registry` character asset and thus its animation clips. schema: `schema/npc-def.json`
- `InteractionResult` - `{ newMode, target?, utterance?, emote?, memoryDelta? }`, schema-constrained
  so the model physically cannot return an off-contract action. schema: `schema/interaction-result.json`

## Events
None directly; the runtime applies the result and the narrator records history. Emotion tags an
utterance may carry are parsed by the `voice` layer (which owns the emotion-tag vocabulary), not here.

## Errors
- `MODEL_TIMEOUT` / `MODEL_UNAVAILABLE` - `resolveInteraction` never throws; a thrown or absent brain
  collapses to the deterministic fallback (keep current mode, stay silent). Play never blocks on the model.
- `INVALID_DECISION` - a decision that failed `sanitizeDecision` (newMode not in allowedModes) is
  rejected wholesale and the fallback is applied; an unreal `target` on an otherwise-valid decision is
  dropped while the mode and line stand.

## Invariants this layer will never break
- `newMode` is always within `selfContext.allowedModes` (closed set:
  `idle | wander | patrol | move_to | follow | guard | flee | attack | talk | dead`).
- `target`, when present, references an entity or position that exists in the given `selfContext`.
- The NPC never returns an action its `myBody` cannot perform (no attack animation => no attack).
- Modes and dispositions are finite enforced enums (validated-mutation doctrine).

## Dependencies (contracts only)
- `providers/text` (the brain) via the injected `deps.brain`; `asset-registry` (to validate `bodyRef`
  and its animation clips). Speech synthesis is the separate `voice` layer, not a dependency here.
  Never touches runtime internals.

## How to modify this blackbox safely
Swap the model, prompt, memory-folding, or add an allowed mode (additively: update the enum in
`self-context.json` + `interaction-result.json`, and teach the runtime the new mode's deterministic
behavior in ITS folder). The deterministic voice-design composer (`composeVoiceDesign`, ported from
gamentic) lives here as a pure function; the emotion-tag translator moved to the `voice` layer when it
was introduced. Keep `tests/` green: fake LLM -> assert every `newMode` is in `allowedModes` (an
off-contract mode is rejected), targets resolve, and a provoke gesture flips to attack/flee.
