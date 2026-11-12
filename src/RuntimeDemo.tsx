import { useEffect, useRef, useState } from 'react'
import { OrbitControls } from '@react-three/drei'
import { CameraView, FlexRenderer, MujocoCanvas, MujocoProvider } from 'mujoco-react'
import type { RuntimeSnapshot, SimulationRuntime, PolicyCameraFrameStream } from 'mujoco-react'
import './engine-demo.css'

const streams: PolicyCameraFrameStream[] = [
  { key: 'front', position: [2.7, -3.2, 2.2], lookAt: [0, 0, .6], up: [0, 0, 1], width: 224, height: 224 },
  { key: 'side', position: [-2, -1, 1.8], lookAt: [0, 0, .6], up: [0, 0, 1], width: 224, height: 224 },
  { key: 'top', position: [0, 0, 4], lookAt: [0, 0, 0], up: [0, 1, 0], width: 224, height: 224 },
]
function Demo() {
  const runtime = useRef<SimulationRuntime | null>(null)
  const saved = useRef<RuntimeSnapshot | null>(null)
  const loads = useRef(0)
  const alive = useRef(true)
  const [status, setStatus] = useState('Loading worker…')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [images, setImages] = useState<Record<string, string>>({})
  const [stats, setStats] = useState({ fps: 0, time: 0, rtf: 0, physicsMs: 0, captureMs: 0 })
  useEffect(() => {
    alive.current = true
    let frames = 0, start = performance.now(), frame = 0
    const tick = () => {
      frames++
      const elapsed = performance.now() - start
      if (elapsed >= 500) {
        const r = runtime.current
        setStats({ fps: frames * 1000 / elapsed, time: r?.state.time ?? 0,
          rtf: r?.metrics.realTimeFactor ?? 0, physicsMs: r?.metrics.physicsMs ?? 0, captureMs: r?.metrics.captureMs ?? 0 })
        start = performance.now(); frames = 0
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { alive.current = false; cancelAnimationFrame(frame); void runtime.current?.dispose() }
  }, [])
  async function run(operation: (r: SimulationRuntime) => Promise<string>) {
    if (!runtime.current) return
    setBusy(true); setStatus('Working…')
    try { setStatus(await operation(runtime.current)) }
    catch (error) { setStatus(error instanceof Error ? `${error.name}: ${error.message}` : String(error)) }
    finally { if (alive.current) setBusy(false) }
  }
  return <>
    <MujocoCanvas
      // Intentionally inline: HUD updates must not reload the model.
      config={{ src: '/models/engine_demo/', sceneFile: 'scene.xml' }}
      paused integrator="discrete" shadows
      camera={{ position: [2.7, -3.2, 2.2], up: [0, 0, 1], fov: 42 }}
      onReady={({ api: sim }) => {
        loads.current++
        void sim.createRuntime().then(r => {
          if (!alive.current) { void r.dispose(); return }
          runtime.current = r; setReady(true); setStatus('Worker ready · orbit while advancing')
        }).catch(error => setStatus(String(error)))
      }}
      onError={error => setStatus(error.message)}
    >
      <FlexRenderer />
      <ambientLight intensity={1.2} />
      <directionalLight position={[2, -3, 5]} intensity={2.5} castShadow />
      <OrbitControls target={[.1, 0, .6]} makeDefault />
      {streams.map((stream, i) => <CameraView key={stream.key} position={stream.position} lookAt={stream.lookAt} up={stream.up}
        style={{ right: '16px', top: `${16 + i * 160}px`, width: '190px', height: '144px', border: '2px solid #7dd3fc', borderRadius: '8px', pointerEvents: 'none' }} />)}
    </MujocoCanvas>
    <section className="engine-demo" style={{ position: 'absolute', left: 16, top: 16, width: 310, maxHeight: '94vh', overflowY: 'auto', padding: 18, borderRadius: 12, background: '#111827ee', color: '#f1f5f9', fontFamily: 'system-ui', zIndex: 10 }}>
      <a href="?demo=engine" style={{ color: '#7dd3fc' }}>← Engine demos</a>
      <h1 style={{ fontSize: 23 }}>Worker simulation</h1>
      <p>Exact physics steps off the UI thread. Three live GPU previews; images are read back only when requested.</p>
      <p role="status">{status}</p>
      <p>UI {stats.fps.toFixed(0)} FPS · simulation {stats.time.toFixed(3)} s<br />
        Last batch {stats.rtf.toFixed(2)}× real time · physics {stats.physicsMs.toFixed(0)} ms<br />
        Last capture {stats.captureMs.toFixed(0)} ms · model loads {loads.current}</p>
      <fieldset disabled={!ready} style={{ border: 0, padding: 0, display: 'grid', gap: 8 }}>
        <button disabled={busy} onClick={() => void run(async r => { const s = await r.advance({ steps: 500 }); return `Completed 500 steps · ${s.time.toFixed(3)} s` })}>Advance 500 steps</button>
        <button disabled={busy} onClick={() => void run(async r => { await r.advance({ steps: 1_000_000 }); return 'Long batch completed' })}>Run long batch</button>
        <button onClick={() => { void runtime.current?.cancel() }}>Cancel batch</button>
        <button onClick={() => void run(async r => { await r.reset(); return 'Reset to runtime initial state' })}>Reset</button>
        <button disabled={busy} onClick={() => void run(async r => { saved.current = await r.saveState(); setHasSnapshot(true); return `Snapshot saved at ${r.state.time.toFixed(3)} s` })}>Save snapshot</button>
        <button disabled={busy || !hasSnapshot} onClick={() => void run(async r => { const s = await r.restoreState(saved.current!); return `Restored ${s.time.toFixed(3)} s` })}>Restore snapshot</button>
        <button disabled={busy} onClick={() => void run(async r => {
          const observation = await r.observe({ streams })
          setImages(Object.fromEntries(Object.entries(observation.cameras!.frames).map(([key, value]) => [key, value.dataUrl])))
          return `Captured 3 cameras at ${observation.time.toFixed(3)} s`
        })}>Observe 3 cameras</button>
      </fieldset>
      <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>{Object.entries(images).map(([key, src]) => <img key={key} src={src} alt={`Captured ${key} policy observation`} width={90} height={90} style={{ minWidth: 0, objectFit: 'contain' }} />)}</div>
      <p style={{ fontSize: 12, color: '#94a3b8' }}>FPS measures UI animation callbacks. Real-time factor measures completed simulation work. This demo exercises the simulator API; it does not run a learned policy.</p>
    </section>
  </>
}
export function RuntimeDemo() { return <MujocoProvider><Demo /></MujocoProvider> }
