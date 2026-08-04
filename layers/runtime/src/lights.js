// runtime - the night rig.
//
// Two things light the scene. The sky, which is one hemisphere light and one low moon, and the city
// itself: a lamp on the pavement, a sign over a door. There can be forty of those in a street and a
// forward renderer will not take forty, so a small pool of real lights follows the player and lands
// on whichever are nearest. The rest are still there to look at: their glow is emissive geometry the
// scene builder draws, which costs nothing.

import * as THREE from "three";

const POOL = 6; // real point lights alive at once
const REACH = 24; // metres a pooled light carries

const LOOK = {
  street_lamp: { colour: 0xffd9a8, intensity: 28, height: 4.6 },
  sign: { colour: 0xffc98a, intensity: 12, height: 3.6 },
  ceiling: { colour: 0xffeed6, intensity: 16, height: 2.7 },
};

const NIGHT = {
  sky: 0x2a3448,
  ground: 0x0e1014,
  ambient: 0.55, // enough to keep an unlit wall from going pure black
  moon: 0.35,
};

const INDOORS = {
  sky: 0xa9b6cc,
  ground: 0x2a2c33,
  ambient: 0.9, // the fill under the room's own ceiling lamps, not the light itself
  moon: 0.25,
};

/**
 * Light one instance.
 *
 * @param {THREE.Scene} scene
 * @param {object} opts
 * @param {Array}  opts.lights  authored light points (persistence room `lights`)
 * @param {boolean} opts.open   outdoors (night) or indoors
 * @param {Function} [opts.tintFor] (light) -> colour override, e.g. a building's own sign colour
 */
export function createLightRig(scene, { lights = [], open = false, tintFor } = {}) {
  const mood = open ? NIGHT : INDOORS;
  const added = [];

  const hemi = new THREE.HemisphereLight(mood.sky, mood.ground, mood.ambient);
  const moon = new THREE.DirectionalLight(0xc8d8ff, mood.moon);
  moon.position.set(-6, 14, -4);
  added.push(hemi, moon);

  // Where each authored light actually burns, and what colour, worked out once.
  const points = lights
    .filter((light) => LOOK[light.kind])
    .map((light) => {
      const look = LOOK[light.kind];
      return {
        id: light.id,
        position: new THREE.Vector3(light.position[0], light.position[1] + look.height, light.position[2]),
        colour: tintFor?.(light) ?? look.colour,
        intensity: look.intensity,
      };
    });

  const pool = [];
  for (let i = 0; i < Math.min(POOL, points.length); i++) {
    const lamp = new THREE.PointLight(0xffffff, 0, REACH, 2);
    lamp.name = `pooled-light:${i}`;
    pool.push(lamp);
    added.push(lamp);
  }
  for (const light of added) scene.add(light);

  const byDistance = [];

  return {
    points,
    /** Hand the pool to the lights nearest the player. Cheap enough to run every frame. */
    update(at) {
      if (pool.length === 0) return;
      byDistance.length = 0;
      for (const point of points) byDistance.push([point.position.distanceToSquared(at), point]);
      byDistance.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < pool.length; i++) {
        const nearest = byDistance[i]?.[1];
        pool[i].intensity = nearest ? nearest.intensity : 0;
        if (nearest) {
          pool[i].position.copy(nearest.position);
          pool[i].color.set(nearest.colour);
        }
      }
    },
    dispose() {
      for (const light of added) {
        scene.remove(light);
        light.dispose?.();
      }
      added.length = 0;
      pool.length = 0;
    },
  };
}
