import { describe, it, expect } from "vitest";
import { createSpeech, BUBBLE_TTL } from "../src/speech.js";

describe("in-scene speech model", () => {
  it("shows a line, keeps it until its ttl elapses, then drops it", () => {
    const sp = createSpeech();
    expect(sp.get("npc-a")).toBeNull();

    sp.say("npc-a", "hello", 2);
    expect(sp.get("npc-a").text).toBe("hello");

    sp.tick(1);
    expect(sp.get("npc-a").text).toBe("hello"); // still up

    sp.tick(1.1);
    expect(sp.get("npc-a")).toBeNull(); // expired
    expect(sp.active()).toEqual([]);
  });

  it("ignores empty lines and replaces the current line for an NPC", () => {
    const sp = createSpeech();
    sp.say("npc-a", "");
    expect(sp.get("npc-a")).toBeNull();

    sp.say("npc-a", "first");
    sp.say("npc-a", "second");
    expect(sp.get("npc-a").text).toBe("second");
    expect(sp.get("npc-a").ttl).toBe(BUBBLE_TTL); // default lifetime
  });
});
