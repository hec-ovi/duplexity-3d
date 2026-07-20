import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { splitEmotionTags, synthesizeSpeech, transcribe } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const voiceDesign = JSON.parse(readFileSync(join(HERE, "../fixtures/voice-design.json"), "utf8"));

describe("voice contract", () => {
  it("the voice-design fixture is schema-valid", () => {
    expect(validate(SCHEMA_ID.voice.voiceDesign, voiceDesign).ok).toBe(true);
  });

  it("splitEmotionTags pulls known emotion tags out into cues and leaves other parentheticals in", () => {
    const { text, emotions } = splitEmotionTags("[warm]Well met, friend.(curious) Who goes there?");
    expect(text).toBe("Well met, friend. Who goes there?");
    expect(emotions).toEqual(["warm", "curious"]);

    // an unknown parenthetical is a stage direction, not an emotion tag -> stays in the spoken text
    const stage = splitEmotionTags("(sighs) Fine, take it.");
    expect(stage.text).toBe("(sighs) Fine, take it.");
    expect(stage.emotions).toEqual([]);
  });

  it("synthesizeSpeech with no TTS provider degrades to text-only (audio: null) and is schema-valid", () => {
    const speech = synthesizeSpeech("[stern]Halt.", voiceDesign);
    expect(speech.text).toBe("Halt.");
    expect(speech.emotions).toEqual(["stern"]);
    expect(speech.audio).toBeNull();
    expect(validate(SCHEMA_ID.voice.speech, speech).ok, JSON.stringify(speech)).toBe(true);
  });

  it("synthesizeSpeech with a TTS provider passes clean text + cues + the voice design, returns audio", () => {
    const tts = { synthesize: vi.fn(() => ({ url: "mem://a.wav", format: "wav", durationMs: 900 })) };
    const speech = synthesizeSpeech("[angry]Get out!", voiceDesign, { tts });

    expect(tts.synthesize).toHaveBeenCalledWith({
      text: "Get out!",
      voiceDesign,
      emotions: ["angry"],
    });
    expect(speech.audio).toEqual({ url: "mem://a.wav", format: "wav", durationMs: 900 });
    expect(validate(SCHEMA_ID.voice.speech, speech).ok).toBe(true);
  });

  it("coerces a non-object (array) TTS return to audio:null so Speech stays schema-valid", () => {
    // typeof [] === "object" in JS, so a degenerate array-returning adapter must not leak through.
    const speech = synthesizeSpeech("[warm]Hi", voiceDesign, { tts: { synthesize: () => [1, 2, 3] } });
    expect(speech.audio).toBeNull();
    expect(validate(SCHEMA_ID.voice.speech, speech).ok).toBe(true);
  });

  it("transcribe uses the injected STT provider and returns a schema-valid transcript", () => {
    const stt = { transcribe: vi.fn(() => "open the gate") };
    const t = transcribe({ bytes: "..." }, { stt });
    expect(stt.transcribe).toHaveBeenCalledOnce();
    expect(t).toEqual({ text: "open the gate" });
    expect(validate(SCHEMA_ID.voice.transcript, t).ok).toBe(true);
  });

  it("transcribe without an STT provider throws STT_UNAVAILABLE (caller degrades to chat)", () => {
    expect(() => transcribe({ bytes: "..." })).toThrowError(
      expect.objectContaining({ code: "STT_UNAVAILABLE" }),
    );
  });
});
