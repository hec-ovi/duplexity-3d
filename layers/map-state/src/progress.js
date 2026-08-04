// map-state - the run ledger.
//
// Every write returns a NEW progress object and leaves its argument untouched, so a caller can keep
// the previous state (undo, a save point, a test assertion) without defensive copying. Writes are
// monotonic: entering, clearing and revealing only ever add.

import { UnknownNodeError } from "./errors.js";

export const CONTRACT_VERSION = "1.0";

function knows(worldMap, instanceId) {
  return worldMap.nodes.some((n) => n.instanceId === instanceId);
}

function withAdded(list, value) {
  return list.includes(value) ? list : [...list, value];
}

export function createProgress(worldMap) {
  return {
    contractVersion: CONTRACT_VERSION,
    entered: [worldMap.entry],
    cleared: [],
    visitedRooms: {},
    won: false,
  };
}

export function enterInstance(progress, worldMap, instanceId) {
  if (!knows(worldMap, instanceId)) throw new UnknownNodeError(instanceId);
  return { ...progress, entered: withAdded(progress.entered, instanceId) };
}

export function clearInstance(progress, worldMap, instanceId) {
  if (!knows(worldMap, instanceId)) throw new UnknownNodeError(instanceId);
  return { ...progress, cleared: withAdded(progress.cleared, instanceId) };
}

// What the blueprint overlay is allowed to draw. The room is recorded as given: map-state does not
// hold the geometry, so it cannot and does not check that the room exists.
export function visitRoom(progress, instanceId, roomId) {
  const seen = progress.visitedRooms[instanceId] ?? [];
  if (seen.includes(roomId)) return progress;
  return {
    ...progress,
    visitedRooms: { ...progress.visitedRooms, [instanceId]: [...seen, roomId] },
  };
}

export function isCleared(progress, instanceId) {
  return progress.cleared.includes(instanceId);
}

export function isEntered(progress, instanceId) {
  return progress.entered.includes(instanceId);
}

export function isVisited(progress, instanceId, roomId) {
  return (progress.visitedRooms[instanceId] ?? []).includes(roomId);
}
