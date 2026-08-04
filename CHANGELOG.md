# Changelog

What the project does now, newest first.

## 0.19 - Fast again

The city had become an offline renderer. Four things, measured rather than guessed:

- **Point light shadows are gone.** A point light's shadow is a CUBE: six renders of the whole scene,
  every frame, per light. Two of them plus the moon was fourteen passes over eight thousand objects.
  The city lights itself with emissive geometry, which costs nothing.
- **Only what you would miss casts a shadow**: masses, walls, props and people. A balcony and a window
  frame cost a pass each in the moon's map and read the same either way.
- **The cones of haze under the lamps are gone.** Forty of them, transparent and additive over the
  street, were the single biggest cost: at 1280x720 they alone were most of the frame.
- **The drawing buffer is capped.** The scene is drawn to two targets, blurred for the bloom and
  graded, so every pixel is paid for several times; on a big monitor that is four million of them.
  Past 1.3 megapixels the buffer is rendered smaller and stretched to fit.

Measured in the same software renderer, at 1280x720: 123ms a frame down to 21ms. At 1920x1080 it
stays at 21ms instead of scaling with the window.

- Materials shared rather than made per object: a skyline of a hundred and fifty towers is now four
  merged meshes wearing four materials, and doors, roof gear, neon and awnings are made once for the
  city rather than once each. 466 materials down to about 200.

## 0.18 - Buildings with shapes, and something to look at while it loads

- The massing library is the shape vocabulary the reference city actually has, not five stacks of
  boxes: masses that BATTER inward as they rise or FLARE into a crown, a tower cut through by a void
  and carried on legs, a shaft that narrows to a waist and widens again, two shafts joined at the
  top by a bridge. Weighted so most of a street LEANS.
- A tier is a tapered box now, with the same six faces and material groups a box had, so a wall that
  leans is dressed at the width it actually is at each storey.
- Something on every tall roof: a mast with a warning light and its guys, a girder frame, a dish, a
  spire, a run of plant.
- Light running the full height of a wall, up its corners and its seams. A tall building is read at
  night by those lines, not by its windows.
- Megastructures: four shapes three to six times anything on the ground, spaced round the city so one
  is in view from anywhere in it. The skyline ring leans too, and stands taller the further out.
- A loading screen that says which part is slow, and two reasons it is faster: every material is
  compiled BEFORE the first frame instead of stalling on it, and the street is kept standing while
  you are inside a building, so stepping back out is immediate.
- Facade sheets are shared between buildings that would wear the same wall anyway, and painted at
  512 rather than 1024. The windows are separate objects, so the sheet carries no fine detail: a
  city's walls went from about a hundred megabytes of texture to under thirty.

## 0.17 - cityscape is its own box

- Everything the city LOOKS like in three.js moved into `layers/cityscape/`: the fabric, the parts
  bolted to a building, the five doors, the lamps and their haze, the props, the rails, the traffic,
  the shuttle, the projections, the materials and the pool of real lights. One call in, one object
  out: a group to add to a scene, and an `update` to call each frame.
- `runtime` keeps what it is for: the simulation, the camera and controls, the renderer and its post
  chain, and the HTML over the canvas. It takes the city as a single injected handle, so a head-less
  test runs the whole game with nothing to look at.
- `layers/runtime/fixtures/scene-model.example.json` publishes the shape a SceneModel has, so
  `cityscape` is tested against the shape it is handed rather than against the code that makes it.

## 0.16 - A city with things in it, and a panel to talk through

- Street props from the LEVEL, so they are solid and the walkability proof counts them: vehicles and
  bins parked along the kerbs, traffic lights on the corners of every intersection.
- Elevated rails over the city with trains running along them, lit down both edges.
- A shuttle you ride: the level lays a line down its middle street with a stop opposite each block,
  and `F` steps you on and off while it is standing at one. Riding, the shuttle does the moving.
- Projected figures: a panel that is a projector, with the image standing in the air in front of the
  wall in a cone of haze, its scan drifting.
- The dialogue panel is the city's own UI: a header bar naming who is talking, the line, and the
  controls under it.
- Fixed: the dialogue panel never appeared. Showing it cleared the inline style, which handed it back
  to the rule that hides it.

## 0.15 - The look: parts that differ, ground that burns, a grade over the lot

- Five kinds of window (square, tall, ribbon, bay, curtain grid), four balconies (slab, cage, French,
  corner), five front doors (shopfront, flush, recessed, double, roller shutter), four sign mountings
  (fascia, blade, roof box, framed) and four street lamps (post, twin, reach, bollard), plus brackets
  on building faces. Each building draws one look from its seed and wears it throughout.
- Every building is clad from a set of its own: precast panel, tile, corrugated sheet, brick or a
  glass curtain, each with its own colours.
- Pavements carry light in the joints between their slabs, cold against the warm lamps over them.
- A cone of haze under every lamp, all of them in one draw.
- A grade over the whole frame: shadows pulled towards violet, highlights left warm, corners taken
  down.
- Panels up the side of a building carry a trade or a lit graphic (bars, rings, a wave, a grid, a
  figure) instead of invented words.
- Fixed: every PHOTOGRAPHED surface rendered black. Textures start on a placeholder pixel while the
  file loads, and the GPU texture behind one was never remade when the picture arrived, so roads,
  walls, floors and ceilings all sampled that pixel. The placeholder is white now, and the texture is
  thrown away and remade when its image lands.

## 0.14 - Six or seven places, and the way to them

- `places` in a CitySpec: how many buildings you can walk into, 6 by default, chosen as far apart as
  the city allows and one per block until the blocks run out. A city can stand hundreds of buildings;
  a run is a walk between a handful of landmarks. Everything else is scenery with no door.
- The map marks each place still to finish, names the nearest one with the metres to it, and draws a
  line from where you stand to it. A place off the edge of the map is pinned to the edge so it still
  points the way, and the HUD carries an arrow for the direction.
- `--places <n>` on the level toolkit, and the CitySpec written up in `SKILL.md` as the one thing an
  LLM authors.

## 0.13 - Modernised: WebGPU, node post, height haze

- The renderer is `WebGPURenderer`, which falls back to WebGL2 on its own where WebGPU is missing.
  Post-processing moved off `EffectComposer` (WebGL only, and what a three-year-old project would
  have used) onto the node pipeline, which compiles to either backend.
- Bloom is taken from the scene's EMISSIVE output on a second render target, not from everything
  bright. A lit sign glows into the air; a pale wall under a lamp does not, which is the difference
  between a night city and a washed-out one.
- Exponential HEIGHT fog: haze lying on the streets and thinning as it climbs, so towers rise clear
  of it. Flat fog is what made the night read as a dark room.
- A texture with no image throws on WebGPU where WebGL shrugged, so every texture starts on one blank
  pixel and takes its picture whenever the file lands.

## 0.12 - Something to look at

- Holo adverts: big lit panels bolted up the walls, portrait running up a tower or a banner across
  it, each with a word on it and a rule round it, all of it burning. This is what a street of
  concrete was missing after dark.
- Neon along the top of every tier, in the colour that building burns.
- A skyline beyond the walkable ground: a ring of towers standing past the last block, taller the
  further out they go, so the city carries on instead of ending at a line. They are `room.skyline[]`,
  their own field, so nothing collides with one and no door is ever put on one.
- Flying traffic: lanes of lights crossing above the rooftops, a bright head with a streak behind it,
  two draws for the lot.
- Fixed: windows stood PROUD of the wall, so from an angle they read as boxes glued on. A window sits
  in the wall with its face a centimetre clear of it.

## 0.11 - A city with a skyline

- A building is a stack of masses, not one extruded box: five shapes (slab, setback, stepped,
  shoulder, tower) drawn from the seed, with a ledge where each step lands and a parapet on top. This
  is the technique SynthCity uses, and it is what a street of boxes was missing.
- Buildings stand tall. How tall a building IS and how much of it you can walk into are now two
  different numbers: a mass carries its storeys (up to twenty-odd), a lot carries the floor or three
  behind its door. The city has a skyline; a run through it is still a few conversations.
- `blocks: 4` builds exactly four city blocks, and naming places in `buildings[]` makes those the
  places and everything else scenery. "Four blocks, and these two places in it" is the whole spec.
- A door on a building's face hangs on the wall rather than in it. Recessed, the mass swallowed the
  leaf and all you saw was a frame with dark wall inside it.
- Fixed: the awning and the shop sign sat at the height of the door head and grew through it; and the
  play prompt never went away, because the click that starts play lands on the canvas.

## 0.10 - Windows are windows

- Every window is its own object standing in the wall, with its own light on or off, its own colour
  and sometimes a blind pulled down. They used to be rectangles painted into one sheet per building,
  which is why every wall of a city looked the same. The ones that look alike are drawn together in
  one instanced mesh, so a street of hundreds costs a handful of draws.
- The facade sheet is the WALL now: bands, ledges, the shopfront and the parapet. What is bolted to a
  building, windows included, is geometry.

## 0.9 - Rooms with something in them, and light that behaves

- Rooms are sized in METRES, not by a fixed grid: a floor is cut into rooms about 6.5m across, never
  under 4.2m, at most four a side. A big premises gets more rooms rather than one hall, and a small
  one is not sliced into corridors. City blocks are 40m and hold two or three places, so what is
  inside is worth walking into.
- Shadows. Outdoors, one across the whole level from the moon; near to hand, the two nearest lamps.
  A point light shadow is six renders, so past those two nobody can tell.
- Reflections. The scene lights itself: an environment is captured from the standing scene, so a wet
  road and a tiled floor come back with the sky and the signs in them.
- Every door between two rooms is signed with what is through it, a plate each side, so a floor can be
  read without walking into every wall.
- A room's floor suits what it is for: boards in a living room, tiles in a kitchen, worn concrete in a
  shop. Windows have glazing bars and a sill, so a lit floor reads as windows rather than as pale
  squares. A front door has a lit glazed panel in it.
- Shift runs, space jumps, and holding the right button pulls the view in.

## 0.8 - Rooms you would walk into

- Floors are rooms with names and something to be: a house is a hall, a living room, a kitchen and a
  bathroom; an office is a reception and the rooms behind it. Nothing narrower than 3.4m counts as a
  room, city blocks grew to 32m so the premises on them are worth entering, and the floor plan writes
  each room's name in it.
- Indoors has a ceiling. A room open to a black sky had nothing for its own lamp to bounce off.
- Photographed materials, all CC0 from Poly Haven: asphalt, paving, interior floor tiles, plaster
  walls and ceilings. `npm run textures` fetches them into the app's public folder; the catalogue that
  names them is committed and the files are not. Without them the painted surfaces stand in, so the
  project runs either way.
- Walking into a place puts you IN it, looking into it, clear of the door you came through. It used to
  leave you a stride from the way out, facing it, so holding forward walked you straight back out.
- Every door that leaves a place is signed and lit: EXIT, UP, LIFT DOWN. A way out is now something
  you can see across a room.
- Lamps come up and go out over about a second, and a slot in the light pool never jumps from one lamp
  to another: it goes dark first. Walking down a street used to switch lights on and off in front of
  you.
- A cast keeps clear of where the player arrives, a shop sign no longer grows through its own awning,
  and a blade sign stays on the wall it is fixed to and under the parapet.

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
