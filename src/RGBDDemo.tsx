import { useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { MujocoCanvas, MujocoProvider } from 'mujoco-react';
import type { CameraRGBDResult, MujocoSimAPI } from 'mujoco-react';
import { ManagedAppearanceChecks } from './ManagedAppearanceChecks';
import { RGBDChecks } from './RGBDChecks';

const buttonStyle = { padding: '8px 14px', marginRight: 8, borderRadius: 6, background: '#1d4ed8', color: 'white', cursor: 'pointer' };
const config = { src: '/models/metric_rgbd/', sceneFile: 'scene.xml' };

function Preview({ frame }: { frame: CameraRGBDResult }) {
  function draw(canvas: HTMLCanvasElement | null, depth: boolean) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(frame.width, frame.height);
    for (let i = 0; i < frame.depth.length; i++) {
      const value = Number.isFinite(frame.depth[i]) ? Math.round(255 * (1 - frame.depth[i] / 5)) : 0;
      for (let c = 0; c < 3; c++) image.data[i * 4 + c] = depth ? value : frame.rgb[i * 3 + c];
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }
  return <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
    <figure style={{ margin: 0 }}><canvas width={frame.width} height={frame.height} ref={el => draw(el, false)} /><figcaption>{frame.rgbColorSpace ?? "srgb"} · top-left origin</figcaption></figure>
    <figure style={{ margin: 0 }}><canvas width={frame.width} height={frame.height} ref={el => draw(el, true)} /><figcaption>Camera-axis depth · bright = near · black = no surface</figcaption></figure>
  </div>;
}

function Demo() {
  const api = useRef<MujocoSimAPI>(null);
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState<CameraRGBDResult | null>(null);
  const [message, setMessage] = useState('Loading MuJoCo…');
  const [checks, setChecks] = useState<string[]>([]);
  const [appearanceChecks, setAppearanceChecks] = useState<string[]>([]);
  function capture(flipX = false) {
    try {
      const result = api.current!.captureCameraRGBD({
        cameraName: 'metric_camera', width: 320, height: 240,
        mujocoCameraCompatibility: true, flipX,
      });
      setFrame(result);
      let red = Infinity, blue = Infinity;
      for (let i = 0; i < result.depth.length; i++) {
        if (result.rgb[i * 3] > result.rgb[i * 3 + 2] * 2) red = Math.min(red, result.depth[i]);
        if (result.rgb[i * 3 + 2] > result.rgb[i * 3] * 2) blue = Math.min(blue, result.depth[i]);
      }
      const pass = Math.abs(red - 2) < 0.001 && Math.abs(blue - 3) < 0.001;
      setMessage(`${pass ? 'PASS' : 'FAIL'} · named MuJoCo camera · red front ${red.toFixed(4)} m · blue front ${blue.toFixed(4)} m · ${result.source.kind} · mirrored ${flipX}`);
    } catch (error) { setMessage(String(error)); }
  }
  return <main style={{ padding: 24, color: '#e2e8f0', background: '#0f172a', minHeight: '100vh', fontFamily: 'system-ui' }}>
    <a href="/" style={{ color: '#7dd3fc' }}>← Robot playground</a>
    <h1>Metric RGB-D capture</h1>
    <p>Red box front: 2 meters. Blue box front: 3 meters. Captures use the fixed MuJoCo camera; orbit the viewer independently.</p>
    <p>Viewer: standard lighting. Cameras: MuJoCo classic. Both are the defaults and share one simulation.</p>
    <div style={{ height: 300, maxWidth: 800 }}>
      <MujocoCanvas ref={api} config={config} paused camera={{ position: [4, -4, 3], up: [0, 0, 1] }}
        onReady={() => { setReady(true); setMessage('Ready to capture'); }} onError={e => setMessage(e.message)}>
        <ambientLight intensity={1} />
        <OrbitControls target={[0, 0, -2.5]} />
        <RGBDChecks onResults={setChecks} />
        <ManagedAppearanceChecks onResults={setAppearanceChecks} />
      </MujocoCanvas>
    </div>
    <p><button style={buttonStyle} disabled={!ready} onClick={() => capture()}>Capture RGB-D</button>{' '}
      <button style={buttonStyle} disabled={!ready} onClick={() => capture(true)}>Capture mirrored RGB-D</button></p>
    <p role="status">{message}</p>
    {frame && <Preview frame={frame} />}
    <details open><summary>GPU regression checks</summary><ul>{[...checks,...appearanceChecks].map(c => <li key={c}>{c}</li>)}</ul></details>
  </main>;
}
export function RGBDDemo() { return <MujocoProvider><Demo /></MujocoProvider>; }
