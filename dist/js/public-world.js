import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';
import { drawVisitFrame } from './visit-sequences.js';

export async function startPublicWorld(feed, endpoint, sequences) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, .01, 200);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  const video = document.createElement('video');
  video.autoplay = video.muted = video.playsInline = true;
  video.srcObject = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
  try { await video.play(); } catch (error) {
    video.srcObject.getTracks().forEach(track => track.stop());
    renderer.dispose();
    throw error;
  }
  feed.append(video, renderer.domElement);
  const frame = document.createElement('canvas');
  const image = frame.getContext('2d', { alpha: false });
  const artwork = document.createElement('canvas');
  artwork.width = 720;
  artwork.height = 432;
  const paint = artwork.getContext('2d');
  const texture = new THREE.CanvasTexture(artwork);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .84),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  scene.add(plate);
  const anchors = new Map();
  const facing = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const flipX = new THREE.Quaternion(1, 0, 0, 0);
  let result;
  let busy = false;
  let lastRequest = -Infinity;
  let active;
  let startedAt;
  let frameIndex = -1;
  let trackingError = false;
  let stopped = false;
  async function localize(captured) {
    busy = true;
    try {
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      frame.width = Math.round(video.videoWidth * scale);
      frame.height = Math.round(video.videoHeight * scale);
      image.drawImage(video, 0, 0, frame.width, frame.height);
      const png = await new Promise(resolve => frame.toBlob(resolve, 'image/png'));
      if (!png || stopped) return;
      // Initial estimate for uncalibrated browser cameras.
      const f = frame.width / (2 * Math.tan(65 * Math.PI / 360));
      const response = await fetch(endpoint, {
        method: 'POST',
        body: new Blob([JSON.stringify({ fx: f, fy: f, ox: frame.width / 2, oy: frame.height / 2 }), '\0', png]),
        headers: { 'Content-Type': 'application/octet-stream' },
        signal: AbortSignal.timeout(11_000),
      });
      if (!response.ok) throw new Error('VPS request failed');
      const next = await response.json();
      trackingError = false;
      if (next.found) result = { ...next, captured, fov: THREE.MathUtils.radToDeg(2 * Math.atan(frame.height / (2 * f))) };
    } catch {
      trackingError = true;
    } finally {
      busy = false;
    }
  }
  return {
    get trackingError() { return trackingError; },
    restartSequence() { startedAt = undefined; frameIndex = -1; },
    stop() {
      stopped = true;
      video.srcObject.getTracks().forEach(track => track.stop());
      renderer.dispose();
      texture.dispose();
      plate.geometry.dispose();
      plate.material.dispose();
    },
    render(time, page) {
      if (video.readyState >= 2 && !busy && time - lastRequest >= 850) {
        lastRequest = time;
        void localize(time);
      }
      if (video.videoWidth && video.videoHeight &&
          (video.videoWidth !== renderer.domElement.width || video.videoHeight !== renderer.domElement.height)) {
        renderer.setSize(video.videoWidth, video.videoHeight, false);
        camera.aspect = video.videoWidth / video.videoHeight;
      }
      const fix = result && time - result.captured < 2500 ? result : null;
      plate.visible = Boolean(fix && (!fix.experience || fix.experience === 'train'));
      let zone = null;
      if (fix) {
        camera.fov = fix.fov;
        camera.updateProjectionMatrix();
        camera.position.fromArray(fix.position);
        const [a,b,c,d,e,f,g,h,i] = fix.rotation;
        matrix.set(a,b,c,0,d,e,f,0,g,h,i,0,0,0,0,1);
        camera.quaternion.setFromRotationMatrix(matrix).multiply(flipX);
        zone = anchors.get(fix.zone);
        if (!zone) {
          camera.getWorldDirection(facing);
          const position = fix.anchor ? new THREE.Vector3(...fix.anchor) : camera.position.clone().addScaledVector(facing, 1.35);
          const yaw = fix.anchor ? THREE.MathUtils.degToRad(fix.yaw) : Math.atan2(-facing.x, -facing.z);
          zone = { name: fix.name, experience: fix.experience, position, yaw };
          anchors.set(fix.zone, zone);
        }
        if (active !== zone) {
          plate.position.copy(zone.position);
          plate.rotation.y = zone.yaw;
          startedAt = undefined;
          frameIndex = -1;
        }
        startedAt ??= time;
        const sequence = sequences[page];
        const index = Math.floor((time - startedAt) * sequence.fps / 1000) % sequence.images.length;
        if (plate.visible && index !== frameIndex) {
          frameIndex = drawVisitFrame(paint, sequence, time - startedAt);
          texture.needsUpdate = true;
        }
      }
      active = zone;
      renderer.render(scene, camera);
      return zone;
    },
  };
}
