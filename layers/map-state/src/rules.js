// map-state - what is open right now.
//
// One place decides every lock, so a HUD, a door and the win check can never disagree. Adding a lock
// rule means adding a case here and a value to the `lock.rule` enum in the Portal schema; callers
// keep asking the same two questions.

import { ExitLockedError, UnknownPortalError } from "./errors.js";
import { isCleared } from "./progress.js";

function find(worldMap, portalId) {
  return (
    worldMap.doors.find((d) => d.portalId === portalId) ??
    worldMap.exits.find((e) => e.portalId === portalId) ??
    null
  );
}

// The instances a lock is still waiting on. Empty means the lock is satisfied.
function remainingFor(lock, worldMap, progress) {
  if (!lock) return [];
  if (lock.rule === "all_cleared") {
    return worldMap.required.filter((id) => !isCleared(progress, id));
  }
  if (lock.rule === "cleared") {
    return isCleared(progress, lock.instanceId) ? [] : [lock.instanceId];
  }
  // An unknown rule fails closed: a door nobody understands stays shut rather than letting the run
  // be won by a typo.
  return worldMap.required.filter((id) => !isCleared(progress, id));
}

export function doorState(worldMap, progress, portalId) {
  const entry = find(worldMap, portalId);
  if (!entry) throw new UnknownPortalError(portalId);
  const remaining = remainingFor(entry.lock, worldMap, progress);
  return { open: remaining.length === 0, rule: entry.lock?.rule ?? null, remaining };
}

// The run's win condition. A map with several gates is open as soon as one of them is, and reports
// the shortest list of instances still standing between the player and leaving.
export function exitState(worldMap, progress) {
  if (worldMap.exits.length === 0) return { open: false, remaining: [], portalId: null };
  let best = null;
  for (const exit of worldMap.exits) {
    const state = { ...doorState(worldMap, progress, exit.portalId), portalId: exit.portalId };
    if (state.open) return { open: true, remaining: [], portalId: exit.portalId };
    if (!best || state.remaining.length < best.remaining.length) best = state;
  }
  return { open: false, remaining: best.remaining, portalId: best.portalId };
}

// Every instance the player can reach from the entry through doors that are open right now, in map
// order. This is the "what is unlocked" list the map overlay draws.
export function unlockedInstances(worldMap, progress) {
  const reached = new Set([worldMap.entry]);
  const queue = [worldMap.entry];
  while (queue.length) {
    const here = queue.shift();
    for (const door of worldMap.doors) {
      if (door.from !== here || reached.has(door.to)) continue;
      if (!doorState(worldMap, progress, door.portalId).open) continue;
      reached.add(door.to);
      queue.push(door.to);
    }
  }
  return worldMap.nodes.map((n) => n.instanceId).filter((id) => reached.has(id));
}

export function win(progress, worldMap, portalId) {
  const exit = worldMap.exits.find((e) => e.portalId === portalId);
  if (!exit) throw new UnknownPortalError(portalId);
  const state = doorState(worldMap, progress, portalId);
  if (!state.open) throw new ExitLockedError(portalId, state.remaining);
  return { ...progress, won: true };
}
