// server - speaking an NPC line out loud.
//
// The key lives here and nowhere else. The browser posts a line, the backend synthesizes it and sends
// the audio back inline, so the API key never reaches the client (and could not be used there anyway:
// api.fish.audio sends no CORS headers).
//
// Speech never blocks play. A missing key, a refused request or a provider outage all come back as
// text with `audio: null`, which is exactly what the voice contract promises.

import { synthesizeSpeech } from "../layers/voice/src/index.js";
import { createFishTts, fetchFishAudio } from "../layers/voice/providers/fish.js";

export function createSpeechService({ env = process.env, fetch, tts } = {}) {
  const apiKey = env.FISH_API_KEY ?? "";
  const adapter =
    tts ??
    (apiKey
      ? createFishTts({
          model: env.FISH_MODEL,
          voice: env.FISH_VOICE,
          baseUrl: env.FISH_BASE_URL,
        })
      : null);

  return {
    enabled: Boolean(adapter),

    /** `{ utterance, voiceDesign? }` -> `{ text, emotions, audio }`, audio inline as base64 or null. */
    async speak(body = {}) {
      const utterance = body.utterance;
      if (typeof utterance !== "string" || !utterance.trim()) {
        throw Object.assign(new Error("utterance must be a non-empty string"), {
          code: "SPEECH_INVALID",
        });
      }
      const speech = synthesizeSpeech(utterance, body.voiceDesign ?? null, adapter ? { tts: adapter } : {});
      if (!speech.audio) {
        return { text: speech.text, emotions: speech.emotions, audio: null };
      }
      try {
        const { format, bytes } = await fetchFishAudio(speech.audio, { apiKey, fetch });
        return {
          text: speech.text,
          emotions: speech.emotions,
          audio: { format, base64: Buffer.from(bytes).toString("base64") },
        };
      } catch {
        // Out of credit, offline, rate limited: the line is still said, just on screen.
        return { text: speech.text, emotions: speech.emotions, audio: null };
      }
    },
  };
}
