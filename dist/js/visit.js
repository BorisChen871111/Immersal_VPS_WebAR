import { drawVisitFrame, loadVisitSequences } from './visit-sequences.js';

const start = document.querySelector('#startAr');
const status = document.querySelector('#status');
const controls = document.querySelector('#sequenceControls');
const next = document.querySelector('#nextSequence');
const title = document.querySelector('#sequenceTitle');
const feed = document.querySelector('#feed');
let experience;
let currentPage = 0;
let stopped = false;

function setSequences(sequences, restart) {
  title.textContent = sequences[currentPage].title;
  next.onclick = () => {
    currentPage = (currentPage + 1) % sequences.length;
    title.textContent = sequences[currentPage].title;
    restart();
  };
}

async function previewSequences() {
  start.hidden = true;
  status.textContent = '序列圖預覽 · 不使用相機或定位';
  try {
    const sequences = await loadVisitSequences();
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 432;
    feed.append(canvas);
    const ctx = canvas.getContext('2d');
    let startedAt = performance.now();
    setSequences(sequences, () => { startedAt = performance.now(); });
    controls.hidden = false;
    next.disabled = false;
    function render(time) {
      if (stopped) return;
      drawVisitFrame(ctx, sequences[currentPage], time - startedAt);
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  } catch {
    status.textContent = '序列圖載入失敗，請檢查素材檔。';
  }
}

async function getSettings() {
  const response = await fetch('./local-vps-config', { cache: 'no-store' });
  if (!response.ok) throw new Error('settings_missing');
  const settings = await response.json();
  if (!settings.encrypted) return settings;
  try {
    const fragment = new URLSearchParams(location.hash.slice(1)).get('test');
    const bytes = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', bytes(fragment), 'AES-GCM', false, ['decrypt']);
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(settings.iv) }, key, bytes(settings.encrypted));
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Error('phone_link');
  }
}

async function requestOrientation() {
  if (typeof window.DeviceOrientationEvent?.requestPermission === 'function' &&
      await window.DeviceOrientationEvent.requestPermission() !== 'granted') {
    throw new Error('orientation_permission');
  }
}

start.onclick = async () => {
  start.disabled = true;
  status.textContent = '正在準備相機與展區…';
  try {
    await requestOrientation();
    const settings = await getSettings();
    const [{ startVisitorWorld }, sequences] = await Promise.all([
      import('./visit-world.js'),
      loadVisitSequences(),
    ]);
    experience = await startVisitorWorld(feed, settings, sequences);
    if (stopped) {
      experience.stop();
      return;
    }
    start.hidden = true;
    let previousMap;
    function render(time) {
      if (stopped) return;
      const map = experience.render(time, currentPage);
      if (map !== previousMap) {
        status.textContent = map ? `已定位 · ${map.name}` : '正在定位 · 請對準掃描過的展區';
        controls.hidden = !map;
        next.disabled = !map;
      }
      previousMap = map;
      requestAnimationFrame(render);
    }
    setSequences(sequences, () => experience.restartSequence());
    status.textContent = '正在定位 · 請對準掃描過的展區';
    requestAnimationFrame(render);
  } catch (error) {
    feed.querySelector('video')?.srcObject?.getTracks().forEach(track => track.stop());
    feed.replaceChildren();
    status.textContent = error.message === 'settings_missing' ? '展區尚未設定，請聯絡工作人員。' :
      error.message === 'phone_link' ? '請從完整的手機測試連結開啟此頁。' :
      error.name === 'NotAllowedError' || error.message === 'orientation_permission' ?
        '請在瀏覽器允許相機與方向感測器，再重新開啟。' :
        '目前無法開啟展區，請檢查相機與網路。';
    start.disabled = false;
  }
};
if (new URLSearchParams(location.search).get('preview') === '1') previewSequences();
window.addEventListener('pagehide', () => {
  stopped = true;
  experience?.stop();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) location.reload();
});
