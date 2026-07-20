# voice

Speech I/O in one narrow layer: text or audio in, one result out. It never decides behavior and never
renders; it only turns a line into audio and audio into a line.

- `synthesizeSpeech(utterance, voiceDesign, { tts? })` pulls emotion tags out of the line, then asks
  the injected TTS adapter for audio. With no adapter it returns the clean text and `audio: null`, so
  play keeps going without speech (no local codec sidecar, unlike gamentic).
- `transcribe(audioInput, { stt })` runs the injected STT adapter. Voice input is optional, so with no
  adapter it throws `STT_UNAVAILABLE` and the caller falls back to chat.
- `splitEmotionTags(utterance)` is the pure parser both directions share: `[warm]`, `(curious)` and the
  rest of the closed `EMOTIONS` vocabulary become ordered cues; anything else in brackets is a stage
  direction and stays in the spoken text.

The deterministic voice-design composer (a per-character voice descriptor hashed from the character id)
lives in the `npc` layer, which stamps it onto each `NpcDef` at author-time. This layer owns the
`VoiceDesign` schema and consumes that data; a TTS adapter reads the descriptor to pick a voice.

Wire formats: `schema/voice-design.json`, `schema/speech.json`, `schema/transcript.json`. Tests
(`tests/voice.test.js`) cover tag splitting, synthesis with and without an adapter, and the STT error
path. See [CONTRACT.md](CONTRACT.md).
