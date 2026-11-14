import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAPTURE_EXCLUDE_KEY, CAMERA_FRAME_CAPTURE_PRE_RENDER_USER_DATA_KEY,
  CAMERA_FRAME_CAPTURE_RENDER_USER_DATA_KEY, createCameraFrameCaptureSession, captureCameraRGBD } from 'mujoco-react';

/** Real WebGL checks through the same public interface used by dataset callers. */
export function RGBDChecks({ onResults }: { onResults: (results: string[]) => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const results: string[] = [];
    function check(name: string, fn: () => void) {
      try { fn(); results.push(`PASS · ${name}`); }
      catch (error) { results.push(`FAIL · ${name}: ${error}`); }
    }
    function assert(value: boolean, message: string) { if (!value) throw new Error(message); }
    function close(value: number, expected: number) { assert(Math.abs(value - expected) < 0.0001, `${value} != ${expected}`); }
    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);
    const red = new THREE.MeshBasicMaterial({ color: '#808080', side: THREE.DoubleSide });
    const blue = new THREE.MeshBasicMaterial({ color: 'blue' });
    const plane = new THREE.Mesh(geometry, red);
    plane.position.z = -2;
    scene.add(plane);
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), blue);
    patch.position.set(-0.5, 0.5, -1.5);
    scene.add(patch);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20);
    const session = createCameraFrameCaptureSession(gl, scene, camera, { width: 64, height: 64 });
    // Exercise lazy depth allocation after an RGB-only render.
    session.capturePixels();
    const at = (x: number, y: number) => y * 64 + x;
    check('Perspective: metric Z, top-left RGB alignment, background Infinity', () => {
      const frame = session.captureRGBD();
      close(frame.depth[at(32, 32)], 2);
      close(frame.depth[at(14, 14)], 1.5);
      assert(frame.rgb[at(14, 14) * 3 + 2] > 250, 'blue patch must be top-left');
      assert(frame.depth[0] === Infinity, 'no surface must be Infinity');
      assert(Math.abs(frame.rgb[at(32, 32) * 3] - 128) <= 1, 'RGB must be sRGB');
      close(frame.depth[at(48, 48)], 2); // axial Z, not distance along ray
    });
    check('Horizontal mirroring aligns both arrays exactly', () => {
      const a = session.captureRGBD(), b = session.captureRGBD({ flipX: true });
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        assert(a.depth[at(x, y)] === b.depth[at(63 - x, y)], 'depth mirror');
        for (let c = 0; c < 3; c++) assert(a.rgb[at(x, y) * 3 + c] === b.rgb[at(63 - x, y) * 3 + c], 'RGB mirror');
      }
    });
    check('Owned observations survive later captures and retain camera matrices', () => {
      const a = session.captureRGBD(), saved = a.depth.slice(), matrix = [...a.projectionMatrix];
      session.captureRGBD({ fov: 75 });
      assert(a.depth.every((v, i) => v === saved[i]), 'result overwritten');
      assert(a.projectionMatrix.every((v, i) => v === matrix[i]), 'matrix overwritten');
    });
    check('Orthographic and asymmetric calibrated projections', () => {
      const ortho = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
      const a = captureCameraRGBD(gl, scene, ortho, { camera: ortho, width: 64, height: 64 });
      close(a.depth[at(32, 32)], 2);
      camera.setViewOffset(80, 64, 8, 0, 64, 64);
      const b = session.captureRGBD({ projectionMatrix: camera.projectionMatrix.toArray() });
      close(b.depth[at(32, 32)], 2);
      camera.clearViewOffset();
    });
    check('Geometry filters and capture exclusions restore visibility', () => {
      patch.userData.geomName = 'patch';
      patch.userData.geomGroup = 3;
      close(session.captureRGBD({ hiddenGeomNames: ['patch'] }).depth[at(14, 14)], 2);
      close(session.captureRGBD({ hiddenGeomGroups: [3] }).depth[at(14, 14)], 2);
      patch.userData[CAPTURE_EXCLUDE_KEY] = true;
      close(session.captureRGBD().depth[at(14, 14)], 2);
      delete patch.userData[CAPTURE_EXCLUDE_KEY];
      assert(patch.visible, 'visibility not restored');
    });
    check('Alpha-tested holes and depthWrite follow actual RGB materials', () => {
      patch.visible = false;
      const texture = new THREE.DataTexture(new Uint8Array([255,255,255,0, 255,255,255,255]), 2, 1);
      texture.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5 });
      const cutout = new THREE.Mesh(geometry, material);
      cutout.position.z = -1;
      scene.add(cutout);
      try {
        const a = session.captureRGBD();
        close(a.depth[at(24, 32)], 2);
        close(a.depth[at(40, 32)], 1);
        material.depthWrite = false;
        close(session.captureRGBD().depth[at(40, 32)], 2);
      } finally { scene.remove(cutout); material.dispose(); texture.dispose(); patch.visible = true; }
    });
    check('Renderer state survives successful capture and pre-render failure', () => {
      const target = gl.getRenderTarget(), viewport = gl.getViewport(new THREE.Vector4());
      const scissor = gl.getScissor(new THREE.Vector4()), scissorTest = gl.getScissorTest();
      const color = gl.getClearColor(new THREE.Color()).clone(), alpha = gl.getClearAlpha();
      const background = new THREE.Color('green');
      scene.background = background;
      function restored() {
        assert(gl.getRenderTarget() === target, 'render target');
        assert(gl.getViewport(new THREE.Vector4()).equals(viewport), 'viewport');
        assert(gl.getScissor(new THREE.Vector4()).equals(scissor) && gl.getScissorTest() === scissorTest, 'scissor');
        assert(gl.getClearColor(new THREE.Color()).equals(color) && gl.getClearAlpha() === alpha, 'clear color');
        assert(scene.background === background && patch.visible, 'scene');
      }
      session.captureRGBD({ background: 'yellow', visualOverrides: { sceneBackground: false } }); restored();
      patch.userData[CAMERA_FRAME_CAPTURE_PRE_RENDER_USER_DATA_KEY] = () => { throw new Error('fixture failure'); };
      let threw = false;
      try { session.captureRGBD({ hiddenGeomNames: ['patch'], visualOverrides: { sceneBackground: false } }); }
      catch { threw = true; }
      finally { delete patch.userData[CAMERA_FRAME_CAPTURE_PRE_RENDER_USER_DATA_KEY]; }
      assert(threw, 'must propagate failure'); restored(); scene.background = null;
    });
    check('Capture uses target pixels at DPR 1 and DPR 2', () => {
      const renderer = new THREE.WebGLRenderer();
      try {
        for (const dpr of [1, 2]) {
          renderer.setPixelRatio(dpr);
          const frame = captureCameraRGBD(renderer, scene, camera, { width: 64, height: 64 });
          close(frame.depth[at(14, 14)], 1.5);
          assert(frame.rgb[at(14, 14) * 3 + 2] > 250, 'DPR RGB alignment');
        }
      } finally { renderer.dispose(); renderer.forceContextLoss(); }
    });
    check('Logarithmic depth and invalid projection fail clearly', () => {
      const renderer = new THREE.WebGLRenderer({ logarithmicDepthBuffer: true });
      let rejected = 0;
      try {
        try { captureCameraRGBD(renderer, scene, camera, { width: 64, height: 64 }); }
        catch (e) { if (String(e).includes('logarithmic')) rejected++; }
        try { session.captureRGBD({ projectionMatrix: new Array(16).fill(0) }); }
        catch (e) { if (String(e).includes('invertible projection')) rejected++; }
        assert(rejected === 2, `${rejected}/2 explicit errors`);
      } finally { renderer.dispose(); renderer.forceContextLoss(); }
    });
    check('Custom renderer, resized session, and disposed session fail clearly', () => {
      patch.userData[CAMERA_FRAME_CAPTURE_RENDER_USER_DATA_KEY] = () => null;
      let rejected = 0;
      try { session.captureRGBD(); } catch (e) { if (String(e).includes('custom capture')) rejected++; }
      delete patch.userData[CAMERA_FRAME_CAPTURE_RENDER_USER_DATA_KEY];
      try { session.captureRGBD({ width: 32 }); } catch (e) { if (String(e).includes('stable width')) rejected++; }
      session.dispose();
      try { session.captureRGBD(); } catch (e) { if (String(e).includes('disposed')) rejected++; }
      assert(rejected === 3, `${rejected}/3 explicit errors`);
    });
    session.dispose(); geometry.dispose(); red.dispose(); blue.dispose(); patch.geometry.dispose();
    onResults(results);
  }, [gl, onResults]);
  return null;
}
