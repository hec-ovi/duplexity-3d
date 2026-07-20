# npc - Contract

## Purpose
Everything about NPCs, both as data and as behavior decisions. Two entry points: author full NPC
definitions at author-time, and resolve one player interaction into a mode switch plus dialogue at
play-time. It never renders or moves anything (that is the runtime); it only decides.

## Inputs (params in)
- `authorNpcs(instanceContext, rosterSpec) -> NpcDef[]` (author-time, LLM)
  - `instanceContext` = theme + room list + goal; `rosterSpec` = the narrator's roster asks.
    schema: `schema/roster-spec.json`
- `resolveInteraction(selfContext, interaction) -> InteractionResult` (play-time, LLM, sparse)
  - `selfContext` (assembled fresh by the runtime): `{ whoAmI, myBody, whereIAm, myState, allowedModes }`
    where `myBody` lists the animations/actions the model actually has, `whereIAm` lists room,
    position, nearby entities and notable objects and exits, `myState` is current mode + target +
    short memory. schema: `schema/self-context.json`
  - `interaction`: `{ type: chat|voice|gesture, text?, gesture?, playerRef }`. schema: `schema/interaction.json`

## Outputs (params out)
- `NpcDef` - `{ id, name, persona, knowledge(private), appearance, disposition, relation,
  allowedModes[], bodyRef, homeRoom, spawn, voiceDesign, traits[], startMode }`. `bodyRef` names an
  `asset-registry` character asset and thus its animation clips. schema: `schema/npc-def.json`
- `InteractionResult` - `{ newMode, target?, utterance?, emote?, memoryDelta? }`, schema-constrained
  so the model physically cannot return an off-contract action. schema: `schema/interaction-result.json`

## Events
None directly; the runtime applies the result and the narrator records history. Emotion tags in
`utterance`/`emote` follow the ported emotion-tag vocabulary.

## Errors
- `MODEL_TIMEOUT` / `MODEL_UNAVAILABLE` - deterministic fallback: keep current mode, no utterance,
  neutral emote. Play never blocks on the model.
- `INVALID_DECISION` - a decision that failed validation (mode not allowed, target not real); the
  handler rejects and applies the fallback.

## Invariants this layer will never break
- `newMode` is always within `selfContext.allowedModes` (closed set:
  `idle | wander | patrol | move_to | follow | guard | flee | attack | talk | dead`).
- `target`, when present, references an entity or position that exists in the given `selfContext`.
- The NPC never returns an action its `myBody` cannot perform (no attack animation => no attack).
- Modes and dispositions are finite enforced enums (validated-mutation doctrine).

## Dependencies (contracts only)
- `providers/text` (the brain), optionally `providers/audio` for TTS via the voice sub-adapter,
  `asset-registry` (to validate `bodyRef` and its animation clips). Never touches runtime internals.

## How to modify this blackbox safely
Swap the model, prompt, memory-folding, or add an allowed mode (additively: update the enum in
`self-context.json` + `interaction-result.json`, and teach the runtime the new mode's deterministic
behavior in ITS folder). The voice-design composer and emotion-tag translator (ported from
gamentic) live here as pure functions. Keep `tests/` green: fake LLM -> assert every `newMode` is
in `allowedModes`, targets resolve, and a provoke gesture flips to attack/flee.
