import type { Mat3, Vec3 } from './math';
import { clamp, cross, dot3, mat3Vec, norm3, normalize3 } from './math';
import type { Wrench } from './mixer';

const G = 9.81;

/** Cascaded PID gains (docs/07 §2). Attitude gains are in angular-acceleration
 *  units (rad/s² per rad) and get scaled by the airframe inertia estimate, so
 *  defaults transfer between airframes. */
export interface FlightGains {
  posP: number;
  posD: number;
  posIz: number;
  attP: number;
  attD: number;
  yawP: number;
  yawD: number;
  maxTiltDeg: number;
}

export const DEFAULT_GAINS: FlightGains = {
  posP: 6,
  posD: 4.5,
  posIz: 1.2,
  attP: 180,
  attD: 25,
  yawP: 40,
  yawD: 10,
  maxTiltDeg: 35,
};

export interface DroneState {
  pos: Vec3; // world
  vel: Vec3; // world
  R: Mat3; // body → world
  omega: Vec3; // body rates p, q, r
}

export interface Setpoint {
  pos: Vec3;
  vel: Vec3;
  acc: Vec3; // feedforward (docs/05)
  yaw: number;
}

export interface AirframeParams {
  mass: number; // kg
  inertia: Vec3; // diag(Ixx, Iyy, Izz) estimate, kg·m²
}

/** Mutable controller state (altitude integrator). */
export interface CascadeMemory {
  integZ: number;
}

export function createCascadeMemory(): CascadeMemory {
  return { integZ: 0 };
}

/**
 * One tick of the cascaded position → attitude → torque controller.
 *
 * Outer loop: world-frame position PID → commanded acceleration.
 * Middle: differential-flatness construction (docs/05 §2) turns commanded
 *   acceleration + yaw into collective thrust and a desired attitude R_des.
 * Inner loop: geometric attitude PD on the rotation-matrix error, with body
 *   rates as damping.
 */
export function cascadeStep(
  state: DroneState,
  sp: Setpoint,
  gains: FlightGains,
  airframe: AirframeParams,
  mem: CascadeMemory,
  dt: number
): Wrench {
  // --- Outer loop: position PID → desired acceleration (world frame) ---
  const ep: Vec3 = [sp.pos[0] - state.pos[0], sp.pos[1] - state.pos[1], sp.pos[2] - state.pos[2]];
  const ev: Vec3 = [sp.vel[0] - state.vel[0], sp.vel[1] - state.vel[1], sp.vel[2] - state.vel[2]];

  mem.integZ = clamp(mem.integZ + ep[2] * dt, -2, 2);

  const aDes: Vec3 = [
    gains.posP * ep[0] + gains.posD * ev[0] + sp.acc[0],
    gains.posP * ep[1] + gains.posD * ev[1] + sp.acc[1],
    gains.posP * ep[2] + gains.posD * ev[2] + sp.acc[2] + gains.posIz * mem.integZ,
  ];

  // Tilt limit: lateral acceleration is produced by tilting, so cap it.
  const maxLat = G * Math.tan((gains.maxTiltDeg * Math.PI) / 180);
  const lat = Math.hypot(aDes[0], aDes[1]);
  if (lat > maxLat) {
    aDes[0] *= maxLat / lat;
    aDes[1] *= maxLat / lat;
  }
  aDes[2] = clamp(aDes[2], -0.8 * G, 2 * G);

  // --- Middle: acceleration + yaw → thrust and desired attitude (docs/05) ---
  const t: Vec3 = [aDes[0], aDes[1], aDes[2] + G];
  if (t[2] < 0.05 * G) t[2] = 0.05 * G; // keep the thrust vector pointing up

  const b3 = mat3Vec(state.R, [0, 0, 1]); // current body z in world
  const thrust = Math.max(0, airframe.mass * dot3(t, b3));

  const b3d = normalize3(t);
  const xc: Vec3 = [Math.cos(sp.yaw), Math.sin(sp.yaw), 0];
  let b2d = cross(b3d, xc);
  if (norm3(b2d) < 1e-6) b2d = [0, 1, 0]; // heading parallel to thrust — degenerate
  b2d = normalize3(b2d);
  const b1d = cross(b2d, b3d);
  // Column-major stacking of [b1d b2d b3d] into a row-major body→world matrix.
  const Rd: Mat3 = [
    b1d[0], b2d[0], b3d[0],
    b1d[1], b2d[1], b3d[1],
    b1d[2], b2d[2], b3d[2],
  ];

  // --- Inner loop: geometric attitude PD (docs/07 §2) ---
  // e_R = ½ (R_desᵀ R − Rᵀ R_des)ᵛ. With A = R_desᵀ R this is the vee map of
  // A − Aᵀ: e_R = ½ [A₂₁−A₁₂, A₀₂−A₂₀, A₁₀−A₀₁].
  const R = state.R;
  const a = (row: number, col: number) =>
    Rd[row] * R[col] + Rd[row + 3] * R[col + 3] + Rd[row + 6] * R[col + 6]; // (R_desᵀR)[row][col]
  const eR: Vec3 = [
    0.5 * (a(2, 1) - a(1, 2)),
    0.5 * (a(0, 2) - a(2, 0)),
    0.5 * (a(1, 0) - a(0, 1)),
  ];

  const [p, q, r] = state.omega;
  const [ixx, iyy, izz] = airframe.inertia;
  const tau: [number, number, number] = [
    ixx * (-gains.attP * eR[0] - gains.attD * p),
    iyy * (-gains.attP * eR[1] - gains.attD * q),
    izz * (-gains.yawP * eR[2] - gains.yawD * r),
  ];

  return { thrust, tau };
}
