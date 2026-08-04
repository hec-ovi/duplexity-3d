# cityscape - Contract

## Purpose
Build the city you look at. Given one SceneModel, this returns a three.js group holding everything in
that place - ground, buildings, doors, windows, lamps, parked vehicles, rails, traffic, projections -
and one `update` that moves all of it. Whoever owns the renderer never has to know a rail from a lamp.

It decides nothing about the level. What stands where comes from the model; what a surface is painted
like and what is bolted to a building are other boxes, injected as handles.

## Inputs (params in)
- `createCityscape(model, deps?) -> Cityscape`
  - `model`: a runtime SceneModel - rooms, walls, blocks, zones, lights, props, skyline, portals,
    npcs, a transit line and the world bounds. Example:
    [`layers/runtime/fixtures/scene-model.example.json`](../runtime/fixtures/scene-model.example.json)
  - `deps.registry?`: an `asset-registry` handle (`{ get, query }`), for the size of a prop or a body.
    Absent or missing an id, a placeholder is used and `warn` is told; the scene never fails to build.
  - `deps.paintSurface?` / `deps.photoSurface?` / `deps.textureBase?`: `surfaces` handles. Absent,
    everything is a flat colour, which is what a head-less test sees.
  - `deps.dressFacade?`: a `facade` handle. Absent, buildings are bare masses.
  - `deps.npcs?`: who is in the place, so their bodies can be driven. Defaults to the model's own.
  - `deps.warn?`: warning sink.

## Outputs (params out)
- `Cityscape`:
  - `group` - one `THREE.Group` holding the whole place, its lights included. Add it to a scene.
  - `open` - whether this is open ground (a street) rather than a room.
  - `shuttle` - the rideable shuttle, or null where the level lays no line. It answers `seat()`,
    `heading()`, `stopped()`, `boardable(position)` and `kerbside()`; the caller decides what riding
    means for the player.
  - `syncNpcs(states, camera, dt)` - put the people where the simulation says they are.
  - `update(elapsed, dt, at)` - move everything on one frame: the light pool follows `at`, the
    traffic and the rails run on `elapsed`, the shuttle drives on `dt`.
  - `dispose()` - give back every buffer, texture and light. A level with many doors would otherwise
    leak one city's worth per crossing.

## Errors
None thrown. A missing asset, a missing painter and a missing facade each degrade to something that
still draws; anything unexpected goes to `warn`.

## Invariants this layer will never break
- Nothing is authored here. Where a building, a lamp, a van or a stop STANDS comes from the model;
  this box decides only what it looks like and how it moves.
- Deterministic: no `Math.random`, no clock. Everything varying is seeded off the instance id or a
  part's own id, so a city looks the same every time it is loaded.
- Anything that looks alike is drawn together. A city's worth of windows, balconies, parked vehicles
  and traffic lights is a handful of instanced draws, not one per object.
- A light SOURCE (a window, a sign, a lamp head, a train's glass) neither casts a shadow nor takes
  one. Ground takes shadows and casts none: a road is a slab a centimetre thick, and casting from it
  lands its own shadow back on its own face.
- Only a small pool of real lights is alive at once, on whichever are nearest the player, fading in
  and out. Everything else that appears lit is emissive geometry, which costs nothing.
- `dispose()` leaves nothing behind.

## Dependencies (contracts only)
- `runtime` (the SceneModel it is handed), `surfaces` (painting), `facade` (what is bolted to a
  building), `asset-registry` (sizes). All injected as handles or as data; it imports no other
  layer's `src/`.

## How to modify this blackbox safely
One file per thing you can see. `src/scene.js` walks the model and builds the fabric (ground, masses,
walls, ceilings, the skyline). `src/facade-parts.js` turns the whole city's windows, balconies,
awnings, neon and signs into batched meshes in one pass; `src/doorways.js` builds the five kinds of
front door; `src/lamps.js` the four kinds of street lamp and the haze under them; `src/props.js` what
is parked and standing; `src/holograms.js` the projected figures; `src/skyrail.js` the rails and their
trains; `src/traffic.js` what flies over; `src/shuttle.js` what you ride; `src/lights.js` the pool of
real lights; `src/materials.js` turns painted and photographed surfaces into three.js materials.
`src/index.js` is assembly and owns the lifetime.

Add something you can see by adding a file, building it in `createCityscape`, and moving it in
`update`. Keep `tests/` green: the group is named and counted, materials repeat at their own scale
and are painted once, the light pool fades rather than switching, and the shuttle only takes you on
while it is standing at a stop.
