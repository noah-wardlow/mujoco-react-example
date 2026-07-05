/** Small vector/matrix helpers for the flight stack. Rotation matrices are
 *  row-major, length-9 arrays mapping body → world (columns = body axes). */

export type Vec3 = [number, number, number];
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

export function norm3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalize3(v: Vec3): Vec3 {
  const n = norm3(v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** MuJoCo quaternion (w, x, y, z) → body-to-world rotation matrix. */
export function quatToMat3(w: number, x: number, y: number, z: number): Mat3 {
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  return [
    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),
    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),
    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy),
  ];
}

/** Z-Y-X Tait–Bryan (yaw ψ → pitch θ → roll φ) → body-to-world matrix. */
export function eulerToMat3(roll: number, pitch: number, yaw: number): Mat3 {
  const cf = Math.cos(roll), sf = Math.sin(roll);
  const ct = Math.cos(pitch), st = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return [
    cy * ct, cy * st * sf - sy * cf, cy * st * cf + sy * sf,
    sy * ct, sy * st * sf + cy * cf, sy * st * cf - cy * sf,
    -st, ct * sf, ct * cf,
  ];
}

/** Extract Z-Y-X Euler angles [roll, pitch, yaw] from a body-to-world matrix. */
export function mat3ToEuler(R: Mat3): Vec3 {
  const pitch = Math.asin(clamp(-R[6], -1, 1));
  const roll = Math.atan2(R[7], R[8]);
  const yaw = Math.atan2(R[3], R[0]);
  return [roll, pitch, yaw];
}

export function mat3Vec(R: Mat3, v: Vec3): Vec3 {
  return [
    R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
    R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
    R[6] * v[0] + R[7] * v[1] + R[8] * v[2],
  ];
}

/** Rᵀ v (world → body for a body-to-world R). */
export function mat3TVec(R: Mat3, v: Vec3): Vec3 {
  return [
    R[0] * v[0] + R[3] * v[1] + R[6] * v[2],
    R[1] * v[0] + R[4] * v[1] + R[7] * v[2],
    R[2] * v[0] + R[5] * v[1] + R[8] * v[2],
  ];
}

/** Invert a 4×4 matrix (Gauss-Jordan with partial pivoting). Throws if singular. */
export function invert4(A: number[][]): number[][] {
  const n = 4;
  const M = A.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) {
      throw new Error('mixer allocation matrix is singular');
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const d = M[col][col];
    for (let j = 0; j < 2 * n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row.slice(n));
}

/** Standard normal via Box–Muller (for simulated sensor noise). */
export function randn(): number {
  const u = Math.max(Math.random(), 1e-12);
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
