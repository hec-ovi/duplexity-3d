// runtime - navigation (pure, no three.js, no WASM).
//
// A portal-graph waypoint router: rooms are nodes, portals are edges, and a path from A to B is the
// straight run to each doorway centre in turn and finally to the goal point. It solves the one thing
// a naive "steer straight at the target" cannot: routing an NPC through a doorway into the next room
// instead of pinning it against the dividing wall. It is deterministic and needs no navmesh, so the
// NPC sim stays fully node-testable.
//
// The recast-navigation-js navmesh (04-TECH-STACK.md) is a later browser drop-in behind this exact
// `findPath(from, to) -> waypoints[]` seam: the sim only ever asks nav for the next points to walk.

import { roomAt } from "./scene-model.js";

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

// The room containing (x,z), or the nearest room by distance to its footprint when the point sits in
// a doorway or just outside (so a mover standing in an opening still routes sensibly).
function resolveRoom(model, x, z) {
  const inside = roomAt(model, x, z);
  if (inside) return inside;
  let best = null;
  let bestD = Infinity;
  for (const r of model.rooms) {
    const cx = Math.max(r.min.x, Math.min(x, r.max.x));
    const cz = Math.max(r.min.z, Math.min(z, r.max.z));
    const d = dist2(x, z, cx, cz);
    if (d < bestD) {
      bestD = d;
      best = r.id;
    }
  }
  return best;
}

// Adjacency: roomId -> [{ room, portal }]. A portal connects both ways.
function buildGraph(model) {
  const g = new Map();
  for (const r of model.rooms) g.set(r.id, []);
  for (const p of model.portals ?? []) {
    if (g.has(p.roomA)) g.get(p.roomA).push({ room: p.roomB, portal: p });
    if (g.has(p.roomB)) g.get(p.roomB).push({ room: p.roomA, portal: p });
  }
  return g;
}

// BFS the room graph; returns the ordered portals to cross from startRoom to goalRoom (empty array
// when they are the same room, null when unreachable).
function portalRoute(graph, startRoom, goalRoom) {
  if (startRoom === goalRoom) return [];
  const prev = new Map([[startRoom, null]]);
  const queue = [startRoom];
  while (queue.length) {
    const cur = queue.shift();
    for (const edge of graph.get(cur) ?? []) {
      if (prev.has(edge.room)) continue;
      prev.set(edge.room, { room: cur, portal: edge.portal });
      if (edge.room === goalRoom) {
        const portals = [];
        let node = edge.room;
        while (prev.get(node)) {
          portals.unshift(prev.get(node).portal);
          node = prev.get(node).room;
        }
        return portals;
      }
      queue.push(edge.room);
    }
  }
  return null;
}

/**
 * Build a portal-graph navigator for one scene model.
 * @param {object} model result of buildSceneModel() (needs rooms + portals)
 */
export function createPortalNav(model) {
  const graph = buildGraph(model);
  return {
    // Waypoints {x,z} from `from` to `to`, routing through the centre of each doorway on the way.
    // [to] alone when both points share a room; a direct [to] fallback when the rooms are not
    // connected (a best-effort attempt beats a frozen NPC).
    findPath(from, to) {
      const startRoom = resolveRoom(model, from.x, from.z);
      const goalRoom = resolveRoom(model, to.x, to.z);
      const route = portalRoute(graph, startRoom, goalRoom);
      const waypoints = [];
      if (route) {
        for (const p of route) waypoints.push({ x: p.center.x, z: p.center.z });
      }
      waypoints.push({ x: to.x, z: to.z });
      return waypoints;
    },
    roomAt: (x, z) => roomAt(model, x, z),
  };
}
