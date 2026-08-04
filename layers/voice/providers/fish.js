// voice - the Fish Audio provider.
//
// Split in two on purpose:
//
//   createFishTts(config).synthesize(req)  builds a HANDLE. Pure, synchronous, holds no key. This is
//                                          what `synthesizeSpeech` returns as `Speech.audio`.
//   fetchFishAudio(handle, { apiKey })     performs the request and returns the bytes. Only a place
//                                          that holds the key ever calls it (the server).
//
// That split is what keeps the key server-side: an NPC line can be synthesized anywhere, but only the
// backend can turn the handle into audio. api.fish.audio also sends no CORS headers, so a browser
// could not call it directly even with a key.
//
// Endpoint: POST {baseUrl}/v1/tts, the model in an HTTP header, mp3 bytes back.

export const FISH_BASE_URL = "https://api.fish.audio";
export const FISH_MODEL = "s2.1-pro-free";

// VoiceDesign is natural language ("a low, unhurried voice"). Fish takes numbers for pace, so map the
// few words we compose from and leave everything else at the model's own default.
const SPEED = { slow: 0.85, unhurried: 0.9, measured: 0.95, brisk: 1.1, quick: 1.15, rapid: 1.2 };

function speedFor(voiceDesign) {
  const words = `${voiceDesign?.pacing ?? ""} ${voiceDesign?.description ?? ""}`.toLowerCase();
  for (const [word, speed] of Object.entries(SPEED)) {
    if (words.includes(word)) return speed;
  }
  return 1;
}

/**
 * The text Fish is asked to read. The voice layer strips emotion cues out of the line; Fish performs
 * bracketed directions, so they go back on the front where it will read them as direction, not words.
 */
export function fishText(text, emotions = []) {
  const cues = emotions.filter((e) => e && e !== "neutral");
  return cues.length ? `${cues.map((e) => `[${e}]`).join(" ")} ${text}` : text;
}

/**
 * A TTS adapter for `voice.synthesizeSpeech`. Takes no key: it describes the call, it does not make it.
 *
 * @param {object} [config]
 * @param {string} [config.model]   Fish model name (default s2.1-pro-free, the free tier)
 * @param {string} [config.voice]   reference_id of a cloned voice, when the whole cast shares one
 * @param {string} [config.baseUrl] override for a self-hosted or proxied endpoint
 */
export function createFishTts(config = {}) {
  const model = config.model ?? FISH_MODEL;
  const baseUrl = (config.baseUrl ?? FISH_BASE_URL).replace(/\/+$/, "");
  return {
    synthesize({ text, voiceDesign, emotions }) {
      return {
        provider: "fish",
        format: "mp3",
        url: `${baseUrl}/v1/tts`,
        model,
        // Everything needed to make the call, and nothing that must not leave the server.
        request: {
          text: fishText(text, emotions),
          format: "mp3",
          prosody: { speed: speedFor(voiceDesign) },
          ...(config.voice ? { reference_id: config.voice } : {}),
        },
      };
    },
  };
}

/**
 * Turn a handle into audio bytes. Throws `TTS_REQUEST_FAILED` on any non-200 so the caller can fall
 * back to text rather than play silence.
 *
 * @param {object} handle    what `synthesize` returned
 * @param {object} deps
 * @param {string} deps.apiKey
 * @param {Function} [deps.fetch] defaults to the global fetch
 * @returns {Promise<{ format: string, bytes: ArrayBuffer }>}
 */
export async function fetchFishAudio(handle, { apiKey, fetch: doFetch = globalThis.fetch } = {}) {
  const response = await doFetch(handle.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Fish reads the model from a header, not the body.
      model: handle.model,
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(handle.request),
  });
  if (!response.ok) {
    const error = new Error(`fish tts failed: HTTP ${response.status}`);
    error.code = "TTS_REQUEST_FAILED";
    error.status = response.status;
    throw error;
  }
  return { format: handle.format, bytes: await response.arrayBuffer() };
}
