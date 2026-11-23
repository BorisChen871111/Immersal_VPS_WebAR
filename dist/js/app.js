import { sequences } from './sequences.js';

const mode = new URLSearchParams(location.search).get('mode');
const isWorld = mode === 'world';
const isFace = mode === 'face';
const element = id => document.getElementById(id);
const feed = element('feed');
const overlay = element('overlay');
const paint = overlay.getContext('2d');
const status = element('status');
const start = element('start');
const shoot = element('shoot');
const settings = element('settings');
const preview = element('preview');
const buttons = [element('first'), element('second')];
let active = 0;
let startedAt = performance.now();
let video;
let face;
let world;
let locked = false;
let faceFound = false;
let lastVideoTime = -1;
let points;
let photoUrl;

document.querySelector('[data-mode="' + (isWorld ? 'world' : isFace ? 'face' : 'demo') + '"]')
  .setAttribute('aria-current', 'page');
start.textContent = isWorld ? '設定 Immersal 點位' : '開啟相機';
status.textContent = isWorld ? '設定地圖及錨點後開始定位' :
  isFace ? '開啟前鏡頭體驗臉部特效' : '示範素材 · 開啟相機可測試實景合照';
if (isFace) {
  buttons[0].textContent = '列車長帽';
  buttons[1].textContent = '橘色眼鏡';
}
const frames = isFace ? [] : sequences.map(sequence => sequence.frames.map(url => {
  const image = new Image();
  image.src = url;
  return image;
}));
buttons.forEach((button, index) => button.onclick = () => {
  active = index;
  startedAt = performance.now();
  buttons.forEach((choice, position) => choice.setAttribute('aria-pressed', position === index));
});

function trainFrame(ctx, width, height, time) {
  const images = frames[active];
  if (images?.length) {
    const image = images[Math.floor((time - startedAt) * sequences[active].fps / 1000) % images.length];
    if (!image.naturalWidth) return;
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    return;
  }
  const frame = Math.floor((time - startedAt) / 83.33) % 36;
  const phase = frame / 35;
  const offset = active === 0 ? -110 * (1 - Math.min(phase * 2, 1)) :
    840 * phase - 420;
  ctx.save();
  ctx.translate(width / 2, height * .57);
  const scale = Math.min(width / 700, height / 420);
  ctx.scale(scale, scale);
  ctx.translate(offset, 0);
  ctx.fillStyle = '#f4f0e9';
  ctx.beginPath();
  ctx.moveTo(-185, -52);
  ctx.lineTo(48, -52);
  ctx.bezierCurveTo(102, -52, 154, -33, 190, 2);
  ctx.quadraticCurveTo(210, 24, 171, 29);
  ctx.lineTo(-185, 29);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = active === 0 ? '#ef6a31' : '#2ab5bf';
  ctx.fillRect(-185, 5, 368, 12);
  ctx.fillStyle = '#1f343e';
  for (let x = -160; x < 45; x += 36) ctx.fillRect(x, -33, 23, 13);
  ctx.beginPath();
  ctx.ellipse(106, -26, 31, 9, .33, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const sceneSize = () => [Math.round(feed.clientWidth), Math.round(feed.clientHeight)];
function drawCover(ctx, source, sourceWidth, sourceHeight, width, height, mirror = false) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale;
  const h = sourceHeight * scale;
  ctx.save();
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
  ctx.restore();
}

async function camera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('請用 HTTPS 或電腦 localhost 開啟本頁');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false, video: { facingMode: isFace ? 'user' : 'environment' },
  });
  video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  if (isFace) video.style.transform = 'scaleX(-1)';
  feed.prepend(video);
  await video.play();
}

const visionPackage = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32';
async function startCamera() {
  start.disabled = true;
  status.textContent = '正在開啟相機…';
  try {
    await camera();
    if (isFace) {
      status.textContent = '正在載入臉部追蹤…';
      const { FaceLandmarker, FilesetResolver } = await import(visionPackage + '/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks(visionPackage + '/wasm');
      face = await FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        },
        runningMode: 'VIDEO', numFaces: 1,
      });
    }
    start.textContent = '相機已開啟';
    status.textContent = isFace ? '請看向鏡頭' : '相機預覽 · 示範動畫';
  } catch (error) {
    video?.srcObject?.getTracks().forEach(track => track.stop());
    video?.remove();
    video = undefined;
    start.disabled = false;
    status.textContent = error.name === 'NotAllowedError' ? '請允許瀏覽器使用相機' :
      error.name === 'NotFoundError' ? '這部裝置未找到相機' :
      !navigator.mediaDevices ? '請用 HTTPS 或電腦 localhost 開啟本頁' : '相機或追蹤工具啟動失敗，請檢查裝置和網路後重試';
  }
}

function drawFace(time, width, height) {
  if (!face || video.readyState < 2) return;
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    points = face.detectForVideo(video, time).faceLandmarks[0];
  }
  faceFound = Boolean(points);
  status.textContent = faceFound ? '已追蹤臉部' : '請看向鏡頭';
  if (!points) return;
  const ratio = Math.max(width / video.videoWidth, height / video.videoHeight);
  const vw = video.videoWidth * ratio;
  const vh = video.videoHeight * ratio;
  const point = index => [width / 2 + (.5 - points[index].x) * vw, height / 2 + (points[index].y - .5) * vh];
  const [ax, ay] = point(263);
  const [bx, by] = point(33);
  const [fx, fy] = point(10);
  const size = Math.hypot(bx - ax, by - ay);
  paint.save();
  paint.translate(active === 0 ? fx : (ax + bx) / 2, active === 0 ? fy : (ay + by) / 2);
  paint.rotate(Math.atan2(by - ay, bx - ax));
  if (active === 0) {
    paint.fillStyle = '#15364b';
    paint.beginPath();
    paint.ellipse(0, -size * .35, size * .72, size * .36, 0, 0, Math.PI * 2);
    paint.fill();
    paint.fillRect(-size * .72, -size * .2, size * 1.44, size * .18);
    paint.fillStyle = '#ffac79';
    paint.fillRect(-size * .6, -size * .34, size * 1.2, size * .09);
  } else {
    paint.fillStyle = '#ef6a31bb';
    paint.strokeStyle = '#ffac79';
    paint.lineWidth = Math.max(2, size * .06);
    for (const sign of [-1, 1]) {
      paint.beginPath();
      paint.ellipse(sign * size * .28, 0, size * .25, size * .17, 0, 0, Math.PI * 2);
      paint.fill();
      paint.stroke();
    }
  }
  paint.restore();
}

start.onclick = () => isWorld ? settings.showModal() : startCamera();
element('cancel').onclick = () => settings.close();
element('setup').onsubmit = async event => {
  event.preventDefault();
  const data = new FormData(event.target);
  event.target.elements.token.value = '';
  settings.close();
  start.disabled = true;
  status.textContent = '正在載入 Immersal 與地圖…';
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('Orientation denied');
    }
    const { setupWorld } = await import('./world.js');
    world = await setupWorld(feed, {
      mapId: Number(data.get('map')),
      token: data.get('token').trim(),
      anchor: ['x', 'y', 'z'].map(axis => Number(data.get(axis))),
      yaw: Number(data.get('yaw')),
    }, trainFrame);
    status.textContent = '請將相機對準已掃描的展區';
  } catch {
    feed.querySelector('video')?.srcObject?.getTracks().forEach(track => track.stop());
    status.textContent = '定位啟動失敗，請確認相機權限、網路、地圖 ID 與帳號授權';
    start.textContent = '重新載入後再試';
    start.onclick = () => location.reload();
    start.disabled = false;
  } finally {
    data.delete('token');
  }
};

function frame(time) {
  const [width, height] = sceneSize();
  if (overlay.width !== width || overlay.height !== height) {
    overlay.width = width;
    overlay.height = height;
  }
  paint.clearRect(0, 0, width, height);
  if (isWorld && world) {
    const located = world.render(time);
    if (located !== locked) status.textContent = located ? '已定位 · 尋找錨點上的列車' : '請將相機對準已掃描的展區';
    locked = located;
  } else if (isFace) {
    drawFace(time, width, height);
  } else if (!isWorld) {
    trainFrame(paint, width, height, time);
  }
  shoot.disabled = (isWorld && !locked) || (isFace && !faceFound);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

shoot.onclick = () => {
  const cameraVideo = world?.video ?? video;
  const output = document.createElement('canvas');
  const scale = Math.min(2, devicePixelRatio || 1);
  output.width = overlay.width * scale;
  output.height = overlay.height * scale;
  const ctx = output.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#101e27';
  ctx.fillRect(0, 0, overlay.width, overlay.height);
  if (cameraVideo?.readyState >= 2) {
    drawCover(ctx, cameraVideo, cameraVideo.videoWidth, cameraVideo.videoHeight, overlay.width, overlay.height, isFace);
  }
  const renderCanvas = world?.capture();
  if (renderCanvas) drawCover(ctx, renderCanvas, renderCanvas.width, renderCanvas.height, overlay.width, overlay.height);
  ctx.drawImage(overlay, 0, 0);
  output.toBlob(blob => {
    if (!blob) return;
    photoUrl = URL.createObjectURL(blob);
    element('photo').src = photoUrl;
    element('download').href = photoUrl;
    preview.showModal();
  }, 'image/png');
};
element('retake').onclick = () => preview.close();
preview.onclose = () => {
  URL.revokeObjectURL(photoUrl);
  photoUrl = undefined;
};
window.addEventListener('pagehide', () => {
  (world?.video ?? video)?.srcObject?.getTracks().forEach(track => track.stop());
  face?.close();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) location.reload();
});
