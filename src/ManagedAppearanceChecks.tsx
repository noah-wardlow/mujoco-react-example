import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MujocoAppearance, useMujoco } from 'mujoco-react';

export function ManagedAppearanceChecks({ onResults }: { onResults: (results: string[]) => void }) {
  const sim = useMujoco(), scene = useThree(state => state.scene);
  useEffect(() => {
    if (sim.status !== 'ready' || !sim.api) return;
    const api = sim.api, time = api.getTime(), results: string[] = [];
    const meshes: THREE.Mesh[] = [];
    scene.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.isMesh && typeof mesh.userData.geomID === 'number') meshes.push(mesh); });
    const original = meshes.map(mesh => ({ geometry: mesh.geometry, material: mesh.material }));
    const session = api.createCameraFrameCaptureSession({ cameraName: 'metric_camera', width: 64, height: 64 });
    let active = true;
    function assert(ok: boolean, message: string) { if (!ok) throw new Error(message); }
    function restored() {
      assert(meshes.length > 0, 'managed meshes missing');
      meshes.forEach((mesh,i) => assert(mesh.geometry === original[i].geometry && mesh.material === original[i].material, 'viewer representation changed'));
      assert(api.getTime() === time, 'capture advanced physics');
    }
    void (async () => {
      try {
        assert(meshes.every(mesh => (mesh.material as THREE.Material).type === 'MeshStandardMaterial'), 'viewer default is not standard');
        const before = session.captureRGBD({ appearance: MujocoAppearance.Standard }); restored();
        const classic = session.captureRGBD(); restored();
        const explicit = session.captureRGBD({ appearance: MujocoAppearance.Classic }); restored();
        const after = session.captureRGBD({ appearance: MujocoAppearance.Standard }); restored();
        assert(classic.appearance === MujocoAppearance.Classic && classic.rgbColorSpace === 'linear-srgb', 'camera defaults');
        assert(classic.rgb.every((v,i) => v === explicit.rgb[i]), 'default differs from explicit classic');
        assert(before.rgb.every((v,i) => v === after.rgb[i]), 'standard pixels changed after capture');
        assert(classic.rgb.some((v,i) => v !== before.rgb[i]), 'classic and standard must differ in this fixture');
        results.push('PASS · Standard viewer / classic cameras by default; viewer pixels and physics unchanged');
        const frame = session.capture();
        const pixels = frame.canvas.getContext('2d')!.getImageData(0,0,64,64).data;
        assert(classic.rgb.every((v,i) => v === pixels[Math.floor(i/3)*4+i%3]), 'PNG/canvas classic color differs from RGB-D');
        results.push('PASS · Default PNG/canvas capture matches classic RGB-D bytes');
        const pending = session.captureAsync(); restored();
        const asyncFrame = await pending; restored();
        const asyncPixels = asyncFrame.canvas.getContext('2d')!.getImageData(0,0,64,64).data;
        assert(classic.rgb.every((v,i) => v === asyncPixels[Math.floor(i/3)*4+i%3]), 'async classic color differs');
        results.push('PASS · Async camera readback restores viewer before awaiting GPU completion');
      } catch (error) { results.push('FAIL · Independent camera appearance: '+String(error)); }
      finally { session.dispose(); if (active) onResults(results); }
    })();
    return () => { active = false; session.dispose(); };
  }, [sim.status,sim.api,scene,onResults]);
  return null;
}
