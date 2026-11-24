const mediaPipe = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32';
const model = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export async function createZoneFace() {
  const { FaceLandmarker, FilesetResolver } = await import(mediaPipe + '/vision_bundle.mjs');
  return FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(mediaPipe + '/wasm'), {
    baseOptions: { modelAssetPath: model }, runningMode: 'VIDEO', numFaces: 1,
  });
}

export function drawFaceCube(ctx, points, video, mirror) {
  const { width, height } = ctx.canvas;
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const map = index => [
    width / 2 + (mirror ? .5 - points[index].x : points[index].x - .5) * video.videoWidth * scale,
    height / 2 + (points[index].y - .5) * video.videoHeight * scale,
  ];
  const eyes = [map(33), map(263)].sort((left, right) => left[0] - right[0]);
  const [[lx, ly], [rx, ry]] = eyes;
  const [x, y] = map(168);
  const eyeSpan = Math.hypot(rx - lx, ry - ly);
  if (eyeSpan < 4) return;
  const half = eyeSpan * .25;
  const depth = half * .56;
  ctx.save();
  ctx.translate(x, y - half * .8);
  ctx.rotate(Math.atan2(ry - ly, rx - lx));
  const polygon = (vertices, color) => {
    ctx.beginPath();
    vertices.forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
  };
  ctx.strokeStyle = '#fff4df';
  ctx.lineWidth = Math.max(1, half * .09);
  ctx.lineJoin = 'round';
  polygon([[-half,-half],[-half+depth,-half-depth],[half+depth,-half-depth],[half,-half]], '#ffd3ab');
  polygon([[half,-half],[half+depth,-half-depth],[half+depth,half-depth],[half,half]], '#aa4b24');
  polygon([[-half,-half],[half,-half],[half,half],[-half,half]], '#ff8a43');
  ctx.restore();
}
