# city-doc - Contract

## Purpose
The portable city file: which assets a city uses, and where each thing stands. It is to a city what a
GLB is to one building, so the two combine: the buildings toolkit writes the files, this writes the
coordinates they stand at. Metres, Y up, a building's position is the centre of its footprint at
ground level, which is how a building GLB is written.

## Inputs (params in)
- `toCityDoc(instance, deps?) -> CityDoc` - `instance` is a persistence Instance holding one `open`
  room (an outdoor level).
  - `deps.assetFor?`: a handle to `asset-registry.get` (injected). It is how a mass that IS a file is
    told apart from a mass merely faced with a kit piece. Without it a city ships no files and every
    mass is one the reader draws from its size.
  - `deps.fileFor?`: where an asset's file sits relative to the document. By default the asset's own
    `glbUrl`.
- `fromCityDoc(doc) -> { instance, assets }` - reads one back.

## Outputs (params out)
- `CityDoc` - `{ format, id, label, theme, units, up, ground, assets[], surfaces[], buildings[],
  skyline[], lights[], spawn, exit }`. schema: [schema/city-doc.json](schema/city-doc.json)
  - `assets[]` is every file the city uses, once each, with its size, its anchor, and whether it
    brought its own front door.
  - `buildings[]` is what stands on the ground. With an `asset` the file IS the building; without
    one, `size`, `floors` and `program` are enough for any engine to draw a mass.
  - `surfaces[]` is what the ground is (roadway, pavement, square), `lights[]` is where light stands,
    and `exit` is the way out and what it waits for.
- `{ instance, assets }` - the level to play, and the entries a catalog should register so its
  buildings resolve to files.

## Events
None. It is a format.

## Errors
- `NOT_A_STREET` - the instance has no open room: there is no city to write.
- `CITY_DOC_INVALID` - a document from another format or version, one with no id or ground, or an
  asset with no license (which cannot be shipped).

## Invariants this layer will never break
- A document is the fabric only. The cast, the goals and what is behind each door are the game, and
  are not in it: reading one back gives a street with nobody on it, and every door still saying where
  it leads.
- A round trip changes nothing that is in the document: write a city, read it back, write it again
  and the two documents are identical.
- Coordinates are world metres exactly as the level holds them. Nothing is scaled, re-centred or
  rounded on the way in or out.
- Only a `building` asset becomes a file the city ships. A kit piece a plain mass is faced with is
  not a building and is never listed.

## Dependencies (contracts only)
- The `Instance` shape (persistence) and `AssetEntry` (asset-registry), both as data. It imports no
  other layer's `src/`.

## How to modify this blackbox safely
Add fields to the document additively and bump `format` only for a change that would stop an older
reader working. Keep `tests/` green: a city round trips unchanged, a file-backed building carries its
asset and a plain mass does not, a document from another format is refused, and an instance with no
open ground is refused.
