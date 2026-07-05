import { ModelActuators } from 'mujoco-react';
import { SO101_OVERHEAD_BIMANUAL_HOME_JOINTS } from '../configs';
import { useArmController } from './useArmController';
import type { ArmControllerConfig } from './useArmController';
import type { IkContextValue } from 'mujoco-react';

const config: ArmControllerConfig = {
  arms: [
    {
      actuators: [
        ModelActuators.so101OverheadBimanual.Rotation_L,
        ModelActuators.so101OverheadBimanual.Pitch_L,
        ModelActuators.so101OverheadBimanual.Elbow_L,
        ModelActuators.so101OverheadBimanual.Wrist_Pitch_L,
        ModelActuators.so101OverheadBimanual.Wrist_Roll_L,
        ModelActuators.so101OverheadBimanual.Jaw_L,
      ],
      keys: ['Digit7', 'KeyY', 'Digit9', 'KeyI', 'Digit8', 'KeyU', 'Digit0', 'KeyO', 'Minus', 'KeyP', 'KeyV'],
      initialJoints: SO101_OVERHEAD_BIMANUAL_HOME_JOINTS.slice(0, 6),
    },
    {
      actuators: [
        ModelActuators.so101OverheadBimanual.Rotation_R,
        ModelActuators.so101OverheadBimanual.Pitch_R,
        ModelActuators.so101OverheadBimanual.Elbow_R,
        ModelActuators.so101OverheadBimanual.Wrist_Pitch_R,
        ModelActuators.so101OverheadBimanual.Wrist_Roll_R,
        ModelActuators.so101OverheadBimanual.Jaw_R,
      ],
      keys: ['KeyH', 'KeyN', 'KeyK', 'Comma', 'KeyJ', 'KeyM', 'KeyL', 'Period', 'Semicolon', 'Slash', 'KeyB'],
      initialJoints: SO101_OVERHEAD_BIMANUAL_HOME_JOINTS.slice(6, 12),
    },
  ],
};

export function SO101OverheadBimanualController({ ik }: { ik?: IkContextValue | null }) {
  useArmController(config, ik);
  return null;
}
