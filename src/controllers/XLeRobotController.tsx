import { useArmController } from './useArmController';
import type { ArmControllerConfig } from './useArmController';
import { ModelActuators } from 'mujoco-react';
import type { IkContextValue } from 'mujoco-react';
import { XLEROBOT_HOME_JOINTS } from '../configs';

const config: ArmControllerConfig = {
  base: {
    actuators: [ModelActuators.xlerobot.forward, ModelActuators.xlerobot.turn],
    keys: ['KeyW', 'KeyS', 'KeyA', 'KeyD'],
    speed: 1,
  },
  arms: [
    {
      actuators: [
        ModelActuators.xlerobot.Rotation_L,
        ModelActuators.xlerobot.Pitch_L,
        ModelActuators.xlerobot.Elbow_L,
        ModelActuators.xlerobot.Wrist_Pitch_L,
        ModelActuators.xlerobot.Wrist_Roll_L,
        ModelActuators.xlerobot.Jaw_L,
      ],
      keys: ['Digit7', 'KeyY', 'Digit9', 'KeyI', 'Digit8', 'KeyU', 'Digit0', 'KeyO', 'Minus', 'KeyP', 'KeyV'],
      initialJoints: XLEROBOT_HOME_JOINTS.slice(2, 8),
    },
    {
      actuators: [
        ModelActuators.xlerobot.Rotation_R,
        ModelActuators.xlerobot.Pitch_R,
        ModelActuators.xlerobot.Elbow_R,
        ModelActuators.xlerobot.Wrist_Pitch_R,
        ModelActuators.xlerobot.Wrist_Roll_R,
        ModelActuators.xlerobot.Jaw_R,
      ],
      keys: ['KeyH', 'KeyN', 'KeyK', 'Comma', 'KeyJ', 'KeyM', 'KeyL', 'Period', 'Semicolon', 'Slash', 'KeyB'],
      initialJoints: XLEROBOT_HOME_JOINTS.slice(8, 14),
    },
  ],
  head: {
    actuators: [ModelActuators.xlerobot.head_pan, ModelActuators.xlerobot.head_tilt],
    keys: ['KeyR', 'KeyT', 'KeyF', 'KeyG'],
  },
};

export function XLeRobotController({ ik }: { ik?: IkContextValue | null }) {
  useArmController(config, ik);
  return null;
}
