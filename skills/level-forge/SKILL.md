---
name: level-forge
description: Generate and check playable 3D levels for duplexity-3d - streets with front doors, buildings with floors and stairwells, houses, NPCs who live in them, and a roguelike map where clearing every instance opens the exit gate. Use for building a level or a whole city, adding buildings or NPCs to one, validating a level's geometry, reading what a level unlocks, or changing how levels are generated.
---

# level-forge

Build a level you can walk. One command makes a street, the buildings on it, the people in them, and
the gate you leave by:

```text
CitySpec -> street + lot briefs -> floors behind each door -> NPCs -> one Adventure file
```

Levels are deterministic. The same flags build the same level, so a seed is a level you can share by
name.

## Choose a capability

| id | Use it for | Section |
| --- | --- | --- |
| `city` | A whole level in one command | [City](#city) |
| `street` | The outdoor level and its lot briefs | [Street](#street) |
| `building` | The floors behind one door | [Building](#building) |
| `house` | A single-floor building that stands alone | [House](#house) |
| `npcs` | Who lives in the level | [NPCs](#npcs) |
| `check` | Prove a level, and read what it unlocks | [Check](#check) |
| `keep` | Save a city you liked, and open it again | [Keep](#keep) |
| `play` | Walk the level | [Play](#play) |
| `voice` | Hear NPC lines out loud | [Voice](#voice) |
| `extend` | Change how levels are generated | [Extend](#extend) |

Run once per checkout before anything else:

```bash
npm install
```

<a id="city"></a>
## City

The whole level in one go: a street, the buildings on it, a cast, and the gate.

```bash
node tools/level.js city --id ashgate --theme city --label Ashgate \
  --size medium --lots 3 --floors 2,1,3 --npcs 2 --seed 11 --out city.json
```

| Flag | Default | Change it when |
| --- | --- | --- |
| `--size small\|medium\|large` | medium | You want 2x2, 3x3 or 4x4 city blocks. |
| `--lots <n>` | 2 to 4 per block | The level needs more or fewer buildings. |
| `--floors 2,1,3` | drawn from a mix | Buildings should differ in height. A short list repeats its last value. |
| `--accessible <0..1>` | 1 | Some buildings should have no way in. |
| `--wet <0..1>` | 0 | The streets should be wet, so the lamps reflect down them. It never rains. |
| `--npcs <n>` | 2 | Per instance. `0` builds an empty level. |
| `--seed <n>` | from the id | You want a different level from the same flags. |

Then always [check it](#check). The output is an Adventure document: the same file the runtime plays,
`server/` serves and `persistence` exports.

### Pinning what matters

Flags shape the whole city. To choose ONE building, write a `CitySpec` file and pass `--spec`;
flags still override what it says, and everything unpinned is generated around it.

```json
{
  "id": "ashgate", "theme": "city", "label": "Ashgate",
  "sizeHint": "medium", "lots": 6, "accessibleRatio": 0.7,
  "buildings": [
    { "block": 0, "slot": 1, "label": "The Vault", "program": "office", "floors": 6,
      "quest": { "itemId": "ashgate-ledger" } },
    { "block": 2, "slot": 0, "label": "Boarded up", "accessible": false }
  ]
}
```

```bash
node tools/level.js city --spec ashgate.spec.json --seed 11 --out city.json
```

- `block` is a city block in lattice order, `slot` a premises on it (0-3). The block is split into
  enough premises to hold the slot it was given.
- `accessible: false` seals a building: a mass with no door, nothing built behind it, and the exit
  gate never waits on it. `accessibleRatio` does the same to a share of the rest. One always opens.
- `quest` puts the named item in that building, on the floor you name or the top one, and finding it
  becomes that floor's goal. Every other floor keeps its own token.

This is the seam for one agent per building: hand an agent a `LotPlan` from [street](#street) and it
can build that one interior without knowing anything about the city around it.

<a id="street"></a>
## Street

The outdoor level on its own, plus one `LotPlan` per front door.

```bash
node tools/level.js street --id ashgate --theme city --size large --lots 4
```

Outdoors is open ground, not rooms: one floor, buildings standing on it as solid masses, and the gaps
between them are the streets. The edge of the level stops you and is drawn as nothing, so the city
ends in open air rather than in a wall. A building's height comes from how many floors it holds.

Returns `{ instance, lots, report }`. Feed each `lots[]` entry to [building](#building) to fill it in.
A lot brief fixes the ids the building must use, the room its front door opens into, and where its way
out leads back to. It says nothing about coordinates, because a building interior is its own space.

<a id="building"></a>
## Building

Every floor behind one door: rooms, doors between them, a stairwell, and a way back to the street.

```bash
node tools/level.js building --id ashgate-b1 --theme city --floors 3 --program office \
  --return-to ashgate --return-room st-1-0
```

| `--program` | Rooms per floor |
| --- | --- |
| `house` | 2 x 2 |
| `apartments` | 2 x 2 |
| `office` | 3 x 2 |
| `shop` | 2 x 1 |

Floor 1 is `<id>-f1`, floor 2 is `<id>-f2`, and so on. Each floor gets one thing to find, in the room
furthest from where you come in. Stairs land you in the same corner on both floors, so walking up and
back down returns you where you were. From four storeys up a building has a lift instead of stairs.

<a id="house"></a>
## House

One floor, standing on its own. With nothing to return to, its front door becomes the way out:

```bash
node tools/level.js house --id cottage --theme city --width 12 --depth 10
```

<a id="npcs"></a>
## NPCs

`city` populates every instance: public roles on the street (passer-by, street vendor, lookout),
private ones behind the doors (resident, caretaker, guard). Each NPC gets a body from the catalog, the
modes that body can actually perform, and a voice of its own, hashed from its id so a cast sounds
distinct.

NPCs do not think until spoken to. They run deterministic modes (idle, wander, patrol, follow, guard,
flee, attack, talk) in the browser, and only a real interaction calls a model. Add a cast to a level
built another way by editing its instances' `npcs[]` through `layers/npc/`.

<a id="check"></a>
## Check

Never ship a generated level unchecked. `validate` exits `1` when anything is wrong:

```bash
node tools/level.js validate --in city.json   # schema + geometry of every instance + the map
node tools/level.js map --in city.json        # nodes, doors, the gate, and what it waits for
```

`validate` runs the same geometry proof the generators are held to: no overlapping rooms, every room
reachable on foot, every doorway aligned on both sides, one-sided doors on outer walls only, and a
goal you can actually reach. On open ground it also walks the floor: buildings must sit inside the
level, clear of each other, with their door on their own face and a way through the streets to reach
it.

<a id="keep"></a>
## Keep

A city you liked, saved under a name and opened again exactly as it was:

```bash
node tools/level.js save --in city.json --name ashgate
node tools/level.js load --name ashgate --out city.json
```

Checkpoints are the portable bundle `persistence` exports, so one opens on any checkout. Saving
validates first: nothing that would fail to load gets written. They live in `$DUPLEXITY_CHECKPOINTS`,
or `checkpoints/` where you ran the command; `--dir` picks another place.

<a id="play"></a>
## Play

```bash
npm run dev                      # a generated city in the browser: WASD, mouse look, E to talk
node server/index.js             # the API: authoring, interactions, speech
npm test                         # every layer's contract tests
```

`npm run dev` builds a new city each visit. `?seed=1234` plays the same one again, so a seed is a
level you can pass to someone, and `?wet=0.8` soaks the streets. A map overlay in the corner keeps you
centred and slides the world under you: it draws only the rooms you have been in, the buildings on the
ground you are standing on, and marks a door you cannot use yet in red.

It is night. Lamps stand on the pavement, signs burn over the doors, and a room lights itself from
overhead. Where each light stands is in the level; how it looks is the renderer's, in
`layers/runtime/src/lights.js`.

The rogue rule: each instance has a goal. Clearing every required instance opens the exit gate, and
walking into an open gate wins the run. The gate never counts the instance it stands in.

<a id="voice"></a>
## Voice

NPC lines are spoken by Fish Audio through the backend, so the key never reaches the browser:

```bash
cp .env.example .env             # then fill in FISH_API_KEY
node --env-file=.env server/index.js
curl -s localhost:5174/speech -H 'content-type: application/json' \
  -d '{"utterance":"[stern] The gate is shut."}' | head -c 200
```

Without a key the game still runs: lines come back as text with `audio: null`. There is no
speech-to-text wired, so the player types.

<a id="extend"></a>
## Extend

Open ONE folder, and only that one. Each carries a `CONTRACT.md` that is enough to use it without
reading its code.

| Change | Folder |
| --- | --- |
| Block shape, what stands on it, the gate | `layers/city-planner/` |
| Floor plans, room mixes, stairwells | `layers/building-planner/` |
| What counts as a correct map (the validator) | `layers/scenario-creator/` |
| Unlock rules, what the exit waits for | `layers/map-state/` |
| NPC data, modes, the interaction brain | `layers/npc/` |
| Speech providers | `layers/voice/` |
| Kits and generated assets | `layers/asset-registry/`, `layers/asset-gen/` |
| Rendering, camera, collision, the blueprint overlay | `layers/runtime/` |
| What things are made of: asphalt, paving, concrete, a building's windows and shopfront | `layers/surfaces/` |
| The command line itself | `tools/` |

`docs/INDEX.md` is the full dispatcher. Rules that hold everywhere:

- A layer may use another layer's `CONTRACT.md` and `schema/`, never its `src/`. Cross-layer calls are
  injected as handles.
- Indoors is rooms: axis-aligned boxes on a uniform grid, which is what makes a doorway land on
  exactly the same plane from both sides. Outdoors is open ground with solid masses on it, and the
  streets are the gaps. Do not hand-place coordinates: change the generator and rebuild with a seed.
- A door leading out of an instance (`roomB` is `"EXIT"` or `"LINK"`) must sit on an outer wall. On a
  shared wall the runtime cuts the opening on one side only.
- Nothing is random. No `Math.random`, no clock: seeds only, or the same spec stops rebuilding the
  same level.
