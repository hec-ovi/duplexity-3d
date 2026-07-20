# persistence - Contract

## Purpose
Own the **Adventure** document (the wire format between author-time and play-time) and all of its
lifecycle: serialize, save, load, export to a portable file, import. This layer holds the canonical
schemas that every other layer references.

## Inputs (params in)
- `save(Adventure) -> { id }`
- `load(id) -> Adventure`
- `list() -> [{ id, title, instanceCount }]`
- `export(id) -> Bundle` / `exportFile(id) -> string` (the portable JSON file; `GET /adventure/:id/export`)
- `import(Bundle) -> Adventure` / `importFile(text) -> Adventure` (migrates + validates; `POST /adventure/import`)
- `appendHistory(id, InteractionRecord) -> void` (used by narrator at play-time)

## Outputs (params out)
- `Adventure` - the full document. schema: `schema/adventure.schema.json` (CANONICAL; the top-level
  wire format). Sub-schemas it owns: `instance.json`, `room.json`, `portal.json`, `npc-def.json`,
  `goal.json`, `progression.json`, `interaction-record.json`.
- `Bundle` - `{ adventure, generatedAssets[] }`: the Adventure plus any non-kit (generated) asset
  bytes it references, so an export opens on another machine that only has the base kits.
  schema: `schema/bundle.json`

## Events
None. It is the store.

## Errors
- `NOT_FOUND` - unknown adventure id.
- `SCHEMA_INVALID` - a save/import that fails the current Adventure schema (rejected).
- `MIGRATION_FAILED` - an imported older `contractVersion` could not be migrated forward.

## Invariants this layer will never break
- An exported bundle is self-contained: kit assets referenced by id, generated assets embedded.
- Import validates against the CURRENT schema and migrates older `contractVersion`s forward; two
  layers never disagree about the wire format.
- The Adventure schema is the one place field shapes are defined; other layers link to it, never
  redefine it.

## Dependencies (contracts only)
None (leaf store). Every other layer depends on ITS schemas, which is exactly why they live here.

## How to modify this blackbox safely
Evolve the Adventure schema additively (new optional fields; bump `contractVersion`) or with a
migration for breaking changes (add-new-alongside-old, migrate, remove). Because every layer reads
these schemas, a breaking change here is the one change that must be coordinated: follow the
Versioning rules in [CONTRACT-CONVENTION.md](../../CONTRACT-CONVENTION.md). Keep `tests/` green:
round-trip save/load/export/import of fixtures; a v(N-1) fixture migrates and validates.
