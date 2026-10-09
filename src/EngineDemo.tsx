import { useRef, useState } from 'react'
import './engine-demo.css'
import { OrbitControls } from '@react-three/drei'
import { Quaternion, Vector3 } from 'three'
import { FlexRenderer, GenericIK, MujocoCanvas, MujocoProvider, useMujocoWasm } from 'mujoco-react'
import type { MujocoSimAPI, StateSnapshot } from 'mujoco-react'

const config = { src: '/models/engine_demo/', sceneFile: 'scene.xml' }
const panelStyle = {
  position: 'absolute' as const,
  top: 20,
  left: 20,
  width: 300,
  padding: 20,
  borderRadius: 12,
  background: '#111827ee',
  color: '#f1f5f9',
  fontFamily: 'system-ui',
  zIndex: 10,
}

function Demo() {
  const { mujoco } = useMujocoWasm()
  const api = useRef<MujocoSimAPI>(null)
  const snapshot = useRef<StateSnapshot | null>(null)
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const [message, setMessage] = useState('Loading scene…')
  const [pid, setPid] = useState(0)
  const [slide, setSlide] = useState(0)
  const [hasSnapshot, setHasSnapshot] = useState(false)
  function rotate(angle: number) {
    const sim = api.current,
      model = sim?.mjModelRef.current,
      data = sim?.mjDataRef.current
    if (!mujoco || !sim || !model || !data) return
    const target = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle)
    const q = new GenericIK(mujoco).solveJoints(model, data, 0, [0], new Vector3(-0.7, 0, 0.8), target)
    if (q) {
      sim.setCtrl('ball_servo', q.slice(0, 4))
      setMessage(`Ball IK target: ${Math.round((angle * 180) / Math.PI)}°`)
    }
  }
  return (
    <>
      <MujocoCanvas
        ref={api}
        config={config}
        paused={paused}
        integrator="discrete"
        shadows
        camera={{ position: [2.7, -3.2, 2.2], up: [0, 0, 1], fov: 42 }}
        onReady={({ api: sim }) => {
          setReady(true)
          setMessage(`${sim.getActuators().length} actuators · ${sim.getCtrl().length} control inputs`)
        }}
        onError={(error) => setMessage(error.message)}
      >
        <FlexRenderer />
        <ambientLight intensity={1.2} />
        <directionalLight position={[2, -3, 5]} intensity={2.5} castShadow />
        <OrbitControls target={[0.1, 0, 0.6]} makeDefault />
      </MujocoCanvas>
      <section className="engine-demo" style={panelStyle}>
        <a href="/" style={{ color: '#7dd3fc' }}>
          ← Robot playground
        </a>
        <h1 style={{ fontSize: 23 }}>MuJoCo 3.15 demos</h1>
        <p>Analytic ball-joint IK, multi-input PID control, and a simulated cloth surface.</p>
        <p role="status" style={{ color: '#a5b4fc' }}>
          {message}
        </p>
        <fieldset disabled={!ready} style={{ border: 0, padding: 0, display: 'grid', gap: 12 }}>
          <button onClick={() => rotate(Math.PI / 2)}>Rotate ball 90°</button>
          <button onClick={() => rotate(Math.PI)}>Rotate ball 180°</button>
          <label>
            PID position: {pid.toFixed(2)}
            <input
              aria-label="PID position"
              type="range"
              min="-1.2"
              max="1.2"
              step=".1"
              value={pid}
              onChange={(event) => {
                const value = Number(event.target.value)
                setPid(value)
                api.current?.setCtrl('pid_servo', [value, 0, 0])
              }}
            />
          </label>
          <label>
            Slider position: {slide.toFixed(2)}
            <input
              aria-label="Slider position"
              type="range"
              min="-.3"
              max=".3"
              step=".05"
              value={slide}
              onChange={(event) => {
                const value = Number(event.target.value)
                setSlide(value)
                api.current?.setCtrl('slide_servo', value)
              }}
            />
          </label>
          <button onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button>
          <button
            onClick={() => {
              snapshot.current = api.current!.saveState()
              setHasSnapshot(true)
              setMessage('Snapshot saved')
            }}
          >
            Save snapshot
          </button>
          <button
            disabled={!hasSnapshot}
            onClick={() => {
              api.current!.restoreState(snapshot.current!)
              setPid(snapshot.current!.ctrl[4])
              setSlide(snapshot.current!.ctrl[7])
              setMessage('Snapshot restored')
            }}
          >
            Restore snapshot
          </button>
          <button
            onClick={() => {
              api.current!.reset()
              setPid(0)
              setSlide(0)
              setMessage('Scene reset')
            }}
          >
            Reset
          </button>
        </fieldset>
      </section>
    </>
  )
}
export function EngineDemo() {
  return (
    <MujocoProvider>
      <Demo />
    </MujocoProvider>
  )
}
