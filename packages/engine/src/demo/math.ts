/** The little vector and rotation maths the demonstrations need (D5, #78): no 3D library in the engine. */

export type Vec3 = [number, number, number];
/** A rotation as a unit quaternion: x, y, z, w. */
export type Quat = [number, number, number, number];

export const IDENTITY: Quat = [0, 0, 0, 1];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const mid = (a: Vec3, b: Vec3): Vec3 => lerp(a, b, 0.5);

/** `a` then-inside `b`: the rotation that applies `b` first, then `a`. */
export function qmul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** `v` turned by `q`. */
export function qrot(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

const RAD = Math.PI / 180;
const axis = (i: 0 | 1 | 2, degrees: number): Quat => {
  const h = (degrees * RAD) / 2;
  const q: Quat = [0, 0, 0, Math.cos(h)];
  q[i] = Math.sin(h);
  return q;
};

/** Right-handed turns in degrees about x, y and z, applied twist (y) first, then z, then x. */
export function qEuler(x: number, y: number, z: number): Quat {
  return qmul(axis(0, x), qmul(axis(2, z), axis(1, y)));
}

/** Part of the way from `a` to `b`, the short way round. */
export function slerp(a: Quat, b: Quat, k: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = dot < 0 ? -1 : 1;
  dot *= s;
  let wa: number, wb: number;
  if (dot > 0.9995) {
    wa = 1 - k;
    wb = k;
  } else {
    const th = Math.acos(dot), sin = Math.sin(th);
    wa = Math.sin((1 - k) * th) / sin;
    wb = Math.sin(k * th) / sin;
  }
  const q: Quat = [wa * a[0] + wb * s * b[0], wa * a[1] + wb * s * b[1], wa * a[2] + wb * s * b[2], wa * a[3] + wb * s * b[3]];
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Slow out, slow in. */
export const ease = (k: number) => k * k * (3 - 2 * k);
