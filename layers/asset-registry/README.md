# asset-registry

The single catalog of usable 3D pieces: modular kit parts, characters, and generated assets. It
decouples "what assets exist" from the scenario-creator (which picks them) and the runtime (which
loads them). Leaf layer.

## Entry points (see CONTRACT.md)

- `query({ kind?, tags?, theme?, sizeConstraints? }) -> AssetEntry[]`
- `get(id) -> AssetEntry`
- `register(entry) -> id`

## Phase 1 status (stub)

`createRegistry()` is an in-memory catalog seeded with a few CC0 kit entries (floor, wall, a rigged
character with declared animations, a prop). `register` enforces two invariants directly: it
rejects an entry with no license (`LICENSE_MISSING`) and a `character` with no animations. The same
character-needs-animations rule is also expressed in `schema/asset-entry.json` via if/then, so the
schema catches it too.

## Run the tests

`npm test`. Verifies the seeded entries validate, queries filter by kind/theme, a licensed prop
registers, and both invalid registrations are rejected.

## Modify safely

Add kits or fields (additively) inside this folder. As long as `AssetEntry` stays valid, the solver
and runtime are unaffected.
