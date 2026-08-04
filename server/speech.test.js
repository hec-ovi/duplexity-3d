// POST /speech end to end through the real route, with a fake Fish endpoint. Proves the key stays on
// the server, the line reaches the provider shaped the way Fish wants it, and that nothing about
// speech can stop the game: no key, a refusal or an outage all come back as text.
import { describe, it, expect } from "vitest";
import { createBackendService } from "./backend-service.js";
import { createRouter } from "./http.js";

const KEY = "test-key-not-a-real-one";

function fakeFish({ status = 200, bytes = new Uint8Array([1, 2, 3, 4]) } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, ...init });
    return {
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: async () => bytes.buffer,
    };
  };
  return { fetch, calls };
}

// Drive the real router the way node's http server does.
async function post(service, path, body) {
  const handle = createRouter(service);
  const chunks = { data: JSON.stringify(body) };
  const req = {
    method: "POST",
    url: path,
    on(event, cb) {
      if (event === "data") cb(chunks.data);
      if (event === "end") cb();
      return req;
    },
  };
  let status;
  let payload;
  const res = {
    writeHead: (s) => {
      status = s;
    },
    end: (text) => {
      payload = JSON.parse(text);
    },
  };
  await handle(req, res);
  return { status, body: payload };
}

const voiceDesign = { description: "a low, unhurried voice", pacing: "unhurried" };

describe("POST /speech", () => {
  it("speaks a line through the provider and returns the audio inline", async () => {
    const fish = fakeFish();
    const service = createBackendService({ env: { FISH_API_KEY: KEY }, fetch: fish.fetch });
    expect(service.speechEnabled).toBe(true);

    const res = await post(service, "/speech", {
      utterance: "[warm] Evening. The gate is still shut.",
      voiceDesign,
    });

    expect(res.status).toBe(200);
    // the emotion tag is stripped from the spoken text and reported as a cue
    expect(res.body.text).toBe("Evening. The gate is still shut.");
    expect(res.body.emotions).toEqual(["warm"]);
    expect(res.body.audio).toEqual({ format: "mp3", base64: Buffer.from([1, 2, 3, 4]).toString("base64") });

    expect(fish.calls).toHaveLength(1);
    const call = fish.calls[0];
    expect(call.url).toBe("https://api.fish.audio/v1/tts");
    expect(call.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(call.headers.model).toBe("s2.1-pro-free"); // Fish reads the model from a header
    const sent = JSON.parse(call.body);
    expect(sent.format).toBe("mp3");
    // the cue goes back on as a direction Fish performs, and the pacing became a number
    expect(sent.text).toBe("[warm] Evening. The gate is still shut.");
    expect(sent.prosody.speed).toBeCloseTo(0.9);
  });

  it("uses the configured cloned voice when one is set", async () => {
    const fish = fakeFish();
    const service = createBackendService({
      env: { FISH_API_KEY: KEY, FISH_VOICE: "voice-123", FISH_MODEL: "s2.1-pro" },
      fetch: fish.fetch,
    });
    await post(service, "/speech", { utterance: "Halt." });

    const sent = JSON.parse(fish.calls[0].body);
    expect(sent.reference_id).toBe("voice-123");
    expect(fish.calls[0].headers.model).toBe("s2.1-pro");
  });

  it("with no key wired, the line still comes back as text", async () => {
    const service = createBackendService({ env: {} });
    expect(service.speechEnabled).toBe(false);

    const res = await post(service, "/speech", { utterance: "[stern] Move along." });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "Move along.", emotions: ["stern"], audio: null });
  });

  it("a provider that refuses (no credit, rate limit, outage) never breaks the turn", async () => {
    const fish = fakeFish({ status: 402 }); // what an empty Fish balance actually returns
    const service = createBackendService({ env: { FISH_API_KEY: KEY }, fetch: fish.fetch });

    const res = await post(service, "/speech", { utterance: "Evening." });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "Evening.", emotions: [], audio: null });
  });

  it("an empty request is the caller's mistake, not a server error", async () => {
    const service = createBackendService({ env: { FISH_API_KEY: KEY } });
    const res = await post(service, "/speech", { utterance: "  " });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SPEECH_INVALID");
  });
});
