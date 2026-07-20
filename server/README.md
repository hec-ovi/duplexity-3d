# server (author-time backend)

The backend composition root: the `POST /adventure` pipeline that turns a creative brief (or nothing)
into a complete, playable, multi-instance Adventure. It lives outside `layers/`, so it is one of the
two places allowed to wire several layers together (the isolation checker only scans `layers/`). The
other is `app/`, which serves the play-time three.js slice.

## Run it

`node server/index.js` starts the API on `http://localhost:5174` (override with `PORT`).

- `POST /adventure` with `{ brief }`, or `{ seedHints }` / `{}` to skip the interview and fill
  defaults. Returns the assembled Adventure (201).
- `GET /adventure/:id` returns a saved Adventure (200), or 404 if unknown.

## What it wires

`interviewer.skip` (when there is no brief) -> `narrator.composeAdventure`, which plans a
multi-instance AdventurePlan and realises it through `scenario-creator` (one valid layout per
instance) and `npc.authorNpcs` (one roster per instance), then saves the Adventure through
`persistence`. The registry supplies kit pieces and character bodies. Only the planner and the
layout-graph generator are deterministic stand-ins today; a local model swaps in behind those seams
later with no change here.

Author-time failures map to HTTP status: `PLAN_INVALID`, `PROGRESSION_DEADEND`,
`INSTANCE_BUILD_FAILED`, and `NO_ASSET_FOR_KIND` return 422; a malformed JSON body returns 400; an
unknown id returns 404.

## Tests

`npm test` (vitest picks up `server/**/*.test.js`). `author.test.js` drives the real HTTP route end to
end: it authors an Adventure with and without a brief, asserts it is schema-valid, multi-instance,
and has a valid gated progression DAG, checks it persisted (`GET /adventure/:id` round-trip), and then
loads and walks the authored first instance with the real runtime.
