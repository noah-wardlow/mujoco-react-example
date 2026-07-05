import { clamp, invert4 } from './math';

/** One motor of the allocation problem, in the body frame (x forward, y left).
 *  `yawSign` is the sign of the reaction torque the motor applies to the
 *  airframe about +z per newton of thrust (must match the MJCF gear term). */
export interface MotorSpec {
  x: number;
  y: number;
  yawSign: 1 | -1;
}

export interface Wrench {
  thrust: number; // total collective thrust, N (body +z)
  tau: [number, number, number]; // roll/pitch/yaw torques, N·m (body frame)
}

/**
 * Control allocation for an arbitrary 4-motor layout (docs/02 §4-5).
 *
 * Forward map, per motor i with thrust fᵢ:
 *   T   = Σ fᵢ
 *   τx  = Σ  yᵢ fᵢ          (thrust × lateral arm ⇒ roll)
 *   τy  = Σ −xᵢ fᵢ          (thrust × longitudinal arm ⇒ pitch)
 *   τz  = Σ  sᵢ k fᵢ        (prop reaction torque ⇒ yaw, k = k_d/k_T)
 *
 * The mixer inverts this once, then maps wrenches to motor thrusts. When the
 * solution leaves [0, fMax], the collective is shifted before clamping so
 * attitude torques are preserved at the expense of altitude (docs/02 §4).
 */
export function buildMixer(motors: readonly MotorSpec[], kYaw: number) {
  if (motors.length !== 4) throw new Error('buildMixer expects exactly 4 motors');
  const A = [
    motors.map(() => 1),
    motors.map((m) => m.y),
    motors.map((m) => -m.x),
    motors.map((m) => m.yawSign * kYaw),
  ];
  const Ainv = invert4(A);

  return function mix(w: Wrench, fMax: number): [number, number, number, number] {
    const d = [w.thrust, w.tau[0], w.tau[1], w.tau[2]];
    const f = Ainv.map((row) => row[0] * d[0] + row[1] * d[1] + row[2] * d[2] + row[3] * d[3]);

    const lo = Math.min(...f);
    const hi = Math.max(...f);
    let shift = 0;
    if (lo < 0) shift = -lo;
    else if (hi > fMax) shift = fMax - hi;

    return [
      clamp(f[0] + shift, 0, fMax),
      clamp(f[1] + shift, 0, fMax),
      clamp(f[2] + shift, 0, fMax),
      clamp(f[3] + shift, 0, fMax),
    ];
  };
}
