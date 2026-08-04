// runtime - the shuttle you can ride.
//
// A city big enough to be worth building is too big to cross on foot every time. The level lays a
// line down the middle street with a stop opposite each block; this drives a shuttle along it, waits
// at each stop, and turns round at the end.
//
// Riding is the caller's business: this only says where the shuttle is, whether it is standing at a
// stop, and where a passenger sits. Nothing here touches the player.

import * as THREE from "three";

const SPEED = 11; // metres a second between stops
const WAIT = 3.5; // seconds standing at each one
const BODY = { length: 7.2, width: 2.4, height: 2.5, clear: 0.5 }; // it floats a little off the road
const SEAT = 1.1; // where a passenger's feet are, above the shuttle's floor
const BOARDING = 4; // metres within which you can step on
const COLOURS = { body: 0x27313d, trim: 0x161b22, window: "#bfe4ff", head: "#fff2d0", tail: "#ff6a58" };

const matte = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.4, ...extra });

const burning = (colour, intensity) =>
  new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: new THREE.Color(colour),
    emissiveIntensity: intensity,
    roughness: 0.4,
  });

/**
 * @param {{ id: string, stops: Array<[number,number,number]> }} transit  the level's line
 * @returns {object|null} null when the level has no line
 */
export function createShuttle(transit) {
  const stops = (transit?.stops ?? []).map(([x, y, z]) => new THREE.Vector3(x, y, z));
  if (stops.length < 2) return null;

  const group = new THREE.Group();
  group.name = `shuttle:${transit.id}`;

  const hull = new THREE.Mesh(new THREE.BoxGeometry(BODY.width, BODY.height, BODY.length), matte(COLOURS.body));
  hull.position.y = BODY.height / 2;
  hull.castShadow = true;
  group.add(hull);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(BODY.width + 0.06, BODY.height * 0.36, BODY.length * 0.78),
    burning(COLOURS.window, 1.3)
  );
  glass.position.y = BODY.height * 0.66;
  glass.userData = { kind: "light" };
  group.add(glass);

  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(BODY.width * 1.05, 0.22, BODY.length * 0.94),
    matte(COLOURS.trim, { roughness: 0.8 })
  );
  skirt.position.y = 0.18;
  group.add(skirt);

  for (const [colour, end] of [[COLOURS.head, -1], [COLOURS.tail, 1]]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(BODY.width * 0.66, 0.14, 0.08), burning(colour, 1.6));
    lamp.position.set(0, BODY.height * 0.42, (end * BODY.length) / 2);
    lamp.userData = { kind: "light" };
    group.add(lamp);
  }

  // Where it is on the line: between `from` and `to`, `t` of the way along, or standing (`waiting`).
  let from = 0;
  let to = 1;
  let travelled = 0;
  let waiting = WAIT;
  const at = new THREE.Vector3().copy(stops[0]);

  function place() {
    group.position.set(at.x, stops[0].y + BODY.clear, at.z);
    const heading = stops[to].clone().sub(stops[from]);
    group.rotation.y = Math.atan2(heading.x, heading.z);
  }
  place();

  function update(dt) {
    if (waiting > 0) {
      waiting -= dt;
      return;
    }
    const leg = stops[from].distanceTo(stops[to]);
    travelled += SPEED * dt;
    if (travelled >= leg) {
      // Arrived. Stand for a moment, then take the next leg, turning round at the end of the line.
      at.copy(stops[to]);
      travelled = 0;
      waiting = WAIT;
      const step = to > from ? 1 : -1;
      const next = to + step;
      from = to;
      to = next < 0 || next >= stops.length ? to - step : next;
      place();
      return;
    }
    at.copy(stops[from]).lerp(stops[to], travelled / leg);
    place();
  }

  return {
    group,
    update,
    /** Where a passenger stands: on the shuttle's floor, in the middle of it. */
    seat: () => ({ x: group.position.x, y: group.position.y + SEAT - BODY.clear, z: group.position.z }),
    /** Which way it is pointing, so a rider faces down the line rather than sideways. */
    heading: () => group.rotation.y,
    /** Standing at a stop with its doors open. */
    stopped: () => waiting > 0,
    /** Close enough to step on, and it is standing still. */
    boardable(position) {
      if (waiting <= 0) return false;
      return Math.hypot(position.x - group.position.x, position.z - group.position.z) <= BOARDING;
    },
    /** Where stepping off puts you: beside it, clear of the line. */
    kerbside() {
      const side = new THREE.Vector3(Math.cos(group.rotation.y), 0, -Math.sin(group.rotation.y));
      return {
        x: group.position.x + side.x * (BODY.width / 2 + 1.2),
        y: stops[0].y,
        z: group.position.z + side.z * (BODY.width / 2 + 1.2),
      };
    },
    dispose() {
      group.traverse((node) => {
        node.geometry?.dispose?.();
        node.material?.dispose?.();
      });
    },
  };
}
