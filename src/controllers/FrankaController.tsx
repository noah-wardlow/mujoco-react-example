import { RobotActuators, useKeyboardTeleop } from 'mujoco-react';

/** Franka gripper toggle — V key opens/closes the gripper. */
export function FrankaController() {
  useKeyboardTeleop({
    bindings: {
      v: { actuator: RobotActuators.franka.gripper, toggle: [0, 255] },
    },
  });
  return null;
}
