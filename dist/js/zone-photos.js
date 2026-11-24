import { createZoneFace, drawFaceCube } from './zone-face.js';

export function setupZonePhotos({ feed, getLiveVideo, testMode }) {
  const ui = id => document.getElementById(id);
  const overlay = ui('zoneOverlay');
  const paint = overlay.getContext('2d');
  const cameraButton = ui('enableTestCamera');
  const shoot = ui('takePhoto');
  const countdown = ui('photoCountdown');
  const flash = ui('photoFlash');
  const faceStatus = ui('faceStatus');
  const result = ui('photoResult');
  const download = ui('downloadPhoto');
  const preview = ui('capturedPhoto');
  let zone;
  let zoneIdentity;
  let testVideo;
  let facePromise;
  let face;
  let faceError = false;
  let previousVideo;
  let videoTime = -1;
  let lastDetection = -Infinity;
  let points;
  let timer;
  let generation = 0;
  let shooting = false;
  let photoUrl;
  let stopped = false;

  const video = () => testMode ? testVideo : getLiveVideo();
  const hasPhoto = () => zone === 'photo' || zone === 'face';
  const updateButton = () => {
    const disabled = !hasPhoto() || shooting || !(video()?.readyState >= 2);
    if (shoot.disabled !== disabled) shoot.disabled = disabled;
  };
  const showFaceStatus = text => {
    if (faceStatus.textContent !== text) faceStatus.textContent = text;
    faceStatus.hidden = !text;
  };
  function clearPhoto() {
    if (result.open) result.close();
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = undefined;
    preview.removeAttribute('src');
    download.removeAttribute('href');
  }

  async function openTestCamera() {
    if (!testMode || stopped || !hasPhoto() || testVideo || cameraButton.disabled) return;
    cameraButton.disabled = true;
    showFaceStatus('正在開啟相機 · 若出現提示，請允許相機權限。');
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera_unsupported');
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' } } });
      if (stopped || !hasPhoto()) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const camera = document.createElement('video');
      camera.autoplay = camera.muted = camera.playsInline = true;
      camera.srcObject = stream;
      camera.style.transform = 'scaleX(-1)';
      feed.prepend(camera);
      testVideo = camera;
      await testVideo.play();
      document.body.classList.add('camera-active');
      cameraButton.hidden = true;
      showFaceStatus('');
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      testVideo?.remove();
      testVideo = undefined;
      if (hasPhoto()) {
        const unsupported = ['camera_unsupported', 'NotSupportedError', 'NotFoundError'].includes(error.message) ||
          ['NotSupportedError', 'NotFoundError'].includes(error.name);
        const message = unsupported ? '此瀏覽器無法使用相機，請用手機 Safari 或 Chrome 開啟測試連結。' :
          error.name === 'NotAllowedError' ? '相機權限未開啟。請允許後，點「重試相機」。' :
          '相機暫時無法開啟。請關閉其他使用相機的程式，再點「重試相機」。';
        showFaceStatus(message);
        cameraButton.textContent = '重試相機';
      }
    } finally {
      cameraButton.disabled = false;
      updateButton();
    }
  }
  cameraButton.onclick = openTestCamera;

  function drawFace(time) {
    if (zone !== 'face') return;
    const source = video();
    if (!(source?.readyState >= 2)) {
      if (faceStatus.hidden) showFaceStatus('開啟相機後，讓一張臉進入畫面。');
      return;
    }
    if (!facePromise && !faceError) {
      facePromise = createZoneFace().then(model => {
        if (stopped) model.close();
        else face = model;
      }).catch(() => { faceError = true; });
    }
    if (!face || faceError) {
      showFaceStatus(faceError ? '臉部追蹤未能載入，請檢查網路後重新開啟。' : '正在載入臉部追蹤…');
      return;
    }
    if (previousVideo !== source) {
      previousVideo = source;
      videoTime = -1;
    }
    if (videoTime !== source.currentTime && time - lastDetection >= 65) {
      videoTime = source.currentTime;
      lastDetection = time;
      try {
        points = face.detectForVideo(source, time).faceLandmarks[0];
      } catch {
        points = undefined;
        faceError = true;
      }
    }
    if (points) drawFaceCube(paint, points, source, testMode);
    showFaceStatus(points ? '' : '請讓臉進入畫面。');
  }

  function capture(ticket) {
    const source = video();
    if (!(source?.readyState >= 2)) {
      shooting = false;
      updateButton();
      return;
    }
    const width = Math.round(feed.clientWidth);
    const height = Math.round(feed.clientHeight);
    const canvas = document.createElement('canvas');
    const density = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    const ctx = canvas.getContext('2d', { alpha: false });
    const scale = Math.max(canvas.width / source.videoWidth, canvas.height / source.videoHeight);
    const w = source.videoWidth * scale;
    const h = source.videoHeight * scale;
    ctx.save();
    if (testMode) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    ctx.restore();
    if (zone === 'face') ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
    flash.classList.remove('firing');
    void flash.offsetWidth;
    flash.classList.add('firing');
    canvas.toBlob(blob => {
      if (generation !== ticket || stopped) return;
      timer = setTimeout(() => {
        if (generation !== ticket || stopped) return;
        shooting = false;
        updateButton();
        if (!blob) return;
        clearPhoto();
        photoUrl = URL.createObjectURL(blob);
        preview.src = download.href = photoUrl;
        download.download = `高鐵探索館-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
        result.showModal();
        download.click();
      }, 390);
    }, 'image/jpeg', .92);
  }

  shoot.onclick = () => {
    if (!hasPhoto() || shooting || !(video()?.readyState >= 2)) return;
    shooting = true;
    updateButton();
    const ticket = ++generation;
    const end = performance.now() + 3000;
    function tick() {
      if (ticket !== generation) return;
      const remaining = end - performance.now();
      if (remaining > 0) {
        const digit = Math.ceil(remaining / 1000);
        countdown.hidden = false;
        countdown.textContent = String(digit);
        timer = setTimeout(tick, Math.max(1, remaining - (digit - 1) * 1000));
      } else {
        countdown.hidden = true;
        capture(ticket);
      }
    }
    tick();
  };
  ui('closePhoto').onclick = clearPhoto;

  return {
    openTestCamera,
    enter(next, identity = next) {
      if (zone === next && zoneIdentity === identity) return;
      zone = next;
      zoneIdentity = identity;
      generation++;
      clearTimeout(timer);
      countdown.hidden = true;
      flash.classList.remove('firing');
      shooting = false;
      points = undefined;
      videoTime = -1;
      clearPhoto();
      showFaceStatus('');
      cameraButton.textContent = '開啟測試相機';
      ui('photoControls').hidden = !hasPhoto();
      cameraButton.hidden = !testMode || !hasPhoto() || Boolean(testVideo);
      updateButton();
    },
    render(time, train, drawTrain) {
      const width = Math.round(feed.clientWidth);
      const height = Math.round(feed.clientHeight);
      if (overlay.width !== width || overlay.height !== height) {
        overlay.width = width;
        overlay.height = height;
      }
      overlay.hidden = zone !== 'face' && !train;
      paint.clearRect(0, 0, width, height);
      if (train) drawTrain(paint);
      else drawFace(time);
      if (hasPhoto()) updateButton();
    },
    stop() {
      stopped = true;
      this.enter(null);
      testVideo?.srcObject.getTracks().forEach(track => track.stop());
      face?.close();
    },
  };
}
