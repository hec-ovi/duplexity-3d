// map-state - the closed error set from CONTRACT.md. Nothing else escapes this layer.

class MapStateError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = code;
  }
}

export class MapInvalidError extends MapStateError {
  constructor(reason) {
    super("MAP_INVALID", `adventure does not form a map: ${reason}`);
  }
}

export class UnknownNodeError extends MapStateError {
  constructor(instanceId) {
    super("UNKNOWN_NODE", `not an instance on this map: ${instanceId}`);
  }
}

export class UnknownPortalError extends MapStateError {
  constructor(portalId) {
    super("UNKNOWN_PORTAL", `not a door or exit on this map: ${portalId}`);
  }
}

export class ExitLockedError extends MapStateError {
  constructor(portalId, remaining) {
    super("EXIT_LOCKED", `exit ${portalId} is still shut; ${remaining.length} instance(s) left to clear`);
    this.remaining = remaining;
  }
}
