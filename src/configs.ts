import { RobotActuators, RobotBodies, RobotJoints, RobotSites, withSplatEnvironment } from 'mujoco-react';
import type {
  CameraFrameMountSelector,
  IkConfig,
  PairedSplatEnvironmentConfig,
  SceneConfig,
} from 'mujoco-react';

export interface DatasetCameraConfig {
  label: string;
  cameraKeys: string[];
  aliases: Record<
    string,
    CameraFrameMountSelector | readonly CameraFrameMountSelector[]
  >;
}

export interface RobotEntry {
  label: string;
  config: SceneConfig;
  camera: { position: [number, number, number]; fov: number };
  orbitTarget: [number, number, number];
  hasIk: boolean;
  ikConfig?: IkConfig;
  gizmoScale?: number;
  holdCtrl?: number[];
  splatEnvironment?: PairedSplatEnvironmentConfig;
  datasetCameras?: DatasetCameraConfig;
}

const LOCAL_MODEL_BASE = '/models/';

const FRANKA_ARM_JOINTS = [
  RobotJoints.franka.joint1,
  RobotJoints.franka.joint2,
  RobotJoints.franka.joint3,
  RobotJoints.franka.joint4,
  RobotJoints.franka.joint5,
  RobotJoints.franka.joint6,
  RobotJoints.franka.joint7,
];

const FRANKA_ARM_ACTUATORS = [
  RobotActuators.franka.actuator1,
  RobotActuators.franka.actuator2,
  RobotActuators.franka.actuator3,
  RobotActuators.franka.actuator4,
  RobotActuators.franka.actuator5,
  RobotActuators.franka.actuator6,
  RobotActuators.franka.actuator7,
];

const SO101_ARM_JOINTS = [
  RobotJoints.so101.Rotation,
  RobotJoints.so101.Pitch,
  RobotJoints.so101.Elbow,
  RobotJoints.so101.Wrist_Pitch,
  RobotJoints.so101.Wrist_Roll,
];

const SO101_ARM_ACTUATORS = [
  RobotActuators.so101.Rotation,
  RobotActuators.so101.Pitch,
  RobotActuators.so101.Elbow,
  RobotActuators.so101.Wrist_Pitch,
  RobotActuators.so101.Wrist_Roll,
];

export const XLEROBOT_HOME_JOINTS = [
  0, 0,
  1.5708, 1.5785, 1.5777, 0.0008, 1.57, -0.25,
  -1.5708, 1.5785, 1.5777, 0.0008, 1.57, -0.25,
  0, 0,
];

const SPOT_HOME_QPOS = [
  0, 0, 0.46, 1, 0, 0, 0,
  0, 1.04, -1.8,
  0, 1.04, -1.8,
  0, 1.04, -1.8,
  0, 1.04, -1.8,
];

const SPOT_HOME_CTRL = [
  0, 1.04, -1.8,
  0, 1.04, -1.8,
  0, 1.04, -1.8,
  0, 1.04, -1.8,
];

const G1_STAND_QPOS = [
  0, 0, 0.79, 1, 0, 0, 0,
  0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0,
  0, 0, 0,
  0.2, 0.2, 0, 1.28, 0, 0, 0,
  0.2, -0.2, 0, 1.28, 0, 0, 0,
];

const G1_STAND_CTRL = [
  0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0,
  0, 0, 0,
  0.2, 0.2, 0, 1.28, 0, 0, 0,
  0.2, -0.2, 0, 1.28, 0, 0, 0,
];

const XLEROBOT_KITCHEN_SPLAT: PairedSplatEnvironmentConfig = {
  id: 'xlerobot-kitchen-splat',
  label: 'XLeRobot kitchen 3DGS',
  description:
    'MuJoCo-GS-Web tabletop/kitchen Gaussian splat paired with MJCF collision proxy geometry.',
  splat: {
    src: '/models/xlerobot/splats/tabletop/scene.spz',
    format: 'spz',
    renderer: 'spark',
  },
  collisionProxy: {
    xmlPath: '/models/xlerobot/splats/tabletop/scene.xml',
    status: 'validated',
    primitives: ['plane', 'box'],
    notes: [
      'The splat is visual-only; use the paired MJCF XML for contacts.',
    ],
  },
};

export const robots: Record<string, RobotEntry> = {
  franka: {
    label: 'Franka Panda',
    config: {
      src: `${LOCAL_MODEL_BASE}franka_emika_panda/`,
      sceneFile: 'scene.xml',
      homeJoints: [1.707, -1.754, 0.003, -2.702, 0.003, 0.951, 2.49],
      sceneObjects: [
        {
          name: 'red_cube',
          type: 'box',
          size: [0.025, 0.025, 0.025],
          position: [0.0, 0.4, 0.025],
          rgba: [0.9, 0.2, 0.15, 1],
          mass: 0.05,
          freejoint: true,
          friction: '1.5 0.3 0.1',
          solref: '0.01 1',
          solimp: '0.95 0.99 0.001 0.5 2',
          condim: 4,
        },
        {
          name: 'green_cube',
          type: 'box',
          size: [0.025, 0.025, 0.025],
          position: [-0.1, 0.35, 0.025],
          rgba: [0.15, 0.8, 0.3, 1],
          mass: 0.05,
          freejoint: true,
          friction: '1.5 0.3 0.1',
          solref: '0.01 1',
          solimp: '0.95 0.99 0.001 0.5 2',
          condim: 4,
        },
        {
          name: 'blue_cube',
          type: 'box',
          size: [0.025, 0.025, 0.025],
          position: [0.1, 0.45, 0.025],
          rgba: [0.15, 0.4, 0.9, 1],
          mass: 0.05,
          freejoint: true,
          friction: '1.5 0.3 0.1',
          solref: '0.01 1',
          solimp: '0.95 0.99 0.001 0.5 2',
          condim: 4,
        },
      ],
    },
    camera: { position: [2, -1.5, 2.5], fov: 45 },
    orbitTarget: [0, 0, 0.4],
    hasIk: true,
    ikConfig: {
      siteName: RobotSites.franka.tcp,
      joints: FRANKA_ARM_JOINTS,
      actuators: FRANKA_ARM_ACTUATORS,
    },
  },

  so101: {
    label: 'SO101',
    config: {
      src: `${LOCAL_MODEL_BASE}so101/`,
      sceneFile: 'SO101.xml',
      homeJoints: [0.0158, 2.052, 2.1307, -0.0845, 1.5857, -0.3745],
      sceneObjects: [
        {
          name: 'floor',
          type: 'box',
          size: [2, 2, 0.005],
          position: [0, 0, -0.005],
          rgba: [0.15, 0.15, 0.2, 1],
        },
        {
          name: 'table',
          type: 'box',
          size: [0.4, 0.4, 0.4],
          position: [0.35, -0.3, 0.4],
          rgba: [0.35, 0.3, 0.28, 1],
        },
        {
          name: 'red_cube',
          type: 'box',
          size: [0.015, 0.015, 0.015],
          position: [0.3, -0.65, 0.815],
          rgba: [0.9, 0.2, 0.15, 1],
          mass: 0.02,
          freejoint: true,
          friction: '2 0.3 0.1',
          solref: '0.01 1',
          solimp: '0.95 0.99 0.001 0.5 2',
          condim: 4,
        },
        {
          name: 'blue_cube',
          type: 'box',
          size: [0.012, 0.012, 0.015],
          position: [0.38, -0.65, 0.815],
          rgba: [0.15, 0.4, 0.9, 1],
          mass: 0.02,
          freejoint: true,
          friction: '2 0.3 0.1',
          condim: 4,
        },
      ],
    },
    camera: { position: [1.2, -1.2, 1.6], fov: 45 },
    orbitTarget: [0.35, -0.3, 0.8],
    hasIk: true,
    ikConfig: {
      siteName: RobotSites.so101.tcp,
      joints: SO101_ARM_JOINTS,
      actuators: SO101_ARM_ACTUATORS,
    },
    gizmoScale: 0.08,
    datasetCameras: {
      label: 'SO101 wrist dataset camera',
      cameraKeys: ['wrist'],
      aliases: {
        wrist: { bodyName: RobotBodies.so101.Camera },
      },
    },
  },

  xlerobot: {
    label: 'XLeRobot Kitchen',
    config: withSplatEnvironment({
      src: `${LOCAL_MODEL_BASE}xlerobot/`,
      sceneFile: 'xlerobot.xml',
      // 16 actuators: [forward, turn, L_rot, L_pitch, L_elbow, L_wristP, L_wristR, L_jaw,
      //                R_rot, R_pitch, R_elbow, R_wristP, R_wristR, R_jaw, head_pan, head_tilt]
      homeJoints: XLEROBOT_HOME_JOINTS,
      sceneObjects: [
        {
          name: 'red_cube',
          type: 'box',
          size: [0.02, 0.02, 0.02],
          position: [0.25, 0, 0.42],
          rgba: [0.9, 0.2, 0.15, 1],
          mass: 0.03,
          freejoint: true,
          friction: '2 0.3 0.1',
          condim: 4,
        },
        {
          name: 'green_cube',
          type: 'box',
          size: [0.02, 0.02, 0.02],
          position: [0.22, -0.1, 0.42],
          rgba: [0.15, 0.8, 0.3, 1],
          mass: 0.03,
          freejoint: true,
          friction: '2 0.3 0.1',
          condim: 4,
        },
        {
          name: 'blue_cube',
          type: 'box',
          size: [0.02, 0.02, 0.02],
          position: [0.22, 0.1, 0.42],
          rgba: [0.15, 0.4, 0.9, 1],
          mass: 0.03,
          freejoint: true,
          friction: '2 0.3 0.1',
          condim: 4,
        },
        {
          name: 'yellow_sphere',
          type: 'sphere',
          size: [0.025, 0.025, 0.025],
          position: [0.28, 0.08, 0.42],
          rgba: [0.9, 0.8, 0.1, 1],
          mass: 0.02,
          freejoint: true,
          friction: '2 0.3 0.1',
          condim: 4,
        },
      ],
    }, XLEROBOT_KITCHEN_SPLAT),
    camera: { position: [0.5, 3, 1.7], fov: 45 },
    orbitTarget: [0, 0, 0.7],
    hasIk: false,
    splatEnvironment: XLEROBOT_KITCHEN_SPLAT,
    datasetCameras: {
      label: 'XLeRobot mounted dataset cameras',
      cameraKeys: ['head', 'left_wrist', 'right_wrist'],
      aliases: {
        head: { siteName: RobotSites.xlerobot.head_camera_rgb_optical_frame },
        left_wrist: { bodyName: RobotBodies.xlerobot.Left_Arm_Camera },
        right_wrist: { bodyName: RobotBodies.xlerobot.Right_Arm_Camera },
      },
    },
  },

  spot: {
    label: 'Spot',
    config: {
      src: `${LOCAL_MODEL_BASE}boston_dynamics_spot/`,
      sceneFile: 'scene.xml',
      homeJoints: SPOT_HOME_QPOS,
    },
    camera: { position: [1.8, -1.6, 1.2], fov: 45 },
    orbitTarget: [0.15, 0.1, 0.38],
    hasIk: false,
    holdCtrl: SPOT_HOME_CTRL,
  },

  g1: {
    label: 'Unitree G1',
    config: {
      src: `${LOCAL_MODEL_BASE}unitree_g1/`,
      sceneFile: 'scene.xml',
      homeJoints: G1_STAND_QPOS,
    },
    camera: { position: [2.0, -2.4, 1.8], fov: 40 },
    orbitTarget: [0, 0, 0.85],
    hasIk: false,
    holdCtrl: G1_STAND_CTRL,
  },
};
