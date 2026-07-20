# interviewer - Contract

## Purpose
Turn player preferences (or nothing) into a **creativeBrief** the narrator can plan from. This is
the skippable creative-onboarding layer. It asks about universes and NPCs the player likes, then
distills the conversation into a structured brief.

## Inputs (params in)
- `POST /interview/message` - `{ sessionId?, text }`
  - Starts or continues an interview chat. `text` is the player's latest message.
  - schema: `schema/interview-message.in.json`
- `POST /interview/skip` - `{ seedHints? }`
  - Bypass the chat. `seedHints` is optional loose text ("cyberpunk, funny NPCs"). Empty is valid
    (fully random). schema: `schema/interview-skip.in.json`

Precondition: `sessionId`, if present, refers to a live interview session owned by this layer.

## Outputs (params out)
- message reply - `{ sessionId, reply, ready: boolean, brief? }`
  - `reply` is the next question/suggestion; `ready` flips true when enough is known; `brief` is
    present only once ready. schema: `schema/interview-message.out.json`
- creativeBrief - `{ universes[], likedNpcs[], tone, difficulty, themes[], freeText, seed? }`
  - The single artifact this layer exists to produce. schema: `schema/creative-brief.json`

## Events
None. Request/response only. Sessions are persisted by this layer so a refresh does not lose an
in-progress interview (gamentic pattern).

## Errors
- `SESSION_NOT_FOUND` - unknown `sessionId`.
- `MODEL_UNAVAILABLE` - text provider down; caller may retry or `skip`.

## Dependencies (contracts only)
- `providers/text` adapter (the LLM). Nothing else.

## Invariants this layer will never break
- The output is ALWAYS a valid `creativeBrief`, even from an empty skip (it fills defaults).
- It never plans instances, geometry, or NPCs. It only expresses player taste as a brief.
- `ready` is monotone: once true for a session it stays true.

## How to modify this blackbox safely
Change the questions, the ready heuristic, the model, or add brief fields (additively, bump
`contractVersion`) inside this folder only. If you add a brief field, update `creative-brief.json`
and the narrator can read it or ignore it; nothing else changes. Keep `tests/` green (drive
`/interview/message` and `/interview/skip` with a fake LLM; assert a schema-valid brief).
