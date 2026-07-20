// runtime - controls (pure, no three.js).
//
// Maps a movement-input snapshot plus the camera yaw into a world-space XZ delta. At yaw 0 the
// camera looks down -Z (three.js default forward), so "forward" is -Z and "right" is +X; the
// vectors rotate with yaw. Diagonal input is normalized so strafing is not faster than walking.

/**
 * @param {{forward?:boolean,back?:boolean,left?:boolean,right?:boolean}} input
 * @param {number} yaw   camera yaw in radians about Y
 * @param {number} speed metres per second
 * @param {number} dt    seconds since last step
 * @returns {{x:number,z:number}} world-space delta to add to the player position
 */
export function movementVector(input, yaw, speed, dt) {
  const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (f === 0 && s === 0) return { x: 0, z: 0 };

  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  let x = -sin * f + cos * s;
  let z = -cos * f - sin * s;

  const len = Math.hypot(x, z);
  if (len > 0) {
    x /= len;
    z /= len;
  }
  const dist = speed * dt;
  return { x: x * dist, z: z * dist };
}
