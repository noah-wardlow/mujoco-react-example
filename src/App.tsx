import { createRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
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
  useCameraStream,
  CAPTURE_EXCLUDE_KEY,
} from 'mujoco-react';
import { SparkSplatEnvironment } from 'mujoco-react/spark';
import type {
  MujocoSimAPI,
  CameraFrameCaptureOptions,
  CameraFrameMountSelector,
  CameraStreamOptions,
  IkConfig,
  ScenarioLightingPreset,
  VisualScenarioConfig,
} from 'mujoco-react';
import type { DatasetCameraConfig } from './configs';
import { models } from './configs';
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
  modelKey,
  ikConfig,
  showGizmo,
  gizmoScale,
  holdCtrl,
}: {
  modelKey: string;
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

      {/* Per-model controllers — swap in your own */}
      {modelKey === 'franka' && <FrankaController />}
      {modelKey === 'so101' && <SO101Controller ik={ik} />}
      {modelKey === 'xlerobot' && <XLeRobotController ik={ik} />}
    </>
  );
}

const modelOptions = Object.fromEntries(
  Object.entries(models).map(([key, entry]) => [entry.label, key])
);
const Z_UP: [number, number, number] = [0, 0, 1];

const sceneAuthoringOptions = {
  Studio: 'studio',
  Warehouse: 'warehouse',
  'Low light': 'low-light',
  Splat: 'splat',
} satisfies Record<string, ScenarioLightingPreset>;
const cameraFrameOptions = {
  Orbit: 'orbit',
  'Top down': 'top-down',
} satisfies Record<string, string>;
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

function vec3(x: number, y: number, z: number): [number, number, number] {
  return [x, y, z];
}

function mountSelectorToCameraOptions(
  selector: CameraFrameMountSelector | readonly CameraFrameMountSelector[]
): CameraFrameCaptureOptions {
  const first = Array.isArray(selector) ? selector[0] : selector;
  return (first ?? {}) as CameraFrameCaptureOptions;
}

function describeSelector(
  selector: CameraFrameMountSelector | readonly CameraFrameMountSelector[]
) {
  const first = mountSelectorToCameraOptions(selector);
  if (first.cameraName) return `camera:${first.cameraName}`;
  if (first.siteName) return `site:${first.siteName}`;
  if (first.bodyName) return `body:${first.bodyName}`;
  return 'mounted';
}

/**
 * Streams the live MuJoCo scene from each dataset camera into its panel canvas.
 * Mounted inside <MujocoCanvas> so it can render offscreen; it draws into the
 * panel's <canvas> tiles (which live in the HTML overlay outside R3F).
 */
function LiveDatasetCameras({
  config,
  canvasRefs,
}: {
  config: DatasetCameraConfig;
  canvasRefs: Map<string, RefObject<HTMLCanvasElement | null>>;
}) {
  return (
    <>
      {config.cameraKeys.map((key) => {
        const ref = canvasRefs.get(key);
        const selector = config.aliases[key];
        if (!ref || !selector) return null;
        return (
          <LiveCameraStream
            key={key}
            canvasRef={ref}
            options={{
              ...mountSelectorToCameraOptions(selector),
              width: 256,
              height: 192,
              fov: 55,
              near: 0.01,
              far: 100,
            }}
          />
        );
      })}
    </>
  );
}

function LiveCameraStream({
  canvasRef,
  options,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  options: CameraStreamOptions;
}) {
  useCameraStream(canvasRef, options);
  return null;
}

function DatasetCameraPanel({
  config,
  canvasRefs,
}: {
  config?: DatasetCameraConfig;
  canvasRefs: Map<string, RefObject<HTMLCanvasElement | null>>;
}) {
  if (!config) return null;

  return (
    <section
      data-testid="dataset-camera-panel"
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        width: 340,
        maxWidth: 'calc(100vw - 32px)',
        padding: 12,
        border: '1px solid rgba(226, 232, 240, 0.16)',
        background: 'rgba(15, 23, 42, 0.88)',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        zIndex: 20,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Live mounted cameras</div>
        <div style={{ color: '#94a3b8', marginTop: 2 }}>{config.label}</div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(config.cameraKeys.length, 3)}, minmax(0, 1fr))`,
          gap: 8,
          marginTop: 10,
        }}
      >
        {config.cameraKeys.map((key) => {
          const source = describeSelector(config.aliases[key]);
          return (
            <div key={key} style={{ minWidth: 0 }}>
              <div
                style={{
                  position: 'relative',
                  aspectRatio: '4 / 3',
                  overflow: 'hidden',
                  background: '#020617',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                }}
              >
                <canvas
                  ref={canvasRefs.get(key)}
                  data-testid={`live-pane-${key}`}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                  }}
                />
              </div>
              <div
                title={`${key} · ${source}`}
                style={{
                  marginTop: 4,
                  color: '#cbd5e1',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {`${key} · live · ${source}`}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ color: '#94a3b8', marginTop: 10 }}>
        {config.cameraKeys.length} live stream{config.cameraKeys.length === 1 ? '' : 's'}
      </div>
    </section>
  );
}

export function App() {
  const apiRef = useRef<MujocoSimAPI>(null);
  const captureMetadataRef = useRef({
    modelKey: 'franka',
    preset: defaultSceneAuthoringPreset,
    seed: 17,
  });
  const readyGenerationRef = useRef(0);
  const [sceneSettling, setSceneSettling] = useState(true);
  const [captureLabel, setCaptureLabel] = useState('idle');
  const selectedCameraFrameRef = useRef<{
    label: string;
    options: CameraFrameCaptureOptions;
  }>({
    label: 'orbit',
    options: { type: 'image/png' },
  });

  const { model: modelKey } = useControls({
    model: { value: 'franka', options: modelOptions, label: 'Model' },
  });

  const entry = models[modelKey];
  const datasetCameras = entry.datasetCameras;
  const datasetCanvasRefs = useMemo(() => {
    const map = new Map<string, RefObject<HTMLCanvasElement | null>>();
    for (const key of datasetCameras?.cameraKeys ?? []) {
      map.set(key, createRef<HTMLCanvasElement>());
    }
    return map;
  }, [datasetCameras]);


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
    cameras: false,
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
    modelKey,
    preset: sceneAuthoringPreset,
    seed: sceneAuthoring.seed,
  };

  const cameraFrameConfigs = useMemo<Record<string, CameraFrameCaptureOptions>>(() => {
    const [tx, ty, tz] = entry.orbitTarget;
    return {
      orbit: {
        width: 1280,
        height: 900,
        position: entry.camera.position,
        lookAt: entry.orbitTarget,
        up: Z_UP,
        fov: entry.camera.fov,
        type: 'image/png',
      },
      'top-down': {
        width: 1024,
        height: 1024,
        position: vec3(tx, ty, tz + 2.2),
        lookAt: entry.orbitTarget,
        up: vec3(0, 1, 0),
        fov: 45,
        type: 'image/png',
      },
    } satisfies Record<string, CameraFrameCaptureOptions>;
  }, [entry.camera.fov, entry.camera.position, entry.orbitTarget]);

  const capture = useControls('Capture', {
    camera: {
      value: 'orbit',
      options: cameraFrameOptions,
      label: 'camera',
    },
    'save png': button(async () => {
      try {
        setCaptureLabel('capturing camera');
        const metadata = captureMetadataRef.current;
        const cameraFrame = selectedCameraFrameRef.current;
        const frame = await apiRef.current?.captureCameraFrameBlob(
          cameraFrame.options
        );
        if (!frame) throw new Error('MuJoCo scene is not ready.');
        downloadBlob(
          frame.blob,
          `${metadata.modelKey}-${cameraFrame.label}-${metadata.preset}-seed-${metadata.seed}.png`
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
  const selectedCameraFrame =
    cameraFrameConfigs[capture.camera] ?? cameraFrameConfigs.orbit;
  selectedCameraFrameRef.current = {
    label: capture.camera,
    options: selectedCameraFrame,
  };
  const canvasKey = useMemo(() => modelKey, [modelKey]);

  const ikConfig = entry.hasIk && entry.ikConfig ? entry.ikConfig : null;
  const hasSplatEnvironment = Boolean(entry.splatEnvironment);
  const applySceneAuthoring = sceneAuthoring.enabled;
  const visualScenario: VisualScenarioConfig = useMemo(
    () => ({
      id: `${modelKey}-${sceneAuthoring.preset}`,
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
      modelKey,
      sceneAuthoring.exposure,
      sceneAuthoring.materials,
      sceneAuthoringPreset,
      sceneAuthoring.seed,
    ]
  );

  useEffect(() => {
    readyGenerationRef.current += 1;
    setSceneSettling(true);
  }, [modelKey]);

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
          enabled={applySceneAuthoring}
          applyBackground={sceneAuthoring.fog && !hasSplatEnvironment}
          applyFog={sceneAuthoring.fog && !hasSplatEnvironment}
          applyMaterials={sceneAuthoring.materials}
          materialFilter={({ object }) => (
            object.name.includes('cube') ||
            object.name.includes('sphere') ||
            object.name.includes('table') ||
            object.name.includes('floor')
          )}
        />

        {/* IK + per-model controllers */}
        <SceneChildren
          modelKey={modelKey}
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

        {/* Live mounted-camera streams rendered into the dataset panel panes */}
        {datasetCameras ? (
          <LiveDatasetCameras
            config={datasetCameras}
            canvasRefs={datasetCanvasRefs}
          />
        ) : null}

        {/* Opt-in interaction */}
        <DragInteraction />
        <ClickSelectOverlay />

        {/* Debug overlays */}
        <ContactMarkers visible={debug.contacts} />
        <Debug
          showSites={debug.sites}
          showJoints={debug.joints}
          showCameras={debug.cameras}
        />

        {/* Scene decoration — lights, environment, grid */}
        {entry.splatEnvironment ? null : (
          <Environment preset="lobby" background backgroundBlurriness={1} backgroundIntensity={0.6} environmentIntensity={0.5} />
        )}
        {applySceneAuthoring ? (
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
            userData={{ [CAPTURE_EXCLUDE_KEY]: true }}
          />
        )}
        <Stats />
      </MujocoCanvas>

      {/* HTML overlay — outside R3F canvas */}
      <DatasetCameraPanel
        config={entry.datasetCameras}
        canvasRefs={datasetCanvasRefs}
      />
      <KeyboardHelp modelKey={modelKey} />
      <GitHubLink />
    </MujocoProvider>
  );
}
