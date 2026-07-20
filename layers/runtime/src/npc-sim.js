// runtime - deterministic NPC behaviour (pure, no three.js).
//
// Every NPC mode has a fixed client-side behaviour; the (future) play-time LLM only ever picks WHICH
// mode. This module advances one NPC per tick: it steers toward a destination through the nav's
// doorway waypoints, slides along walls with the same collision resolver the player uses, and reports
// which animation clip the body should play. Any "random" choice comes from a seeded RNG (never
// Math.random()), so the whole sim is node-testable and replays identically.

import { resolveMove } from "./collision.js";
import { seededRng } from "./rng.js";

export const NPC_DEFAULTS = {
  speed: 1.8, // m/s, a touch slower than the player
  radius: 0.3,
  arrive: 0.3, // within this of a destination counts as arrived
  waypointSkip: 0.5, // skip a waypoint (e.g. a doorway centre) once this close, so movers pass through
  wanderPause: 1.2, // seconds an NPC pauses between wander goals
  followStandoff: 1.8,
  attackRange: 1.3,
  alertRange: 6,
  fleeAhead: 3, // how far ahead (m) a fleeing NPC aims each tick
  stuckLimit: 0.6, // seconds wedged before a wanderer repicks a goal
};

// Yaw such that the body's forward (-sin, -cos) points along (dx,dz). Matches the player/controls
// convention: facing 0 looks down -Z.
function yawToward(dx, dz) {
  return Math.atan2(-dx, -dz);
}

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function roomById(model, id) {
  return model.rooms.find((r) => r.id === id) ?? null;
}

function reached(pos, dest, eps) {
  return dist(pos.x, pos.z, dest.x, dest.z) <= eps;
}

// The first waypoint farther than `skip` (so a mover does not stall exactly on a doorway centre),
// else the last waypoint.
function nextWaypoint(path, pos, skip) {
  for (const wp of path) {
    if (dist(pos.x, pos.z, wp.x, wp.z) > skip) return wp;
  }
  return path[path.length - 1];
}

// One collision-resolved step of at most `maxDist` toward (tx,tz). Returns the resolved x/z, whether
// it actually moved, and the intended direction (for facing).
function stepToPoint(colliders, pos, tx, tz, maxDist, radius) {
  const dx = tx - pos.x;
  const dz = tz - pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6 || maxDist <= 0) return { x: pos.x, z: pos.z, moved: false, dir: null };
  const step = Math.min(maxDist, d);
  const nx = pos.x + (dx / d) * step;
  const nz = pos.z + (dz / d) * step;
  const r = resolveMove(colliders, { x: pos.x, z: pos.z }, { x: nx, z: nz }, radius);
  const moved = Math.hypot(r.x - pos.x, r.z - pos.z) > 1e-4;
  return { x: r.x, z: r.z, moved, dir: { x: dx / d, z: dz / d } };
}

// Steer toward a destination through the nav's doorway waypoints.
function stepVia(ctx, pos, dest, maxDist, radius) {
  const path = ctx.nav.findPath({ x: pos.x, z: pos.z }, dest);
  const wp = nextWaypoint(path, pos, NPC_DEFAULTS.waypointSkip);
  return stepToPoint(ctx.colliders, pos, wp.x, wp.z, maxDist, radius);
}

function randomPointInRoom(room, rng, inset) {
  const w = Math.max(0, room.size.x - 2 * inset);
  const d = Math.max(0, room.size.z - 2 * inset);
  return { x: room.min.x + inset + rng() * w, z: room.min.z + inset + rng() * d };
}

function roomCorners(room, inset) {
  return [
    { x: room.min.x + inset, z: room.min.z + inset },
    { x: room.max.x - inset, z: room.min.z + inset },
    { x: room.max.x - inset, z: room.max.z - inset },
    { x: room.min.x + inset, z: room.max.z - inset },
  ];
}

/** Create the mutable play-time state for one NPC placement (from the scene model). */
export function createNpcState(placement, { seed = 0 } = {}) {
  const pos = placement.position;
  return {
    id: placement.id,
    name: placement.name,
    disposition: placement.disposition,
    bodyRef: placement.bodyRef,
    homeRoom: placement.homeRoom,
    homePos: { x: pos.x, z: pos.z },
    position: { x: pos.x, y: pos.y, z: pos.z },
    facing: placement.facing ?? 0,
    mode: placement.startMode ?? "idle",
    target: null, // resolved {x,z} destination for move_to, set by an interaction
    targetRef: null, // the string entity/exit/object ref that produced `target` (echoed in selfContext)
    memory: [],
    animation: "idle",
    // internal steering scratch
    wanderGoal: null,
    pauseTimer: 0,
    stuckTimer: 0,
    patrol: null,
    patrolIndex: 0,
    rng: seededRng(seed, placement.id),
  };
}

/** The animation clip a body should play for a mode (resolved against real clips by the actor). */
export function animationForMode(mode, moving) {
  switch (mode) {
    case "dead":
      return "die";
    case "attack":
      return moving ? "walk" : "attack";
    case "talk":
      return "talk";
    default:
      return moving ? "walk" : "idle";
  }
}

/**
 * Advance one NPC by dt, mutating `state` (position, facing, mode, animation). `ctx` supplies the
 * shared world: { model, colliders, nav, player:{x,z}|null, speed?, radius? }. Deterministic given
 * the state's rng.
 */
export function stepNpc(state, dt, ctx) {
  const { model, colliders, player } = ctx;
  const speed = ctx.speed ?? NPC_DEFAULTS.speed;
  const radius = ctx.radius ?? NPC_DEFAULTS.radius;
  const maxDist = speed * dt;
  const D = NPC_DEFAULTS;
  let moved = false;

  const faceTo = (x, z) => {
    const dx = x - state.position.x;
    const dz = z - state.position.z;
    if (Math.hypot(dx, dz) > 1e-6) state.facing = yawToward(dx, dz);
  };
  const apply = (r) => {
    state.position.x = r.x;
    state.position.z = r.z;
    if (r.moved && r.dir) state.facing = yawToward(r.dir.x, r.dir.z);
    moved = r.moved;
  };

  switch (state.mode) {
    case "idle":
    case "dead":
      break;

    case "talk":
      if (player) faceTo(player.x, player.z);
      break;

    case "guard": {
      const dp = dist(state.position.x, state.position.z, state.homePos.x, state.homePos.z);
      if (dp > 0.5) apply(stepVia(ctx, state.position, state.homePos, maxDist, radius));
      else if (player && dist(state.position.x, state.position.z, player.x, player.z) <= D.alertRange)
        faceTo(player.x, player.z);
      break;
    }

    case "follow": {
      if (player) {
        const d = dist(state.position.x, state.position.z, player.x, player.z);
        if (d > D.followStandoff) apply(stepVia(ctx, state.position, player, maxDist, radius));
        else faceTo(player.x, player.z);
      }
      break;
    }

    case "attack": {
      if (player) {
        const d = dist(state.position.x, state.position.z, player.x, player.z);
        if (d > D.attackRange) apply(stepVia(ctx, state.position, player, maxDist, radius));
        else faceTo(player.x, player.z);
      }
      break;
    }

    case "flee": {
      if (player) {
        let ax = state.position.x - player.x;
        let az = state.position.z - player.z;
        const L = Math.hypot(ax, az) || 1;
        ax /= L;
        az /= L;
        const dest = { x: state.position.x + ax * D.fleeAhead, z: state.position.z + az * D.fleeAhead };
        apply(stepToPoint(colliders, state.position, dest.x, dest.z, maxDist, radius));
      }
      break;
    }

    case "move_to": {
      if (state.target) {
        apply(stepVia(ctx, state.position, state.target, maxDist, radius));
        if (reached(state.position, state.target, D.arrive)) {
          state.mode = "idle";
          state.target = null;
          state.targetRef = null; // arrived: clear the reported destination too, so it does not linger in selfContext
        }
      }
      break;
    }

    case "wander": {
      const room = roomById(model, state.homeRoom);
      if (!room) break;
      if (state.pauseTimer > 0) {
        state.pauseTimer -= dt;
        break;
      }
      if (!state.wanderGoal) state.wanderGoal = randomPointInRoom(room, state.rng, radius + 0.4);
      apply(stepVia(ctx, state.position, state.wanderGoal, maxDist, radius));
      if (reached(state.position, state.wanderGoal, D.arrive)) {
        state.wanderGoal = null;
        state.pauseTimer = D.wanderPause;
        state.stuckTimer = 0;
      } else if (!moved) {
        state.stuckTimer += dt;
        if (state.stuckTimer > D.stuckLimit) {
          state.wanderGoal = null;
          state.stuckTimer = 0;
        }
      } else {
        state.stuckTimer = 0;
      }
      break;
    }

    case "patrol": {
      const room = roomById(model, state.homeRoom);
      if (!room) break;
      if (!state.patrol) state.patrol = roomCorners(room, radius + 0.4);
      const goal = state.patrol[state.patrolIndex];
      apply(stepVia(ctx, state.position, goal, maxDist, radius));
      if (reached(state.position, goal, D.arrive)) state.patrolIndex = (state.patrolIndex + 1) % state.patrol.length;
      break;
    }

    default:
      break;
  }

  state.animation = animationForMode(state.mode, moved);
  return state;
}
