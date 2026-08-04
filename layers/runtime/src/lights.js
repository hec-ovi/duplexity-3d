// runtime - the night rig.
//
// Two things light the scene. The sky, which is one hemisphere light and one low moon, and the city
// itself: a lamp on the pavement, a sign over a door. There can be forty of those in a street and a
// forward renderer will not take forty, so a small pool of real lights follows the player and lands
// on whichever are nearest. The rest are still there to look at: their glow is emissive geometry the
// scene builder draws, which costs nothing.

import * as THREE from "three";
import { lampHeight } from "./lamps.js";

const POOL = 10; // real point lights alive at once
const CASTERS = 2; // of those, how many throw shadows: the nearest, because they are what you see
const SHADOW_MAP = 512;
const REACH = 24; // metres a pooled light carries
const FADE = 55; // how fast a light comes up or goes out, in intensity per second

const LOOK = {
  street_lamp: { colour: 0xffd9a8, intensity: 28 },
  wall_lamp: { colour: 0xffd9a8, intensity: 14 },
  sign: { colour: 0xffc98a, intensity: 12, height: 3.6 },
  ceiling: { colour: 0xffeed6, intensity: 3.2, height: 2.8 },
};

const NIGHT = {
  sky: 0x2a3448,
  ground: 0x0e1014,
  ambient: 0.8, // enough to keep an unlit wall off pure black, without washing out the night
  moon: 0.35,
};

const INDOORS = {
  sky: 0xa9b6cc,
  ground: 0x2a2c33,
  ambient: 1.25, // most of an interior is flat fill; the lamps only give it shape
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
export function createLightRig(scene, { lights = [], open = false, tintFor, extent } = {}) {
  const mood = open ? NIGHT : INDOORS;
  const added = [];

  const hemi = new THREE.HemisphereLight(mood.sky, mood.ground, mood.ambient);
  const moon = new THREE.DirectionalLight(0xc8d8ff, mood.moon);
  moon.position.set(-40, 90, -30);
  // One shadow across the whole level, from the moon: what makes a building read as a solid thing
  // standing on ground rather than a picture of one.
  if (open) {
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const reach = Math.max(40, (extent ?? 120) * 0.6);
    Object.assign(moon.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 400 });
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.03;
    moon.shadow.camera.updateProjectionMatrix();
  }
  added.push(hemi, moon);

  // Where each authored light actually burns, and what colour, worked out once.
  const points = lights
    .filter((light) => LOOK[light.kind])
    .map((light) => {
      const look = LOOK[light.kind];
      // A lamp burns in its head, and where that is depends on which lamp stands there.
      const height = look.height ?? lampHeight(light);
      return {
        id: light.id,
        position: new THREE.Vector3(light.position[0], light.position[1] + height, light.position[2]),
        colour: tintFor?.(light) ?? look.colour,
        intensity: look.intensity,
      };
    });

  // Each slot holds one real light, the point it is currently standing in for, and how far up it
  // has come. A slot never jumps from one lamp to another: it goes out first, then takes the new
  // one, so walking down a street does not switch lamps on and off in front of you.
  const pool = [];
  for (let i = 0; i < Math.min(POOL, points.length); i++) {
    const lamp = new THREE.PointLight(0xffffff, 0, REACH, 2);
    lamp.name = `pooled-light:${i}`;
    // Only the first few throw shadows: a point light shadow is six renders, and past the nearest
    // couple nobody can tell.
    if (i < CASTERS) {
      lamp.castShadow = true;
      lamp.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
      lamp.shadow.bias = -0.004;
      lamp.shadow.camera.near = 0.4;
    }
    pool.push({ lamp, point: null, level: 0 });
    added.push(lamp);
  }
  for (const light of added) scene.add(light);

  const byDistance = [];

  return {
    points,
    /** Hand the pool to the lights nearest the player, fading each in and out. Runs every frame. */
    update(at, dt = 1 / 60) {
      if (pool.length === 0) return;
      byDistance.length = 0;
      for (const point of points) byDistance.push([point.position.distanceToSquared(at), point]);
      byDistance.sort((a, b) => a[0] - b[0]);
      const wanted = new Set(byDistance.slice(0, pool.length).map(([, point]) => point));

      const held = new Set();
      for (const slot of pool) {
        if (slot.point && !wanted.has(slot.point)) slot.point = null; // it is no longer near: go out
        if (slot.point) held.add(slot.point);
      }
      for (const slot of pool) {
        // A dark slot is free to take on whichever nearby light nothing else is standing in for.
        if (!slot.point && slot.level <= 0.05) {
          const taking = byDistance.slice(0, pool.length).find(([, point]) => !held.has(point));
          if (taking) {
            slot.point = taking[1];
            held.add(slot.point);
            slot.lamp.position.copy(slot.point.position);
            slot.lamp.color.set(slot.point.colour);
          }
        }
        const target = slot.point ? slot.point.intensity : 0;
        const step = FADE * dt;
        slot.level = target > slot.level
          ? Math.min(target, slot.level + step)
          : Math.max(target, slot.level - step);
        slot.lamp.intensity = slot.level;
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
