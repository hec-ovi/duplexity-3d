# Changelog

What the project does now, newest first.

## 0.7 - Places with names on them

- `facade` is a new box: give it the shape of a building and it returns what is bolted to it, in the
  building's own frame. Balconies on the storeys above the street, an awning over a shopfront, and
  the cartel over the door with the name of the place lettered on it (MARU RECORDS, KESTREL & CO). A
  tall building also gets a blade sign at right angles to the wall, so it reads from up the street.
- A door is a door: a surround standing proud of the wall, a leaf set back in it, a handle and a
  step. A door on a building's face has nothing cut out of it, so it is built rather than carved; an
  interior doorway is a real hole and gets the surround alone.
- You come out of the front door you went in by. A `LINK` now carries `spawnAt` and `facing`, so
  leaving a building puts you on the pavement outside its own door, looking at the street. It used to
  drop you in the middle of the room it named, which on open ground is the middle of the whole city.
- A building's front is painted to fit its own walls: one sheet over the wide sides, one over the
  narrow ones, a whole number of bays across each and one row per storey. Nothing tiles, so no window
  is cut in half and no two buildings wear the same front.
- A wet road is a mirror laid under the asphalt with the asphalt thinned over it, so what comes back
  up the street is the lamps and the signs rather than a second city.
- Names hang over NPCs, small and quiet. What someone says goes in one panel at the bottom of the
  screen, in the same place every time, so a line is readable whether or not you can see who said it.

## 0.6 - Night

- The city is lit. A lamp stands on each side of every block, a sign burns over every front door, and
  every room indoors has a lamp overhead. Where light stands is data the level carries
  (`room.lights[]`); how tall it is, what colour it burns and how many are lit at once are the
  renderer's business.
- `runtime/src/lights.js` keeps a pool of six real lights that follows the player and lands on
  whichever are nearest, so a street can hold forty without a forward renderer choking on them. The
  rest are still there to look at, as glowing geometry.
- ACES tone mapping, exponential fog the far end of the street fades into, and bloom over the signs,
  lit windows and lamp heads. A head-less test gets a stub renderer and draws straight through.
- A sign burns the colour that building's own front is painted.
- `wet` (0 to 1, dry by default, and it never rains) darkens the asphalt, leaves standing water in it
  and takes the tooth off it, so the lamps reflect down the street. `--wet` on the toolkit, `?wet=0.8`
  in the browser.

## 0.5 - Made of something

- `surfaces` is a new box: it paints asphalt, paving, plaza and concrete as tiling sheets, and a whole
  building's outside as one sheet with a window per storey per bay, a ledge under each storey, a
  glazed shopfront along the ground and a parapet across the top. It draws onto a canvas the caller
  hands it and knows nothing about three.js, so it is proved without a browser or a GPU.
- The runtime wraps those onto the scene: each surface repeats at its true size in metres, so a paving
  slab is the same size on a 4m pavement and an 80m road, and a building carries its own facade on all
  four sides with the bays the same width whichever way you look at it. Lit windows and shop signs are
  an emissive map painted from the same plan as the albedo, so a window that glows is always a window
  that is there. Without the painter injected, everything falls back to flat colour.
- A mass now carries its `floors` and `program`, so a shop is glazed along the ground and a house is
  not, and a six-storey building gets six rows of windows.
- The street asks the building side what fits before handing out a brief (`building-planner.programFits`),
  so a small premises is never given an office floor plan it cannot hold. A city now builds for every
  seed at every size, which is what `npm run dev` picks at random.

## 0.4 - Cities you can author, and keep

- A building can be sealed: a mass with no door, nothing built behind it, and no node on the map, so
  the exit gate never waits on a place you cannot enter. `accessibleRatio` seals a share of them and
  one building always opens.
- A `CitySpec` can pin individual premises by block and slot: its name, program, height, whether it
  opens at all, and where the run's quest sits. Everything unpinned is generated around them, so one
  chosen building and a city built from a seed are the same command.
- A pinned quest puts a named item in a chosen building, on a chosen floor (the top one by default),
  and finding it becomes that floor's goal. Every other floor keeps its own token.
- `node tools/level.js city --spec ashgate.spec.json` builds from a spec file, with flags overriding
  what it says, and `save --name` / `load --name` keep a city you liked as a portable bundle.
  Checkpoints validate before they are written, so anything on disk is something that will load.

## 0.3 - The outdoors is open

- Names and speech are HTML laid over the canvas, not glyphs in the 3D scene. A line is always
  legible and never rendered at the size of a building, it wraps, and it needs no font atlas. The
  troika dependency is gone.
- A street level is city blocks: each block is a 4.5m pavement carrying two to four premises, each
  with its own footprint, height (houses and shops around the odd tower) and front door onto the
  pavement, and the roadway is what no block covers. The pavement is a walk zone, so NPCs are placed
  on it rather than in the road. A front door never faces the inside of its own block, where the gap
  between two premises is not a street: the walkability proof rejects that outright.
- A cast is scattered over its room (or over the walk zones where a room has them) instead of stacking
  on the room's centre, and never inside a building.

- A street level is open ground, not rooms. One floor, buildings standing on it as solid masses, and
  the gaps between them are the streets: no corridors, nothing to squeeze through. The edge of the
  level stops you and is drawn as nothing, so the city ends in open air rather than in a wall.
- Buildings sit on a lattice with a full street between any two and a street round the outside, so
  the streets connect by construction and every building has four frontages. A mass is as tall as the
  floors it holds, and its door is on its own face: you walk up to it and cross to the instance inside.
- The validator learned open ground, where a portal graph proves nothing: buildings must sit inside
  the level and clear of each other, a door must be on its own building's face, and every door must be
  WALKABLE to, proved by flooding the open floor. A building parked across the only approach is caught.
- Buildings of four storeys or more have a lift rather than a staircase.
- The map overlay keeps the player centred and slides the world under them, at a scale taken from the
  room they are in. Discovering a room no longer rescales everything already learned. It draws the
  buildings on the ground it is standing on.

## 0.2 - A level toolkit, cities, and a run you can win

- `SKILL.md` makes the repo an agentic skill: pick a capability, run one command, check the result.
  It ships at the root and in `skills/` and `plugins/` so any installer finds it, kept identical by
  `npm run skill:sync` and a test that fails on drift.
- `npm run dev` plays a generated city: walk the street, go through a front door, up a stairwell, and
  out through the gate once every place is finished. A map overlay fills in as you walk, drawing only
  the rooms you have been in and marking a door you cannot use yet. `?seed=1234` replays a city.
- `tools/level.js` builds a `city`, a `street`, a `building` or a `house`, and checks a level with
  `validate` (schema, geometry, map; exit 1 when broken) and `map` (what is unlocked, what the gate is
  waiting for). Everything is deterministic and seeded.
- `city-planner` lays roads on an integer grid, places a front door per lot, one entry and one locked
  exit gate, and hands out a `LotPlan` per building. `building-planner` turns each brief into floors
  joined by a stairwell, with a way back out; a house is a one-floor building whose front door is the
  exit. The two share ids, never a coordinate space: a floor is a blueprint of its own.
- Generated levels come populated: public roles on the street, private ones behind the doors, each NPC
  with a body from the catalog, the modes that body can perform, and a voice of its own.
- NPC lines are spoken by Fish Audio behind `POST /speech`, so the key stays on the backend. A missing
  key, a refusal or an outage return the line as text, so speech never blocks play.
- The geometry validator is public (`scenario-creator.validateLayout`), so every generator is held to
  one definition of a correct map. It now knows one-sided doors and refuses one placed on an interior
  wall, where the runtime would cut the opening on one side only.
- A door can lead to another instance. A portal with `roomB: "LINK"` carries `link.instanceId`, so a
  street door opens into a building, a stairwell joins two floors, and each side is authored on its
  own portal.
- A door can be locked. `portal.lock` names a rule (`all_cleared`, `cleared`) that `map-state` weighs
  against the run. A locked gate is scenery: you cannot leave through it and it does not satisfy
  `reach_exit`.
- `map-state` is the run's ledger: it derives the world map from the Adventure (nodes are the
  instances, doors are the linked portals, the exit is the gate, the entry is `progression.start`),
  then tracks what has been entered, cleared and seen, and answers what is open. The exit gate opens
  when every required instance is cleared, and never counts the instance it stands in.
- The runtime reports `onTransit` once when the player walks into an open linked door, and `load`
  takes a `spawnRoomId` so they arrive on the far side. It also keeps the rooms walked into and
  serves `blueprint()`, a floor plan holding only those rooms.

## 0.1 - The engine

- Ten isolated layers behind contracts, one Adventure document as the wire format, and a playable
  first-person three.js slice: authored worlds, deterministic NPCs with an LLM interaction seam,
  voice, export/import, an adventure browser, and async asset generation.
