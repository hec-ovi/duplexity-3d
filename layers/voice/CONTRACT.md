# voice - Contract

## Purpose
The narrow speech I/O layer: text or audio in, one result out. It turns an NPC's line into spoken
audio (TTS) and a player's spoken turn into text (STT), with the actual engine behind an injected
provider adapter so local vs hosted is a config switch. Stateless and pure aside from the adapter. It
renders nothing and decides nothing about behavior (that is the npc brain and the runtime).

Simplified from gamentic on purpose: no local codec sidecar and no streaming decode. The deterministic
voice-design composer lives in the `npc` layer (author-time); this layer consumes its output as data.

## Inputs (params in)
- `synthesizeSpeech(utterance, voiceDesign, deps?) -> Speech` (play-time)
  - `utterance`: the NPC's line, possibly carrying inline emotion tags (`[warm]`, `(curious)`).
  - `voiceDesign`: the NPC's `VoiceDesign` (schema `schema/voice-design.json`), composed by `npc`.
  - `deps.tts?`: `{ synthesize({ text, voiceDesign, emotions }) -> audioHandle }`. Omitted -> text only.
- `transcribe(audioInput, deps?) -> Transcript` (play-time)
  - `audioInput`: an adapter-specific audio handle/bytes. `deps.stt?`: `{ transcribe(input) -> string }`.
- `splitEmotionTags(utterance) -> { text, emotions }` (pure helper the composer above uses).

## Outputs (params out)
- `Speech` - `{ text, emotions[], audio|null }`. `text` is the spoken line with recognized emotion tags
  removed; `emotions` are the parsed cues in order; `audio` is the provider's handle, or `null` when no
  TTS adapter is wired. schema: `schema/speech.json`
- `Transcript` - `{ text }`. schema: `schema/transcript.json`
- `VoiceDesign` - the voice identity shape this layer owns and a TTS adapter reads; produced by
  `npc.composeVoiceDesign` and embedded in `NpcDef.voiceDesign`. schema: `schema/voice-design.json`

## Events
None. The runtime plays the returned audio (or shows the text); the narrator archives the utterance as
part of the InteractionRecord.

## Errors
- `TTS_UNAVAILABLE` - never thrown by `synthesizeSpeech`; with no TTS adapter it degrades to text-only
  (`audio: null`) so play never blocks on speech.
- `STT_UNAVAILABLE` - `transcribe` throws this when no STT adapter is wired, so the caller degrades to
  chat rather than guessing at audio. No STT adapter ships today: the player types.
- `TTS_REQUEST_FAILED` - thrown by `fetchFishAudio` alone (not by `synthesizeSpeech`) when the provider
  answers with anything but a 200.

## Invariants this layer will never break
- Only bracketed tokens whose word is in the closed emotion vocabulary are treated as tags; any other
  parenthetical (a stage direction) stays in the spoken text.
- `synthesizeSpeech` always returns a schema-valid `Speech`, adapter present or not.
- No behavior decisions, no rendering, no persistence: text/audio in, one result out.

## Providers
- `providers/fish.js` - Fish Audio (`POST {baseUrl}/v1/tts`, the model in an HTTP header, mp3 back).
  Split in two so a secret never travels with a line:
  - `createFishTts({ model?, voice?, baseUrl? }) -> { synthesize }` builds the request as a HANDLE.
    Pure, no I/O, no key: this is what lands in `Speech.audio`, and it is safe to hand to a client.
  - `fetchFishAudio(handle, { apiKey, fetch? }) -> { format, bytes }` performs it. Only a holder of the
    key calls it (in this repo, `server/` behind `POST /speech`). Throws `TTS_REQUEST_FAILED` on any
    non-200, so the caller falls back to text instead of playing silence.
  - Emotion cues stripped from the line go back on the front as `[warm]` directions, which Fish
    performs; `VoiceDesign.pacing` becomes a `prosody.speed`.
  - Models: `s2.1-pro-free` (default, free tier), `s2.1-pro`, `s2-pro`, `s1`.

## Dependencies (contracts only)
- `providers/audio` (TTS/STT) via the injected `deps.tts` / `deps.stt` adapters. Never touches another
  layer's `src/`.

## How to modify this blackbox safely
Swap or add a provider adapter (local GGUF TTS, a hosted API) behind `deps.tts`/`deps.stt` without
touching callers. Extend the emotion vocabulary additively (`EMOTIONS`). Keep `tests/` green: a tagged
utterance splits into clean text + cues; synthesis with and without an adapter both yield schema-valid
`Speech`; `transcribe` without an adapter throws `STT_UNAVAILABLE`.
