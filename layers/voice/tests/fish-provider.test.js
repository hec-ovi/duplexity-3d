// The Fish Audio provider adapter. It is split so that building the request holds no secret and does
// no I/O, and only a caller holding the key can turn that request into audio.
import { describe, it, expect } from "vitest";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { synthesizeSpeech } from "../src/index.js";
import { createFishTts, fetchFishAudio, fishText, FISH_MODEL } from "../providers/fish.js";

const voiceDesign = { description: "a low, unhurried voice", pacing: "unhurried" };

describe("voice - fish provider", () => {
  it("synthesizeSpeech with the adapter returns schema-valid Speech carrying a request, not a key", () => {
    const speech = synthesizeSpeech("[warm] Evening.", voiceDesign, {
      tts: createFishTts({ voice: "voice-123" }),
    });
    expect(validate(SCHEMA_ID.voice.speech, speech).ok).toBe(true);
    expect(speech.text).toBe("Evening.");
    expect(speech.emotions).toEqual(["warm"]);

    expect(speech.audio).toMatchObject({
      provider: "fish",
      format: "mp3",
      url: "https://api.fish.audio/v1/tts",
      model: FISH_MODEL,
    });
    expect(speech.audio.request.reference_id).toBe("voice-123");
    // nothing secret anywhere in the handle: it is safe to hand to a client
    expect(JSON.stringify(speech.audio)).not.toMatch(/key|token|bearer/i);
  });

  it("puts the emotion cues back as directions Fish performs, and maps pacing to a speed", () => {
    expect(fishText("Evening.", ["warm", "curious"])).toBe("[warm] [curious] Evening.");
    expect(fishText("Evening.", ["neutral"])).toBe("Evening."); // neutral is not a direction
    expect(fishText("Evening.", [])).toBe("Evening.");

    const slow = createFishTts().synthesize({ text: "x", voiceDesign, emotions: [] });
    const plain = createFishTts().synthesize({ text: "x", voiceDesign: null, emotions: [] });
    expect(slow.request.prosody.speed).toBeCloseTo(0.9);
    expect(plain.request.prosody.speed).toBe(1);
  });

  it("fetching the audio sends the key and the model header, and returns the bytes", async () => {
    const seen = [];
    const fetch = async (url, init) => {
      seen.push({ url, ...init });
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([9, 9]).buffer };
    };
    const handle = createFishTts().synthesize({ text: "Halt.", voiceDesign, emotions: [] });
    const audio = await fetchFishAudio(handle, { apiKey: "k", fetch });

    expect(audio.format).toBe("mp3");
    expect(new Uint8Array(audio.bytes)).toEqual(new Uint8Array([9, 9]));
    expect(seen[0].headers.Authorization).toBe("Bearer k");
    expect(seen[0].headers.model).toBe(FISH_MODEL);
  });

  it("a refused request throws TTS_REQUEST_FAILED, so the caller can fall back to text", async () => {
    const fetch = async () => ({ ok: false, status: 402, arrayBuffer: async () => new ArrayBuffer(0) });
    const handle = createFishTts().synthesize({ text: "Halt.", voiceDesign: null, emotions: [] });
    await expect(fetchFishAudio(handle, { apiKey: "k", fetch })).rejects.toMatchObject({
      code: "TTS_REQUEST_FAILED",
      status: 402,
    });
  });
});
