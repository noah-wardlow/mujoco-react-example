import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrbitControls, Html, Stats, Environment } from '@react-three/drei';
import { useControls, button } from 'leva';
import {
  MujocoProvider,
  MujocoCanvas,
  ScenarioLighting,
  VisualScenarioEffects,
  useIkController,
  IkGizmo,
  DragInteraction,
  ContactMarkers,
  Debug,
  useSelectionHighlight,
  useMujoco,
  useGravityCompensation,
  useBeforePhysicsStep,
} from 'mujoco-react';
import { SparkSplatEnvironment } from 'mujoco-react/spark';
import type {
  MujocoSimAPI,
  IkConfig,
  ScenarioLightingPreset,
  VisualScenarioConfig,
} from 'mujoco-react';
import { robots } from './configs';
import { FrankaController } from './controllers/FrankaController';
import { SO101Controller } from './controllers/SO101Controller';
import { XLeRobotController } from './controllers/XLeRobotController';
import { useClickSelect } from './useClickSelect';
import { KeyboardHelp } from './KeyboardHelp';
import { GitHubLink } from './GitHubLink';

function LoadingPanel({ error }: { error?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      color: error ? '#f87171' : '#94a3b8',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {error ? (
        <span style={{ fontSize: 14 }}>{error}</span>
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
  );
}

function CanvasLoadingOverlay() {
  return (
    <Html center>
      <LoadingPanel />
    </Html>
  );
}

function LoadingOverlay({ settling }: { settling: boolean }) {
  const sim = useMujoco();
  if (sim.isReady && !settling) return null;
  return (
    <Html center>
      <LoadingPanel error={sim.isError ? sim.error : undefined} />
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

function HoldCtrl({ values }: { values?: number[] }) {
  useBeforePhysicsStep(({ model, data }) => {
    if (!values) return;
    for (let i = 0; i < Math.min(values.length, model.nu); i++) {
      data.ctrl[i] = values[i];
    }
  });
  return null;
}

/** Scene children that need hooks (useIkController) */
function SceneChildren({
  robotKey,
  ikConfig,
  showGizmo,
  gizmoScale,
  holdCtrl,
}: {
  robotKey: string;
  ikConfig: IkConfig | null;
  showGizmo: boolean;
  gizmoScale?: number;
  holdCtrl?: number[];
}) {
  const ik = useIkController(ikConfig);

  return (
    <>
      {ik && showGizmo && <IkGizmo controller={ik} scale={gizmoScale} />}
      <HoldCtrl values={holdCtrl} />

      {/* Per-robot controllers — swap in your own */}
      {robotKey === 'franka' && <FrankaController />}
      {robotKey === 'so101' && <SO101Controller ik={ik} />}
      {robotKey === 'xlerobot' && <XLeRobotController ik={ik} />}
    </>
  );
}

const robotOptions = Object.fromEntries(
  Object.entries(robots).map(([key, r]) => [r.label, key])
);
const Z_UP: [number, number, number] = [0, 0, 1];

const sceneAuthoringOptions = {
  Studio: 'studio',
  Warehouse: 'warehouse',
  'Low light': 'low-light',
  Splat: 'splat',
} satisfies Record<string, ScenarioLightingPreset>;
const sceneAuthoringPresetValues = [
  'studio',
  'warehouse',
  'low-light',
  'splat',
] satisfies readonly ScenarioLightingPreset[];
const defaultSceneAuthoringPreset = 'warehouse' satisfies ScenarioLightingPreset;

function toSceneAuthoringPreset(value: string): ScenarioLightingPreset {
  return (
    sceneAuthoringPresetValues.find((preset) => preset === value) ??
    defaultSceneAuthoringPreset
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const apiRef = useRef<MujocoSimAPI>(null);
  const captureMetadataRef = useRef({
    robotKey: 'franka',
    preset: defaultSceneAuthoringPreset,
    seed: 17,
  });
  const readyGenerationRef = useRef(0);
  const [sceneSettling, setSceneSettling] = useState(true);
  const [captureLabel, setCaptureLabel] = useState('idle');

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

  const sceneAuthoring = useControls('Scene Authoring', {
    enabled: { value: true, label: 'enabled' },
    preset: {
      value: defaultSceneAuthoringPreset,
      options: sceneAuthoringOptions,
      label: 'lighting',
    },
    seed: { value: 17, min: 0, max: 999, step: 1 },
    exposure: { value: 1.15, min: 0.35, max: 1.8, step: 0.05 },
    materials: { value: true, label: 'seeded materials' },
    fog: { value: false, label: 'fog/background' },
  });
  const sceneAuthoringPreset = toSceneAuthoringPreset(sceneAuthoring.preset);
  captureMetadataRef.current = {
    robotKey,
    preset: sceneAuthoringPreset,
    seed: sceneAuthoring.seed,
  };

  useControls('Capture', {
    'save png': button(async () => {
      try {
        setCaptureLabel('capturing blob');
        const metadata = captureMetadataRef.current;
        const frame = await apiRef.current?.captureFrameBlob({
          type: 'image/png',
        });
        if (!frame) throw new Error('MuJoCo canvas is not ready.');
        downloadBlob(
          frame.blob,
          `${metadata.robotKey}-${metadata.preset}-seed-${metadata.seed}.png`
        );
        setCaptureLabel('png saved');
      } catch (error) {
        setCaptureLabel(error instanceof Error ? error.message : 'capture failed');
      }
    }),
    status: {
      value: captureLabel,
      editable: false,
    },
  });
  const canvasKey = useMemo(() => robotKey, [robotKey]);

  const ikConfig = entry.hasIk && entry.ikConfig ? entry.ikConfig : null;
  const hasSplatEnvironment = Boolean(entry.splatEnvironment);
  const visualScenario: VisualScenarioConfig = useMemo(
    () => ({
      id: `${robotKey}-${sceneAuthoring.preset}`,
      label: `${entry.label} ${sceneAuthoringPreset}`,
      seed: sceneAuthoring.seed,
      lighting: sceneAuthoringPreset,
      camera: {
        exposure: sceneAuthoring.exposure,
      },
      materials: {
        randomizeObjectColors: sceneAuthoring.materials,
        randomizeTableMaterial: sceneAuthoring.materials,
      },
    }),
    [
      entry.label,
      robotKey,
      sceneAuthoring.exposure,
      sceneAuthoring.materials,
      sceneAuthoringPreset,
      sceneAuthoring.seed,
    ]
  );

  useEffect(() => {
    readyGenerationRef.current += 1;
    setSceneSettling(true);
  }, [robotKey]);

  const handleReady = useCallback(() => {
    const generation = readyGenerationRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (readyGenerationRef.current === generation) {
          setSceneSettling(false);
        }
      });
    });
  }, []);

  return (
    <MujocoProvider>
      <MujocoCanvas
        key={canvasKey}
        ref={apiRef}
        config={entry.config}
        loadingFallback={<CanvasLoadingOverlay />}
        onReady={handleReady}
        camera={{
          position: entry.camera.position,
          up: Z_UP,
          fov: entry.camera.fov,
          near: 0.01,
          far: 100,
        }}
        paused={sim.paused}
        speed={sim.speed}
        dpr={hasSplatEnvironment ? 1 : [1, 2]}
        gl={{ preserveDrawingBuffer: true }}
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
        <LoadingOverlay settling={sceneSettling} />
        <GravityCompensation enabled={sim.gravityCompensation} />
        <VisualScenarioEffects
          scenario={visualScenario}
          enabled={sceneAuthoring.enabled && !hasSplatEnvironment}
          applyBackground={sceneAuthoring.fog}
          applyFog={sceneAuthoring.fog}
          applyMaterials={sceneAuthoring.materials}
          materialFilter={({ object }) => (
            object.name.includes('cube') ||
            object.name.includes('table') ||
            object.name.includes('floor')
          )}
        />

        {/* IK + per-robot controllers */}
        <SceneChildren
          robotKey={robotKey}
          ikConfig={ikConfig}
          showGizmo={sim.gizmo}
          gizmoScale={entry.gizmoScale}
          holdCtrl={entry.holdCtrl}
        />
        {entry.splatEnvironment ? (
          <SparkSplatEnvironment
            environment={entry.splatEnvironment}
            rotation={[Math.PI / 2, 0, 0]}
            hideGroundMeshes
          />
        ) : null}

        {/* Opt-in interaction */}
        <DragInteraction />
        <ClickSelectOverlay />

        {/* Debug overlays */}
        <ContactMarkers visible={debug.contacts} />
        <Debug showSites={debug.sites} showJoints={debug.joints} />

        {/* Scene decoration — lights, environment, grid */}
        {entry.splatEnvironment ? null : (
          <Environment preset="lobby" background backgroundBlurriness={1} backgroundIntensity={0.6} environmentIntensity={0.5} />
        )}
        {sceneAuthoring.enabled && !hasSplatEnvironment ? (
          <ScenarioLighting preset={sceneAuthoringPreset} intensity={1} />
        ) : (
          <>
            <ambientLight intensity={0.4} />
            <directionalLight position={[2, -2, 5]} intensity={1.5} castShadow />
            <directionalLight position={[-1, 1, 3]} intensity={0.3} />
          </>
        )}
        {entry.splatEnvironment ? null : (
          <gridHelper
            args={[4, 40, '#64748b', '#94a3b8']}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, 0.001]}
          />
        )}
        <Stats />
      </MujocoCanvas>

      {/* HTML overlay — outside R3F canvas */}
      <KeyboardHelp robotKey={robotKey} />
      <GitHubLink />
    </MujocoProvider>
  );
}
