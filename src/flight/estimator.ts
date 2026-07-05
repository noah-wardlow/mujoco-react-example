import type { Mat3, Vec3 } from './math';
import { clamp, eulerToMat3, mat3TVec, mat3ToEuler, randn, wrapAngle } from './math';

const G = 9.81;

/**
 * Complementary-filter attitude estimator (docs/04 §2).
 *
 * The filter itself is the real algorithm; its inputs are a *simulated IMU*
 * synthesized from ground truth each step:
 *   gyro  = true body rates + white noise + a slowly walking bias
 *   accel = specific force Rᵀ(a + g·ẑ) + white noise
 * Roll/pitch blend the integrated gyro with the accelerometer gravity
 * direction; yaw integrates the gyro with a weak "magnetometer" pull toward
 * the true heading, so its drift stays bounded.
 */
export interface ImuNoise {
  gyroStd: number; // rad/s
  gyroBiasWalk: number; // rad/s per √s
  accelStd: number; // m/s²
  alpha: number; // accel blend weight per update (≈0.02)
  magAlpha: number; // yaw blend weight per update
}

export const DEFAULT_IMU_NOISE: ImuNoise = {
  gyroStd: 0.02,
  gyroBiasWalk: 0.002,
  accelStd: 0.4,
  alpha: 0.02,
  magAlpha: 0.005,
};

export class ComplementaryFilter {
  private roll = 0;
  private pitch = 0;
  private yaw = 0;
  private bias: Vec3 = [0, 0, 0];
  private prevVel: Vec3 | null = null;
  private initialized = false;

  reset(): void {
    this.roll = this.pitch = this.yaw = 0;
    this.bias = [0, 0, 0];
    this.prevVel = null;
    this.initialized = false;
  }

  /** Feed one step of ground truth; returns the estimated attitude and the
   *  (noisy) gyro rates the controller should use for damping. */
  update(
    trueR: Mat3,
    trueOmega: Vec3,
    trueVel: Vec3,
    dt: number,
    noise: ImuNoise
  ): { R: Mat3; omega: Vec3 } {
    const [trueRoll, truePitch, trueYaw] = mat3ToEuler(trueR);
    if (!this.initialized || dt <= 0) {
      this.roll = trueRoll;
      this.pitch = truePitch;
      this.yaw = trueYaw;
      this.prevVel = [...trueVel] as Vec3;
      this.initialized = true;
      return { R: trueR, omega: trueOmega };
    }

    // --- Synthesize IMU measurements from ground truth ---
    const sq = Math.sqrt(dt);
    this.bias = [
      this.bias[0] + noise.gyroBiasWalk * sq * randn(),
      this.bias[1] + noise.gyroBiasWalk * sq * randn(),
      this.bias[2] + noise.gyroBiasWalk * sq * randn(),
    ];
    const gyro: Vec3 = [
      trueOmega[0] + this.bias[0] + noise.gyroStd * randn(),
      trueOmega[1] + this.bias[1] + noise.gyroStd * randn(),
      trueOmega[2] + this.bias[2] + noise.gyroStd * randn(),
    ];

    const aWorld: Vec3 = this.prevVel
      ? [
          (trueVel[0] - this.prevVel[0]) / dt,
          (trueVel[1] - this.prevVel[1]) / dt,
          (trueVel[2] - this.prevVel[2]) / dt,
        ]
      : [0, 0, 0];
    this.prevVel = [...trueVel] as Vec3;
    const f = mat3TVec(trueR, [aWorld[0], aWorld[1], aWorld[2] + G]); // specific force, body frame
    const accel: Vec3 = [
      f[0] + noise.accelStd * randn(),
      f[1] + noise.accelStd * randn(),
      f[2] + noise.accelStd * randn(),
    ];

    // --- Gyro path: body rates → Euler rates → integrate (docs/01 §2) ---
    const sf = Math.sin(this.roll), cf = Math.cos(this.roll);
    const ct = Math.cos(this.pitch), tt = Math.tan(this.pitch);
    const [p, q, r] = gyro;
    const rollDot = p + sf * tt * q + cf * tt * r;
    const pitchDot = cf * q - sf * r;
    const yawDot = ct !== 0 ? (sf / ct) * q + (cf / ct) * r : 0;

    const rollGyro = this.roll + rollDot * dt;
    const pitchGyro = this.pitch + pitchDot * dt;
    const yawGyro = this.yaw + yawDot * dt;

    // --- Accelerometer path: gravity direction → absolute roll/pitch ---
    const rollAcc = Math.atan2(accel[1], accel[2]);
    const pitchAcc = Math.atan2(-accel[0], Math.hypot(accel[1], accel[2]));

    // --- Blend ---
    const a = noise.alpha;
    this.roll = (1 - a) * rollGyro + a * rollAcc;
    this.pitch = clamp((1 - a) * pitchGyro + a * pitchAcc, -1.4, 1.4);
    this.yaw = wrapAngle(yawGyro + noise.magAlpha * wrapAngle(trueYaw - yawGyro));

    return { R: eulerToMat3(this.roll, this.pitch, this.yaw), omega: gyro };
  }

  /** Estimation error vs truth, for telemetry. */
  errorDeg(trueR: Mat3): number {
    const [tr, tp, ty] = mat3ToEuler(trueR);
    const e = Math.hypot(
      wrapAngle(this.roll - tr),
      wrapAngle(this.pitch - tp),
      wrapAngle(this.yaw - ty)
    );
    return (e * 180) / Math.PI;
  }
}
