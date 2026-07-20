// voice - the narrow speech I/O layer. Text/audio in, one result out. It imports no other layer's src.
//
// Two directions, both stateless and both provider-agnostic:
//   synthesizeSpeech(utterance, voiceDesign) -> Speech   (TTS: NPC line -> spoken audio)
//   transcribe(audioInput)                   -> Transcript (STT: player voice -> text)
// The actual model lives behind an injected adapter (deps.tts / deps.stt), so a local or hosted engine
// is a config switch, never a code change. Simplified from gamentic: no local codec sidecar and no
// streaming decode. When no TTS adapter is wired, synthesis degrades to text-only (audio: null) rather
// than failing, so play never blocks on speech. The deterministic voice-design composer lives in the
// npc layer (author-time); this layer consumes its output as data (schema: voice/voice-design.json) and
// owns the emotion-tag vocabulary that a TTS provider reads.

// The closed emotion-tag vocabulary. Inline tags in an utterance ([warm], (curious), ...) are pulled
// out into `emotions` and stripped from the spoken text, so the provider gets clean text plus cues.
export const EMOTIONS = [
  "neutral",
  "warm",
  "stern",
  "afraid",
  "angry",
  "joyful",
  "sad",
  "curious",
  "calm",
  "excited",
  "weary",
  "menacing",
];

const EMOTION_SET = new Set(EMOTIONS);
const TAG = /[[(]\s*([a-zA-Z]+)\s*[\])]/g;

/**
 * Split an utterance into clean spoken text plus the ordered emotion cues it carried. Only bracketed
 * tokens whose word is in the emotion vocabulary are treated as tags and removed; any other
 * parenthetical (a stage direction like "(sighs)") is left in the text for the provider to voice.
 * @returns {{ text: string, emotions: string[] }}
 */
export function splitEmotionTags(utterance) {
  const emotions = [];
  const raw = String(utterance ?? "");
  const text = raw
    .replace(TAG, (match, word) => {
      const lower = word.toLowerCase();
      if (EMOTION_SET.has(lower)) {
        emotions.push(lower);
        return " ";
      }
      return match;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { text, emotions };
}

export class VoiceProviderUnavailableError extends Error {
  constructor(kind) {
    super(`no ${kind} provider configured`);
    this.code = kind === "stt" ? "STT_UNAVAILABLE" : "TTS_UNAVAILABLE";
  }
}

/**
 * Synthesize one NPC utterance. Returns clean text, the parsed emotion cues, and an audio handle from
 * the TTS adapter (or null when none is wired). Pure aside from the injected adapter.
 * @param {string} utterance the NPC's spoken line (may carry inline emotion tags)
 * @param {object} voiceDesign the NPC's VoiceDesign (voice/voice-design.json)
 * @param {{ tts?: { synthesize(req): object } }} [deps]
 * @returns {{ text: string, emotions: string[], audio: object|null }}
 */
export function synthesizeSpeech(utterance, voiceDesign, deps = {}) {
  const { text, emotions } = splitEmotionTags(utterance);
  let audio = null;
  if (deps.tts && typeof deps.tts.synthesize === "function" && text) {
    const out = deps.tts.synthesize({ text, voiceDesign: voiceDesign ?? null, emotions });
    // typeof [] === "object", so exclude arrays: speech.json's audio is object|null, never an array.
    audio = out && typeof out === "object" && !Array.isArray(out) ? out : null;
  }
  return { text, emotions, audio };
}

/**
 * Transcribe one spoken player turn to text via the injected STT adapter. Voice input is optional (chat
 * is the default), so without an adapter this throws STT_UNAVAILABLE for the caller to degrade on
 * (fall back to chat) rather than guessing.
 * @param {*} audioInput an adapter-specific audio handle/bytes
 * @param {{ stt?: { transcribe(input): string } }} [deps]
 * @returns {{ text: string }}
 */
export function transcribe(audioInput, deps = {}) {
  if (!deps.stt || typeof deps.stt.transcribe !== "function") {
    throw new VoiceProviderUnavailableError("stt");
  }
  return { text: String(deps.stt.transcribe(audioInput) ?? "") };
}
