import { useRef, useMemo } from 'react';
import { OrbitControls, Html, Stats } from '@react-three/drei';
import { useControls, button } from 'leva';
import {
  MujocoProvider,
  MujocoCanvas,
  IkController,
  IkGizmo,
  DragInteraction,
  ContactMarkers,
  Debug,
  useSelectionHighlight,
  useMujoco,
  useGravityCompensation,
} from 'mujoco-react';
import type { MujocoSimAPI } from 'mujoco-react';
import { robots } from './configs';
import { FrankaController } from './controllers/FrankaController';
import { SO101Controller } from './controllers/SO101Controller';
import { XLeRobotController } from './controllers/XLeRobotController';
import { useClickSelect } from './useClickSelect';
import { KeyboardHelp } from './KeyboardHelp';

function LoadingOverlay() {
  const { status } = useMujoco();
  if (status === 'ready') return null;
  return (
    <Html center>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        color: status === 'error' ? '#f87171' : '#94a3b8',
        fontFamily: 'system-ui, sans-serif',
      }}>
        {status === 'error' ? (
          <span style={{ fontSize: 14 }}>Failed to load model. Check console.</span>
        ) : (
          <>
            <div style={{
              width: 32,
              height: 32,
              border: '3px solid #334155',
              borderTop: '3px solid #38bdf8',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ fontSize: 14 }}>Loading model...</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </>
        )}
      </div>
    </Html>
  );
}

/** Composable gravity compensation — uses the hook. */
function GravityCompensation({ enabled }: { enabled: boolean }) {
  useGravityCompensation(enabled);
  return null;
}

/** Composable click-to-select — uses hooks. */
function ClickSelectOverlay() {
  const selectedBodyId = useClickSelect();
  useSelectionHighlight(selectedBodyId);
  return null;
}

const robotOptions = Object.fromEntries(
  Object.entries(robots).map(([key, r]) => [r.label, key])
);

export function App() {
  const apiRef = useRef<MujocoSimAPI>(null);

  const { robot: robotKey } = useControls({
    robot: { value: 'franka', options: robotOptions, label: 'Robot' },
  });

  const entry = robots[robotKey];

  const sim = useControls('Simulation', {
    paused: false,
    speed: { value: 1.0, min: 0.1, max: 3.0, step: 0.1 },
    gravityCompensation: { value: false, label: 'gravity compensation' },
    gizmo: { value: true, label: 'IK gizmo' },
    reset: button(() => apiRef.current?.reset()),
  });

  const debug = useControls('Debug', {
    contacts: false,
    sites: false,
    joints: false,
  });

  const canvasKey = useMemo(() => robotKey, [robotKey]);

  return (
    <MujocoProvider>
      <MujocoCanvas
        key={canvasKey}
        ref={apiRef}
        config={entry.config}
        camera={{
          position: entry.camera.position,
          up: [0, 0, 1] satisfies [number, number, number],
          fov: entry.camera.fov,
          near: 0.01,
          far: 100,
        }}
        paused={sim.paused}
        speed={sim.speed}
        shadows
        style={{ width: '100%', height: '100%' }}
      >
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          target={entry.orbitTarget}
          makeDefault
        />

        {/* Core scene */}
        <LoadingOverlay />
        <GravityCompensation enabled={sim.gravityCompensation} />

        {/* Opt-in interaction — each is an independent composable child */}
        {entry.hasIk && entry.ikConfig && sim.gizmo && (
          <IkController config={entry.ikConfig}>
            <IkGizmo scale={entry.gizmoScale} />
          </IkController>
        )}
        <DragInteraction />
        <ClickSelectOverlay />

        {/* Per-robot controllers — swap in your own */}
        {robotKey === 'franka' && <FrankaController />}
        {robotKey === 'so101' && <SO101Controller />}
        {robotKey === 'xlerobot' && <XLeRobotController />}

        {/* Debug overlays */}
        <ContactMarkers visible={debug.contacts} />
        <Debug showSites={debug.sites} showJoints={debug.joints} />

        {/* Scene decoration — lights, grid */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, -2, 5]} intensity={1.5} castShadow />
        <directionalLight position={[-1, 1, 3]} intensity={0.4} />
        <gridHelper
          args={[4, 40, '#334155', '#1e293b']}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, 0.001]}
        />
        <Stats />
      </MujocoCanvas>

      {/* HTML overlay — outside R3F canvas */}
      <KeyboardHelp robotKey={robotKey} />
    </MujocoProvider>
  );
}
