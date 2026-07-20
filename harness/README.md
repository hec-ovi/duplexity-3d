# harness (shared test tooling, NOT a game layer)

This folder is the "thin harness" in thin-harness-fat-skills terms: the small, shared runtime that
loads every layer's published `schema/` and enforces the isolation rule. It is dev/test
infrastructure, not a game subsystem, so it is the one place outside `layers/` that layer tests may
import. It never contains game logic.

## What it gives you

- `schemas.js` - loads every `layers/*/schema/*.json`, registers them in one Ajv (2020-12) instance
  keyed by `$id`, and resolves cross-layer `$ref`s. Exports:
  - `ajv()` - the shared, fully-loaded Ajv instance.
  - `validator(id)` - the compiled validate function for a schema `$id`.
  - `validate(id, data)` - `{ ok, errors }` for a single payload.
  - `SCHEMA_ID` - the canonical `$id` map (`SCHEMA_ID.persistence.adventure`, etc.) so tests never
    hardcode URI strings.
- `isolation.js` - `findCrossLayerImports()` statically scans every `layers/*/src/**` AND
  `layers/*/tests/**` file and returns any import that reaches into another layer's `src/`,
  including bare side-effect imports (`import "x"`). The one rule of the codebase, as a test. Note:
  reading another layer's published `fixtures/` (example data) or referencing its `schema/` is
  contract-sanctioned and deliberately NOT flagged; the rule is about importing `src/` code.
- `isolation.test.js` / `schemas.test.js` - the meta contract tests: no layer imports another's
  internals, and every schema compiles and carries a `$id`.

## The schema `$id` scheme

Every schema declares a stable `$id` of the form:

```
https://doplexity-3d.dev/schema/<layer>/<name>.json
```

Cross-layer references use that full `$id` (never a relative file path), so a schema's physical
location can move without breaking refs. `persistence` owns the canonical shape of everything
embedded in the Adventure document; other layers that expose one of those shapes as their own I/O
ship a thin `{ "$ref": "<persistence id>" }` wrapper rather than redefining it. That is what keeps
"two layers never disagree about the wire format" true by construction.
