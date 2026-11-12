import { useRef, useState } from 'react'
import { OrbitControls } from '@react-three/drei'
import { MujocoCanvas, MujocoProvider, useMujocoWasm } from 'mujoco-react'
import type { MujocoSimAPI, StateSnapshot } from 'mujoco-react'
import './engine-demo.css'

const configs = {
  speculative: { src: '/models/engine_demo/', sceneFile: 'speculative.xml' },
  plastic: { src: '/models/engine_demo/', sceneFile: 'plastic.xml' },
}

function FeatureScene({ mode }: { mode: 'speculative' | 'plastic' }) {
  const { mujoco } = useMujocoWasm()
  const api = useRef<MujocoSimAPI>(null)
  const snapshot = useRef<StateSnapshot | null>(null)
  const [ready, setReady] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('Loading…')
  function launch() {
    const sim = api.current
    const model = sim?.mjModelRef.current
    const data = sim?.mjDataRef.current
    if (!sim || !model || !data || !mujoco) return
    sim.reset()
    if (mode === 'speculative') {
      const flag = mujoco.mjtEnableBit.mjENBL_SPECULATIVE.value
      model.opt.enableflags = enabled ? model.opt.enableflags | flag : model.opt.enableflags & ~flag
      data.qvel[0] = 40
      setMessage(enabled ? 'Speculative contacts enabled: the sphere stops at the wall.' : 'Disabled: the sphere tunnels through the wall at this timestep.')
    } else {
      data.qpos.fill(.5)
      mujoco.mj_forward(model, data)
      setMessage('Both springs displaced 0.5 m. Blue returns; orange keeps a permanent offset.')
    }
  }
  return <>
    <MujocoCanvas ref={api} config={configs[mode]}
      speed={mode === 'speculative' ? .1 : 1} shadows
      camera={{ position: [2, -3, 2], up: [0, 0, 1], fov: 42 }}
      onReady={() => { setReady(true); setMessage('Ready') }} onError={error => setMessage(error.message)}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[2, -3, 5]} intensity={2.5} castShadow />
      <OrbitControls target={[.2, 0, .3]} makeDefault />
    </MujocoCanvas>
    <section className="engine-demo" style={{ position: 'absolute', top: 20, left: 20, width: 320, padding: 20, borderRadius: 12, background: '#111827ee', color: '#f1f5f9', fontFamily: 'system-ui' }}>
      <a href="?demo=engine" style={{ color: '#7dd3fc' }}>← Engine demos</a>
      <h1>{mode === 'speculative' ? 'Speculative contacts' : 'Plastic springs'}</h1>
      <p>{mode === 'speculative' ? 'A 40 m/s sphere meets a thin wall at a 20 ms timestep. Playback is slowed to 10%.' : 'Compare a blue elastic spring with an orange yielding spring. The white line marks their original rest position.'}</p>
      <p role="status">{message}</p>
      <fieldset disabled={!ready} style={{ border: 0, padding: 0, display: 'grid', gap: 12 }}>
        {mode === 'speculative' && <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enable speculative contacts on next launch</label>}
        <button onClick={launch}>{mode === 'speculative' ? 'Launch sphere' : 'Stretch and release'}</button>
        <button onClick={() => { snapshot.current = api.current!.saveState(); setSaved(true); setMessage('Snapshot saved, including plastic state') }}>Save snapshot</button>
        <button disabled={!saved} onClick={() => { api.current!.restoreState(snapshot.current!); setMessage('Snapshot restored, including plastic state') }}>Restore snapshot</button>
        <button onClick={() => { api.current!.reset(); setMessage('Scene reset') }}>Reset</button>
      </fieldset>
      <p><a style={{ color: '#7dd3fc' }} href={`?demo=${mode === 'speculative' ? 'plastic' : 'speculative'}`}>{mode === 'speculative' ? 'Try plastic springs →' : 'Try speculative contacts →'}</a></p>
    </section>
  </>
}

export function EngineFeatures({ mode }: { mode: 'speculative' | 'plastic' }) {
  return <MujocoProvider><FeatureScene key={mode} mode={mode} /></MujocoProvider>
}
