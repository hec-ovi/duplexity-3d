// map-state - public surface. See CONTRACT.md.

export { buildWorldMap } from "./world-map.js";
export {
  CONTRACT_VERSION,
  createProgress,
  enterInstance,
  clearInstance,
  visitRoom,
  isCleared,
  isEntered,
  isVisited,
} from "./progress.js";
export { doorState, exitState, unlockedInstances, win } from "./rules.js";
export {
  MapInvalidError,
  UnknownNodeError,
  UnknownPortalError,
  ExitLockedError,
} from "./errors.js";
