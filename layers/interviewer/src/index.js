// interviewer - distill player taste into a creativeBrief, or fill defaults on skip. Imports no
// other layer's src. The text LLM drops in behind message()/skip() later.

export class SessionNotFoundError extends Error {
  constructor(id) {
    super(`interview session not found: ${id}`);
    this.code = "SESSION_NOT_FOUND";
  }
}

const DEFAULT_BRIEF = {
  universes: [],
  likedNpcs: [],
  tone: "adventurous",
  difficulty: "normal",
  themes: [],
  freeText: "",
};

export function createInterviewer() {
  const sessions = new Map();
  let counter = 0;

  return {
    skip(input = {}) {
      const brief = structuredClone(DEFAULT_BRIEF);
      if (input.seedHints) {
        brief.freeText = input.seedHints;
        const first = input.seedHints.split(/[,\s]+/).filter(Boolean)[0];
        if (first) brief.themes = [first];
      }
      return brief;
    },

    message(input = {}) {
      let sid = input.sessionId;
      // A supplied-but-unknown sessionId is an error (contract precondition); no sessionId starts one.
      if (sid && !sessions.has(sid)) throw new SessionNotFoundError(sid);
      if (!sid) {
        sid = `sess-${++counter}`;
        sessions.set(sid, { turns: 0, hints: [] });
      }
      const s = sessions.get(sid);
      s.turns += 1;
      if (input.text) s.hints.push(input.text);

      const ready = s.turns >= 2;
      const out = {
        sessionId: sid,
        reply: ready ? "Great, that is enough to build your adventure." : "Which universes do you like?",
        ready,
      };
      if (ready) {
        const brief = structuredClone(DEFAULT_BRIEF);
        brief.freeText = s.hints.join(" ");
        brief.universes = s.hints.slice(0, 1);
        out.brief = brief;
      }
      return out;
    },
  };
}
