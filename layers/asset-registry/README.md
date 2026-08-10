# asset-registry

The single catalog of usable 3D pieces: modular kit parts, characters, and generated assets. It
decouples "what assets exist" from the scenario-creator (which picks them) and the runtime (which
loads them). Leaf layer.

## Entry points (see CONTRACT.md)

- `query({ kind?, tags?, theme?, sizeConstraints? }) -> AssetEntry[]`
- `get(id) -> AssetEntry`
- `register(entry) -> id`

## Status

`createRegistry()` is an in-memory catalog seeded with a few CC0 dungeon kit entries (floor, wall, a
rigged character with declared animations, a prop). `register` enforces three invariants directly: it
rejects an entry with no license (`LICENSE_MISSING`), a `character` with no animations, and a
`building` with no real size. The same character-needs-animations rule is also expressed in
`schema/asset-entry.json` via if/then, so the schema catches it too. `asset-gen` calls `register` to
add async-generated assets (namespaced under `gen.` so they can never overwrite a kit).

A `building` entry is a whole building in one GLB, measured by `glb` when it is imported: its `size`
is the plot the city cuts for it, `anchor` is where the file stands, and `doors: "own"` says it
brought its own front door.

## Run the tests

`npm test`. Verifies the seeded entries validate, queries filter by kind/theme, a licensed prop
registers, and both invalid registrations are rejected.

## Modify safely

Add kits or fields (additively) inside this folder. As long as `AssetEntry` stays valid, the solver
and runtime are unaffected.
