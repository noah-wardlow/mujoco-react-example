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
  recordMountedCameraFrameSequence,
  CAPTURE_EXCLUDE_KEY,
} from 'mujoco-react';
import { SparkSplatEnvironment } from 'mujoco-react/spark';
import type {
  MujocoSimAPI,
  CameraFrameCaptureOptions,
  CameraFrameCaptureSource,
  IkConfig,
  ScenarioLightingPreset,
  VisualScenarioConfig,
} from 'mujoco-react';
import type { DatasetCameraConfig } from './configs';
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

interface DatasetCameraPreview {
  key: string;
  dataUrl: string;
  source: string;
}

function formatCaptureSource(source: CameraFrameCaptureSource) {
  if (source.kind === 'mujoco-camera') return `camera:${source.cameraName}`;
  if (source.kind === 'mujoco-site') return `site:${source.siteName}`;
  if (source.kind === 'mujoco-body') return `body:${source.bodyName}`;
  return source.kind;
}

function DatasetCameraPanel({
  config,
  previews,
  status,
  onRecord,
}: {
  config?: DatasetCameraConfig;
  previews: DatasetCameraPreview[];
  status: string;
  onRecord: () => void;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Mounted dataset cameras</div>
          <div style={{ color: '#94a3b8', marginTop: 2 }}>{config.label}</div>
        </div>
        <button
          data-testid="dataset-camera-record"
          type="button"
          onClick={onRecord}
          style={{
            alignSelf: 'start',
            padding: '5px 8px',
            border: '1px solid rgba(125, 211, 252, 0.45)',
            background: 'rgba(14, 165, 233, 0.16)',
            color: '#e0f2fe',
            font: 'inherit',
            cursor: 'pointer',
          }}
        >
          Record
        </button>
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
          const preview = previews.find((item) => item.key === key);
          return (
            <div key={key} style={{ minWidth: 0 }}>
              <div
                style={{
                  aspectRatio: '4 / 3',
                  display: 'grid',
                  placeItems: 'center',
                  overflow: 'hidden',
                  background: '#020617',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                }}
              >
                {preview ? (
                  <img
                    src={preview.dataUrl}
                    alt={`${key} mounted camera preview`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ color: '#64748b' }}>{key}</span>
                )}
              </div>
              <div
                title={preview?.source ?? key}
                style={{
                  marginTop: 4,
                  color: '#cbd5e1',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {preview ? `${key} · ${preview.source}` : key}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ color: '#94a3b8', marginTop: 10 }}>
        {config.cameraKeys.length} stream{config.cameraKeys.length === 1 ? '' : 's'} · {status}
      </div>
    </section>
  );
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
  const [datasetCaptureLabel, setDatasetCaptureLabel] = useState('ready');
  const [datasetPreviews, setDatasetPreviews] = useState<DatasetCameraPreview[]>([]);
  const selectedCameraFrameRef = useRef<{
    label: string;
    options: CameraFrameCaptureOptions;
  }>({
    label: 'orbit',
    options: { type: 'image/png' },
  });
  const datasetCamerasRef = useRef<DatasetCameraConfig | undefined>(undefined);

  const { robot: robotKey } = useControls({
    robot: { value: 'franka', options: robotOptions, label: 'Robot' },
  });

  const entry = robots[robotKey];
  datasetCamerasRef.current = entry.datasetCameras;

  const recordDatasetSample = useCallback(async () => {
    const api = apiRef.current;
    const datasetCameras = datasetCamerasRef.current;
    if (!api) {
      setDatasetCaptureLabel('MuJoCo scene is not ready for dataset capture');
      return;
    }
    if (!datasetCameras) {
      setDatasetCaptureLabel('select SO101 or XLeRobot for mounted dataset cameras');
      return;
    }

    try {
      const previews: DatasetCameraPreview[] = [];
      setDatasetCaptureLabel('recording mounted camera sample...');
      const result = await recordMountedCameraFrameSequence(api, {
        cameraKeys: datasetCameras.cameraKeys,
        aliases: datasetCameras.aliases,
        defaults: {
          width: 256,
          height: 192,
          type: 'image/png',
          fov: 55,
          near: 0.01,
          far: 100,
        },
        frames: 1,
        stepsPerFrame: 0,
        retainFrames: false,
        requireAll: true,
        requireMountedSources: true,
        onFrame: ({ cameras }) => {
          for (const [key, frame] of Object.entries(cameras)) {
            previews.push({
              key,
              dataUrl: frame.dataUrl,
              source: formatCaptureSource(frame.source),
            });
          }
        },
      });

      setDatasetPreviews(previews);
      setDatasetCaptureLabel(
        `${result.frameCount} frame captured from ${Object.keys(result.cameraSummaries).length} mounted stream(s)`
      );
    } catch (error) {
      setDatasetCaptureLabel(
        error instanceof Error ? error.message : 'dataset camera capture failed'
      );
    }
  }, []);

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
    robotKey,
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
          `${metadata.robotKey}-${cameraFrame.label}-${metadata.preset}-seed-${metadata.seed}.png`
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
  const canvasKey = useMemo(() => robotKey, [robotKey]);

  const ikConfig = entry.hasIk && entry.ikConfig ? entry.ikConfig : null;
  const hasSplatEnvironment = Boolean(entry.splatEnvironment);
  const applySceneAuthoring = sceneAuthoring.enabled;
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
    setDatasetPreviews([]);
    setDatasetCaptureLabel(
      entry.datasetCameras
        ? `${entry.datasetCameras.cameraKeys.length} mounted stream(s) ready`
        : 'select SO101 or XLeRobot for mounted dataset cameras'
    );
  }, [entry.datasetCameras, robotKey]);

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
        previews={datasetPreviews}
        status={datasetCaptureLabel}
        onRecord={() => { void recordDatasetSample(); }}
      />
      <KeyboardHelp robotKey={robotKey} />
      <GitHubLink />
    </MujocoProvider>
  );
}
