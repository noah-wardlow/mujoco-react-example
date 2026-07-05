import type { Setpoint } from './cascade';

/** Reference generators (docs/06). The periodic modes are analytic flat
 *  outputs (docs/05): position and its derivatives are known in closed form,
 *  so velocity/acceleration feedforward comes for free. */
export const FLIGHT_MODES = ['hover', 'circle', 'figure8', 'waypoints'] as const;
export type FlightMode = (typeof FLIGHT_MODES)[number];

export interface TrajectoryOptions {
  /** Hover target (also the center/altitude reference for periodic modes). */
  hover: [number, number, number];
  yawDeg: number;
  radius: number;
  /** Seconds per lap (periodic modes) or per full waypoint cycle. */
  period: number;
  /** Point the nose along the direction of travel. */
  yawFollowsPath: boolean;
}

const WAYPOINT_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

export function getSetpoint(mode: FlightMode, t: number, opts: TrajectoryOptions): Setpoint {
  const yawFixed = (opts.yawDeg * Math.PI) / 180;
  const [cx, cy, alt] = opts.hover;

  switch (mode) {
    case 'hover':
      return { pos: [cx, cy, alt], vel: [0, 0, 0], acc: [0, 0, 0], yaw: yawFixed };

    case 'circle': {
      const w = (2 * Math.PI) / opts.period;
      const r = opts.radius;
      const a = w * t;
      const pos: Setpoint['pos'] = [cx + r * Math.cos(a), cy + r * Math.sin(a), alt];
      const vel: Setpoint['vel'] = [-r * w * Math.sin(a), r * w * Math.cos(a), 0];
      const acc: Setpoint['acc'] = [-r * w * w * Math.cos(a), -r * w * w * Math.sin(a), 0];
      const yaw = opts.yawFollowsPath ? Math.atan2(vel[1], vel[0]) : yawFixed;
      return { pos, vel, acc, yaw };
    }

    case 'figure8': {
      // Lemniscate: x = r sin(wt), y = (r/2) sin(2wt)
      const w = (2 * Math.PI) / opts.period;
      const r = opts.radius;
      const a = w * t;
      const pos: Setpoint['pos'] = [cx + r * Math.sin(a), cy + (r / 2) * Math.sin(2 * a), alt];
      const vel: Setpoint['vel'] = [r * w * Math.cos(a), r * w * Math.cos(2 * a), 0];
      const acc: Setpoint['acc'] = [
        -r * w * w * Math.sin(a),
        -2 * r * w * w * Math.sin(2 * a),
        0,
      ];
      const yaw = opts.yawFollowsPath ? Math.atan2(vel[1], vel[0]) : yawFixed;
      return { pos, vel, acc, yaw };
    }

    case 'waypoints': {
      // Step targets at square corners — deliberately the naive scheme from
      // docs/06 §1 (discontinuous velocity; watch the overshoot at corners).
      const seg = opts.period / WAYPOINT_CORNERS.length;
      const i = Math.floor(t / seg) % WAYPOINT_CORNERS.length;
      const [wx, wy] = WAYPOINT_CORNERS[i];
      const pos: Setpoint['pos'] = [cx + wx * opts.radius, cy + wy * opts.radius, alt];
      let yaw = yawFixed;
      if (opts.yawFollowsPath) {
        const [nx, ny] = WAYPOINT_CORNERS[(i + 1) % WAYPOINT_CORNERS.length];
        yaw = Math.atan2(ny - wy, nx - wx);
      }
      return { pos, vel: [0, 0, 0], acc: [0, 0, 0], yaw };
    }
  }
}
