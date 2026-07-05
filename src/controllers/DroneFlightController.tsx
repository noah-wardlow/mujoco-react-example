import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { ModelActuators, controlGroup, useBeforePhysicsStep, useControlGroup } from 'mujoco-react';
import type { FlightParams } from '../configs';
import type { FlightGains, Setpoint } from '../flight/cascade';
import { cascadeStep, createCascadeMemory } from '../flight/cascade';
import { ComplementaryFilter } from '../flight/estimator';
import type { ImuNoise } from '../flight/estimator';
import type { Mat3, Vec3 } from '../flight/math';
import { mat3ToEuler, quatToMat3 } from '../flight/math';
import { buildMixer } from '../flight/mixer';
import type { FlightMode, TrajectoryOptions } from '../flight/trajectories';
import { getSetpoint } from '../flight/trajectories';

export type EstimatorSource = 'ground truth' | 'simulated IMU';

export interface Telemetry {
  pos: Vec3;
  speed: number;
  tiltDeg: number;
  yawDeg: number;
  motors: [number, number, number, number]; // normalized 0..1
  estErrDeg: number | null;
}

/**
 * Cascaded PID flight controller (docs/07 §2) running in the physics loop.
 *
 * Every control tick (once per render frame; the same ctrl is zero-order-held
 * across the physics substeps, docs/03 §1):
 *   state → [estimator] → trajectory setpoint → position PID →
 *   acceleration→attitude (docs/05) → attitude PD → mixer (docs/02) → ctrl.
 *
 * Reads the freejoint state directly: qpos[0..6] = world position + wxyz
 * quaternion, qvel[0..2] = world linear velocity, qvel[3..5] = body rates
 * (MuJoCo expresses freejoint angular velocity in the body frame).
 */
export function DroneFlightController({
  flight,
  mode,
  trajectory,
  gains,
  estimator,
  imuNoise,
  targetRef,
  telemetryRef,
}: {
  flight: FlightParams;
  mode: FlightMode;
  trajectory: TrajectoryOptions;
  gains: FlightGains;
  estimator: EstimatorSource;
  imuNoise: ImuNoise;
  targetRef: RefObject<Setpoint | null>;
  telemetryRef: RefObject<Telemetry | null>;
}) {
  const mix = useMemo(
    () => buildMixer(flight.motors, flight.kYaw),
    [flight.motors, flight.kYaw]
  );

  // Typed named controls — same actuator order as `flight.motors` (FL, FR, BR, BL).
  const thrustControls = useControlGroup(
    controlGroup([
      ModelActuators.quadrotor.thrust1,
      ModelActuators.quadrotor.thrust2,
      ModelActuators.quadrotor.thrust3,
      ModelActuators.quadrotor.thrust4,
    ])
  );

  const massRef = useRef<number | null>(null);
  const memRef = useRef(createCascadeMemory());
  const filterRef = useRef(new ComplementaryFilter());
  const lastTimeRef = useRef(0);
  const modeRef = useRef<{ mode: FlightMode; start: number }>({ mode, start: 0 });

  useBeforePhysicsStep(({ model, data }) => {
    // Reset detection (api.reset() rewinds data.time).
    if (data.time < lastTimeRef.current) {
      memRef.current = createCascadeMemory();
      filterRef.current.reset();
      modeRef.current = { mode, start: data.time };
      massRef.current = null;
    }
    const dt = Math.max(0, data.time - lastTimeRef.current);
    lastTimeRef.current = data.time;

    if (massRef.current === null) {
      let m = 0;
      for (let i = 1; i < model.nbody; i++) m += model.body_mass[i];
      massRef.current = m;
    }

    // Restart the trajectory clock when the mode changes.
    if (modeRef.current.mode !== mode) {
      modeRef.current = { mode, start: data.time };
      memRef.current.integZ = 0;
    }

    // --- Read the freejoint state ---
    const pos: Vec3 = [data.qpos[0], data.qpos[1], data.qpos[2]];
    const R = quatToMat3(data.qpos[3], data.qpos[4], data.qpos[5], data.qpos[6]);
    const vel: Vec3 = [data.qvel[0], data.qvel[1], data.qvel[2]];
    const omega: Vec3 = [data.qvel[3], data.qvel[4], data.qvel[5]];

    // --- Estimator (docs/04): ground truth, or complementary filter on a
    //     simulated noisy IMU. Position/velocity stay ground truth ("mocap").
    let ctrlR: Mat3 = R;
    let ctrlOmega: Vec3 = omega;
    let estErrDeg: number | null = null;
    if (estimator === 'simulated IMU') {
      const est = filterRef.current.update(R, omega, vel, dt, imuNoise);
      ctrlR = est.R;
      ctrlOmega = est.omega;
      estErrDeg = filterRef.current.errorDeg(R);
    } else {
      filterRef.current.reset();
    }

    // --- Reference → cascade → mixer → ctrl ---
    const t = data.time - modeRef.current.start;
    const sp = getSetpoint(mode, t, trajectory);
    const wrench = cascadeStep(
      { pos, vel, R: ctrlR, omega: ctrlOmega },
      sp,
      gains,
      { mass: massRef.current, inertia: flight.inertia },
      memRef.current,
      dt
    );
    const f = mix(wrench, flight.maxThrust);
    thrustControls.write(f, { force: true });

    // --- Publish for the target marker + telemetry HUD ---
    targetRef.current = sp;
    const [, , yaw] = mat3ToEuler(R);
    telemetryRef.current = {
      pos,
      speed: Math.hypot(vel[0], vel[1], vel[2]),
      tiltDeg: (Math.acos(Math.min(1, Math.max(-1, R[8]))) * 180) / Math.PI,
      yawDeg: (yaw * 180) / Math.PI,
      motors: [
        f[0] / flight.maxThrust,
        f[1] / flight.maxThrust,
        f[2] / flight.maxThrust,
        f[3] / flight.maxThrust,
      ],
      estErrDeg,
    };
  });

  return null;
}
