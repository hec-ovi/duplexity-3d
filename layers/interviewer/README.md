# interviewer

Turns player preferences (or nothing) into a creativeBrief the narrator can plan from. Skippable:
an empty skip still yields a valid brief with defaults filled.

## Entry points (see CONTRACT.md)

- `message({ sessionId?, text }) -> { sessionId, reply, ready, brief? }`
- `skip({ seedHints? }) -> creativeBrief`

## Status

`createInterviewer()` keeps in-memory sessions. `skip` returns a default-filled brief immediately.
`message` asks a question on the first turn (`ready: false`) and returns `ready: true` with a brief
on the next, so the monotone-ready invariant and the always-valid-brief invariant both run in the
tests. The text LLM drops in behind the same two functions later.

## Schema note

The brief shape is owned canonically by `persistence` (it is embedded in the Adventure).
`schema/creative-brief.json` here is a thin `$ref` to it, so adding a brief field is a single edit
in persistence that both layers pick up.

## Run the tests

`npm test`. Asserts an empty skip still produces a schema-valid brief, and that `message` only
attaches `brief` once `ready` is true.
