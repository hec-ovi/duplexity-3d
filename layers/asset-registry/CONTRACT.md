# asset-registry - Contract

## Purpose
The single catalog of usable 3D pieces: modular kit parts (floors, walls, doors, corridors, props)
and generated assets, plus character models. It decouples "what assets exist" from both the
scenario-creator (which picks them) and the runtime (which loads them).

## Inputs (params in)
- `query({ kind, tags?, theme?, sizeConstraints? }) -> AssetEntry[]` - used by scenario-creator.
  schema: `schema/asset-query.json`
- `get(id) -> AssetEntry` - used by the runtime to load, and by npc to validate a `bodyRef`.
- `register(AssetEntry) -> id` - used by asset-gen to add generated assets.

## Outputs (params out)
- `AssetEntry` - `{ id, kind, tags[], theme, size(bbox), snapPoints[], glbUrl, anchor?, license,
  source(kit|generated), animations?, doors?, floors? }`
  - `kind` is a closed set: `room-floor | wall | door | corridor | prop | character | decal |
    building`.
  - `snapPoints[]` are the modular attach points (positions + axis) that let the solver connect
    pieces on a grid. `animations?` lists clip names for `character` entries. schema: `schema/asset-entry.json`
  - A `building` is a whole building in one file. Its `size` is the plot it needs, so the city is
    laid out around it rather than the building being squashed into a plot. `doors: "own"` says the
    file carries its own front door and the city should not build one on its face; `floors` says how
    many storeys it stands, so what is behind its door can be built to match.
  - `anchor` is the translation applied when a piece is placed, so it ends up centred over its own
    footprint with its base at y=0. A file already written that way anchors at `[0, 0, 0]`, which is
    the default.

## Events
`asset.registered` when a new entry is added (so a running author job can pick it up). Payload:
the new `AssetEntry`.

## Errors
- `ASSET_NOT_FOUND` - unknown id.
- `LICENSE_MISSING` - a `register` attempt without a resolvable commercial-use license (rejected).
- `INVALID_ASSET_ENTRY` - a `register` attempt that breaks an AssetEntry invariant: no resolvable
  `glbUrl`, a `character` with no declared `animations`, or a `building` with no real size
  (rejected).

## Invariants this layer will never break
- Every entry has a resolvable `glbUrl` and an explicit, commercial-use-clear `license`.
- Every `character` entry declares its `animations[]`, so npc `allowedModes` can be validated
  against what the body can actually do.
- `snapPoints` and `size` are accurate enough that the scenario-creator's grid solver can rely on
  them (a piece that lies about its bbox breaks layout; caught by a registration check).

## Dependencies (contracts only)
None. This is a leaf data layer. asset-gen writes to it; scenario-creator and runtime read it.

## How to modify this blackbox safely
Add kits, add fields (additively), or change storage inside this folder. As long as `AssetEntry`
stays valid, the solver and runtime are unaffected. Keep `tests/` green: registering an asset
without a license is rejected; a character asset without declared animations is rejected; queries
filter correctly by kind/theme/size.
