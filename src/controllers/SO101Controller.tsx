import { useArmController } from './useArmController';
import type { ArmControllerConfig } from './useArmController';
import { ModelActuators } from 'mujoco-react';
import type { IkContextValue } from 'mujoco-react';

const config: ArmControllerConfig = {
  arms: [{
    actuators: [
      ModelActuators.so101.shoulder_pan,
      ModelActuators.so101.shoulder_lift,
      ModelActuators.so101.elbow_flex,
      ModelActuators.so101.wrist_flex,
      ModelActuators.so101.wrist_roll,
      ModelActuators.so101.gripper,
    ],
    keys: ['KeyD', 'KeyA', 'KeyW', 'KeyS', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyZ', 'KeyC', 'KeyV'],
    initialJoints: [0, -1.5707963268, 1.5707963268, 0.659999464, 0, -0.17453],
    gripperClosed: -0.17453,
  }],
};

export function SO101Controller({ ik }: { ik?: IkContextValue | null }) {
  useArmController(config, ik);
  return null;
}
