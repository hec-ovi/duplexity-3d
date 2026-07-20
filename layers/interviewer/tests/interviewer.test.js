import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate, SCHEMA_ID } from "../../../harness/schemas.js";
import { createInterviewer } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const messageInFx = JSON.parse(readFileSync(join(HERE, "../fixtures/interview-message.in.json"), "utf8"));
const skipInFx = JSON.parse(readFileSync(join(HERE, "../fixtures/interview-skip.in.json"), "utf8"));

describe("interviewer contract", () => {
  it("the input fixtures are schema-valid", () => {
    expect(validate(SCHEMA_ID.interviewer.messageIn, messageInFx).ok).toBe(true);
    expect(validate(SCHEMA_ID.interviewer.skipIn, skipInFx).ok).toBe(true);
  });

  it("message with a supplied-but-unknown sessionId throws SESSION_NOT_FOUND", () => {
    const iv = createInterviewer();
    expect(() => iv.message({ sessionId: "ghost", text: "hi" })).toThrow(/session not found/i);
  });
  it("an empty skip still yields a schema-valid brief with defaults", () => {
    const iv = createInterviewer();
    const brief = iv.skip({});
    expect(validate(SCHEMA_ID.interviewer.creativeBrief, brief).ok).toBe(true);
    expect(["easy", "normal", "hard"]).toContain(brief.difficulty);
  });

  it("skip carries seed hints into the brief", () => {
    const iv = createInterviewer();
    const brief = iv.skip({ seedHints: "cyberpunk, funny npcs" });
    expect(validate(SCHEMA_ID.interviewer.creativeBrief, brief).ok).toBe(true);
    expect(brief.freeText).toContain("cyberpunk");
    expect(brief.themes).toContain("cyberpunk");
  });

  it("message asks first (no brief), then becomes ready with a schema-valid brief", () => {
    const iv = createInterviewer();
    const first = iv.message({ text: "I like fantasy" });
    expect(validate(SCHEMA_ID.interviewer.messageOut, first).ok).toBe(true);
    expect(first.ready).toBe(false);
    expect(first.brief).toBeUndefined();

    const second = iv.message({ sessionId: first.sessionId, text: "gruff dwarves" });
    expect(validate(SCHEMA_ID.interviewer.messageOut, second).ok).toBe(true);
    expect(second.ready).toBe(true);
    expect(second.brief).toBeDefined();
    expect(validate(SCHEMA_ID.interviewer.creativeBrief, second.brief).ok).toBe(true);
  });

  it("ready is monotone: once true it stays true for the session", () => {
    const iv = createInterviewer();
    const s1 = iv.message({ text: "a" });
    const s2 = iv.message({ sessionId: s1.sessionId, text: "b" });
    const s3 = iv.message({ sessionId: s1.sessionId, text: "c" });
    expect(s2.ready).toBe(true);
    expect(s3.ready).toBe(true);
  });
});
