import { useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import { useControls } from 'leva';
import type { FlightParams } from '../configs';
import { DEFAULT_GAINS } from '../flight/cascade';
import type { Setpoint } from '../flight/cascade';
import { DEFAULT_IMU_NOISE } from '../flight/estimator';
import type { FlightMode, TrajectoryOptions } from '../flight/trajectories';
import { FLIGHT_MODES } from '../flight/trajectories';
import { DroneFlightController } from './DroneFlightController';
import type { Telemetry } from './DroneFlightController';
import { TargetMarker } from '../TargetMarker';

/**
 * Quadrotor flight stack: cascaded PID controller (src/flight/) plus the
 * draggable target ring. Drag the blue ring to move the flight target; in
 * circle/figure-8/waypoint modes it moves the pattern center.
 */
export function QuadrotorController({
  flight,
  targetRef,
  telemetryRef,
}: {
  flight: FlightParams;
  targetRef: RefObject<Setpoint | null>;
  telemetryRef: RefObject<Telemetry | null>;
}) {
  const [ctl, setCtl] = useControls('Flight', () => ({
    mode: {
      value: 'hover' as FlightMode,
      options: [...FLIGHT_MODES],
    },
    x: { value: 0, min: -3, max: 3, step: 0.1 },
    y: { value: 0, min: -3, max: 3, step: 0.1 },
    altitude: { value: 1.0, min: 0.2, max: 3, step: 0.1 },
    yaw: { value: 0, min: -180, max: 180, step: 5, label: 'yaw (deg)' },
    radius: { value: 1.2, min: 0.4, max: 2.5, step: 0.1 },
    period: { value: 8, min: 3, max: 30, step: 0.5, label: 'period (s)' },
    yawFollowsPath: { value: false, label: 'yaw follows path' },
  }));

  const handleDragTarget = useCallback(
    (x: number, y: number) => {
      setCtl({
        x: Math.max(-3, Math.min(3, x)),
        y: Math.max(-3, Math.min(3, y)),
      });
    },
    [setCtl]
  );

  const trajectory: TrajectoryOptions = useMemo(
    () => ({
      hover: [ctl.x, ctl.y, ctl.altitude],
      yawDeg: ctl.yaw,
      radius: ctl.radius,
      period: ctl.period,
      yawFollowsPath: ctl.yawFollowsPath,
    }),
    [ctl.x, ctl.y, ctl.altitude, ctl.yaw, ctl.radius, ctl.period, ctl.yawFollowsPath]
  );

  return (
    <>
      <DroneFlightController
        flight={flight}
        mode={ctl.mode}
        trajectory={trajectory}
        gains={DEFAULT_GAINS}
        estimator="ground truth"
        imuNoise={DEFAULT_IMU_NOISE}
        targetRef={targetRef}
        telemetryRef={telemetryRef}
      />
      <TargetMarker targetRef={targetRef} onDragTarget={handleDragTarget} />
    </>
  );
}
