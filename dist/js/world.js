import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';
import { Immersal } from './immersal.js';

export async function setupWorld(feed, { mapId, token, anchor, yaw }, drawFrame) {
  if (!Number.isSafeInteger(mapId) || mapId <= 0 || !token ||
      !anchor.every(Number.isFinite) || !Number.isFinite(yaw)) {
    throw new Error('Invalid map or anchor settings');
  }
  const immersal = await Immersal.Initialize(feed, {
    developerToken: token, mapIds: [mapId], continuousLocalization: true,
    continuousInterval: 120, imageDownScale: .25, solverType: 1,
  });
  await immersal.loadMap(mapId);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 500);
  feed.append(renderer.domElement);
  const animation = document.createElement('canvas');
  animation.width = 720;
  animation.height = 432;
  const ctx = animation.getContext('2d');
  const texture = new THREE.CanvasTexture(animation);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.44),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  plane.position.fromArray(anchor);
  plane.rotation.y = THREE.MathUtils.degToRad(yaw);
  scene.add(plane);

  const position = new THREE.Vector3();
  const sensor = new THREE.Quaternion();
  let count = 0;
  let lastFix = -Infinity;
  let hasPose = false;
  return {
    get video() { return immersal.camera?.el; },
    render(time) {
      const video = immersal.camera?.el;
      if (!video || video.readyState < 2 || typeof window.icvPoseGet !== 'function') return false;
      immersal.localizeDevice(time);
      if (count !== immersal.localization.counter) {
        count = immersal.localization.counter;
        lastFix = count > 1 ? time : -Infinity;
      }
      const located = time - lastFix < 4000;
      plane.visible = located;
      if (located) {
        const pose = immersal.getEstimatedPose(time);
        const gyro = immersal.gyroData;
        position.fromArray(pose.position);
        camera.position.lerp(position, hasPose ? .35 : 1);
        camera.quaternion.fromArray(pose.rotation).multiply(sensor.set(gyro.x, gyro.y, gyro.z, gyro.w));
        hasPose = true;
        ctx.clearRect(0, 0, animation.width, animation.height);
        drawFrame(ctx, animation.width, animation.height, time);
        texture.needsUpdate = true;
      } else {
        hasPose = false;
      }
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return false;
      if (renderer.domElement.width !== width || renderer.domElement.height !== height) {
        renderer.setSize(width, height, false);
      }
      const fov = immersal.getVFov();
      if (Number.isFinite(fov) && fov > 0) camera.fov = fov;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return located;
    },
    capture() {
      renderer.render(scene, camera);
      return renderer.domElement;
    },
  };
}
