# Changelog

What the project does now, newest first.

## 0.3 - The outdoors is open

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
