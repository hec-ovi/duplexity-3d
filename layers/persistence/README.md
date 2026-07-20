# persistence

The Adventure store and the home of the canonical wire-format schemas. This is a leaf layer: it
depends on no other layer, and every other layer references ITS `schema/` for anything embedded in
the Adventure document.

## Entry points (see CONTRACT.md)

- `save(adventure) -> { id }`
- `load(id) -> adventure`
- `list() -> [{ id, title, instanceCount }]`
- `export(id) -> bundle` / `exportFile(id) -> string` (the portable JSON file)
- `import(bundle) -> adventure` / `importFile(text) -> adventure`
- `appendHistory(id, record) -> void`

## Status

`src/index.js` is an in-memory store created by `createPersistence({ validateAdventure })`. The
validation function is injected rather than imported, so the store's `src/` never depends on the
test harness; in production this layer wires its own Ajv against `schema/adventure.schema.json`. A
save or import that fails validation throws `SCHEMA_INVALID`; an unknown id throws `NOT_FOUND`.

Export/import (Phase 7) is a real portable-file round trip. `exportFile` serializes a `Bundle` (the
Adventure plus any non-kit generated assets) to a JSON string you can save to disk; `importFile`
reads one back. Import runs `migrateForward`, which backfills fields an older same-major export may
lack (an empty `history`) and refuses a bundle from a newer MAJOR `contractVersion` it cannot read
(`MIGRATION_FAILED`); a body that is not valid JSON or not a Bundle is `BAD_BUNDLE`. The result opens
byte-identical on a fresh store.

## Schemas owned here (canonical)

`adventure.schema.json` (top level) plus `meta`, `creative-brief`, `progression`, `instance`,
`room`, `portal`, `object`, `npc-def`, `goal`, `mode`, `spawn`, `vec3`, `vec2`,
`interaction-record`, `bundle`. Other layers link to these; they never redefine them.

## Run the tests

From the repo root: `npm test`. The contract tests round-trip the example Adventure through
save/load/export/import, assert the fixture is schema-valid, serialize/deserialize a portable Bundle
string across a fresh store, migrate an older export forward, and reject a newer-major bundle and a
malformed one.

## Modify safely

Evolve the Adventure schema additively (new optional field, bump `contractVersion`) or with a
migration for breaking changes. Because every layer reads these schemas, a breaking change here is
the one change that must be coordinated. Keep `tests/` green.
