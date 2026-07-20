# persistence

The Adventure store and the home of the canonical wire-format schemas. This is a leaf layer: it
depends on no other layer, and every other layer references ITS `schema/` for anything embedded in
the Adventure document.

## Entry points (see CONTRACT.md)

- `save(adventure) -> { id }`
- `load(id) -> adventure`
- `list() -> [{ id, title }]`
- `export(id) -> bundle`
- `import(bundle) -> adventure`
- `appendHistory(id, record) -> void`

## Phase 1 status (stub)

`src/index.js` is an in-memory store created by `createPersistence({ validateAdventure })`. The
validation function is injected rather than imported, so the store's `src/` never depends on the
test harness; in production this layer wires its own Ajv against `schema/adventure.schema.json`. A
save or import that fails validation throws `SCHEMA_INVALID`; an unknown id throws `NOT_FOUND`.

## Schemas owned here (canonical)

`adventure.schema.json` (top level) plus `meta`, `creative-brief`, `progression`, `instance`,
`room`, `portal`, `object`, `npc-def`, `goal`, `mode`, `spawn`, `vec3`, `vec2`,
`interaction-record`, `bundle`. Other layers link to these; they never redefine them.

## Run the tests

From the repo root: `npm test`. The contract test round-trips the example Adventure through
save/load/export/import and asserts the fixture is schema-valid.

## Modify safely

Evolve the Adventure schema additively (new optional field, bump `contractVersion`) or with a
migration for breaking changes. Because every layer reads these schemas, a breaking change here is
the one change that must be coordinated. Keep `tests/` green.
