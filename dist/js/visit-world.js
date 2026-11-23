import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';
import { Immersal } from './immersal.js';
import { drawVisitFrame } from './visit-sequences.js';

export async function startVisitorWorld(feed, { developerToken, maps }, sequences) {
  const uniqueMaps = [...new Map(maps.map(map => [map.mapId, map])).values()];
  const vps = await Immersal.Initialize(feed, {
    developerToken, mapIds: uniqueMaps.map(map => map.mapId),
    continuousLocalization: true, continuousInterval: 120, imageDownScale: .25, solverType: 1,
  });
  const byHandle = new Map();
  for (const map of uniqueMaps) {
    byHandle.set(await vps.loadMap(map.mapId), {
      ...map, position: map.anchor ? new THREE.Vector3(...map.anchor) : null,
      rotation: map.anchor ? THREE.MathUtils.degToRad(map.yaw) : null,
    });
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 200);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  feed.append(renderer.domElement);
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 432;
  const paint = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const billboard = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, .84),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  scene.add(billboard);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  let count = 0;
  let candidate = null;
  let candidateCount = 0;
  let lastFix = -Infinity;
  let active = null;
  let startedAt = null;
  let lastFrame = -1;

  function resetTracking() {
    lastFix = -Infinity;
    candidate = null;
    candidateCount = 0;
    active = null;
    startedAt = null;
  }
  vps.addEventListener('resize', resetTracking);

  return {
    restartSequence() {
      startedAt = null;
      lastFrame = -1;
    },
    stop() {
      vps.continuousLocalization = false;
      vps.camera?.dispose();
      renderer.dispose();
      texture.dispose();
      billboard.geometry.dispose();
      billboard.material.dispose();
    },
    render(time, page) {
      const video = vps.camera?.el;
      if (video?.readyState >= 2 && typeof window.icvPoseGet === 'function') {
        vps.localizeDevice(time);
      }
      const { counter } = vps.localization;
      const pose = vps.localizeInfo;
      if (counter !== count) {
        count = counter;
        const map = byHandle.get(pose.lastSuccessfulHandle);
        if (map && map === candidate && pose.lastSuccessfulFrame - lastFix < 1500) {
          candidateCount++;
        } else {
          candidate = map;
          candidateCount = map ? 1 : 0;
        }
        lastFix = pose.lastSuccessfulFrame;
      }
      const { width, height, intrinsics: { fx, fy, ox, oy } } = vps.cameraData;
      const calibrated = [width, height, fx, fy, ox, oy].every(Number.isFinite) &&
        Math.min(width, height, fx, fy) > 0;
      const map = calibrated && video?.readyState >= 2 && time - lastFix < 1500 && candidateCount >= 2 ?
        candidate : null;
      billboard.visible = Boolean(map);
      if (map) {
        const { near, far } = camera;
        camera.projectionMatrix.makePerspective(
          -ox * near / fx, (width - ox) * near / fx, oy * near / fy, -(height - oy) * near / fy, near, far,
        );
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        position.set(pose.position.x, pose.position.y, pose.position.z);
        rotation.set(vps.gyroData.x, vps.gyroData.y, vps.gyroData.z, vps.gyroData.w);
        camera.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w).multiply(rotation);
        // Do not blend positions across different map coordinate systems.
        camera.position.lerp(position, map === active ? .3 : 1);
        if (map !== active) {
          if (!map.position) {
            camera.getWorldDirection(forward);
            map.position = camera.position.clone().addScaledVector(forward, 1.35);
            map.rotation = Math.atan2(-forward.x, -forward.z);
          }
          billboard.position.copy(map.position);
          billboard.rotation.y = map.rotation;
          startedAt = null;
          lastFrame = -1;
        }
        startedAt ??= time;
        const sequence = sequences[page];
        const frame = Math.floor((time - startedAt) * sequence.fps / 1000) % sequence.images.length;
        if (frame !== lastFrame) {
          lastFrame = drawVisitFrame(paint, sequence, time - startedAt);
          texture.needsUpdate = true;
        }
      }
      active = map;
      if (video?.videoWidth && video.videoHeight &&
          (renderer.domElement.width !== video.videoWidth || renderer.domElement.height !== video.videoHeight)) {
        renderer.setSize(video.videoWidth, video.videoHeight, false);
      }
      renderer.render(scene, camera);
      return map;
    },
  };
}
