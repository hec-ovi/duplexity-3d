# server (backend)

The backend composition root. Author-time: the `POST /adventure` pipeline that turns a creative brief
(or nothing) into a complete, playable, multi-instance Adventure. Play-time: `POST /interaction` runs
one NPC's brain on a live snapshot and archives the exchange. Both share one registry + persistence
store, so an Adventure authored through the API is immediately interactable. It lives outside `layers/`,
so it is one of the two places allowed to wire several layers together (the isolation checker only scans
`layers/`). The other is `app/`, which serves the play-time three.js slice.

## Run it

`node server/index.js` starts the API on `http://localhost:5174` (override with `PORT`).

- `POST /adventure` with `{ brief }`, or `{ seedHints }` / `{}` to skip the interview and fill
  defaults. Returns the assembled Adventure (201).
- `GET /adventure/:id` returns a saved Adventure (200), or 404 if unknown.
- `POST /interaction` with `{ adventureId, instanceId, npcId, interaction, selfContext? }` runs the
  NPC's brain and returns `{ result, record }` (200). The result is the re-validated InteractionResult;
  the record is appended to the Adventure's history. No brain is wired by default, so interactions
  resolve through the npc deterministic stand-in until a local model is injected.
- `GET /adventure/:id/export` returns a portable `Bundle` (200), the self-contained transfer file.
- `POST /adventure/import` with a `Bundle` body migrates, validates, and saves it (201).

## What it wires

Author-time: `interviewer.skip` (when there is no brief) -> `narrator.composeAdventure`, which plans a
multi-instance AdventurePlan and realises it through `scenario-creator` (one valid layout per
instance) and `npc.authorNpcs` (one roster per instance), then saves the Adventure through
`persistence`. Play-time (`interaction-service.js`): loads the Adventure, rebuilds the security-critical
selfContext fields (persona, body animations, allowedModes) from the authored NpcDef so a client cannot
smuggle a forbidden mode, resolves the turn through the npc brain, and appends the exchange via
`narrator.recordInteraction`. The registry supplies kit pieces, character bodies, and each body's
animation clips. Only the planner, the layout-graph generator, and the brain are deterministic
stand-ins today; a local model swaps in behind those seams later with no change here.

Export/import (Phase 7): `GET /adventure/:id/export` serializes the stored Adventure into a portable
Bundle; `POST /adventure/import` runs it through `persistence` migration + validation and saves it, so
an adventure authored on one machine opens on another that has only the base kits.

HTTP status mapping: `PLAN_INVALID`, `PROGRESSION_DEADEND`, `INSTANCE_BUILD_FAILED`,
`NO_ASSET_FOR_KIND`, `SELF_CONTEXT_INVALID`, `MIGRATION_FAILED`, and `IMPORT_INVALID` return 422; a
malformed JSON body, an invalid interaction payload, or a bad bundle returns 400; an unknown
adventure/instance/npc returns 404. The interaction route never 500s on the model: a slow or thrown
brain degrades to the safe fallback. An import failure stays client-actionable (a bad uploaded file is
never a 500), while an author-time `SCHEMA_INVALID` from a planner bug stays a 500.

## Tests

`npm test` (vitest picks up `server/**/*.test.js`). `author.test.js` drives the real author route end to
end (schema-valid multi-instance Adventure with a gated DAG, persisted, then walked with the real
runtime). `interaction.test.js` drives the real `POST /interaction` route with a fake LLM: talking flips
an NPC to talk and it speaks, provoking flips it to attack/flee targeting the player, a client cannot
smuggle a forbidden mode, a dead model degrades safely (no 500) while still archiving, and every
exchange lands in the Adventure's history. `roundtrip.test.js` runs the full author -> play -> export ->
import -> play across two independent backends and asserts the reimported document is byte-identical and
still walkable.
