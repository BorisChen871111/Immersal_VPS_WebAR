import { immersalParams as defaults } from './imConfig_template.js';

export const immersalParams = { ...defaults, developerToken: '', mapIds: [] };

export function setupVpsControls(button, startTracking) {
  const panel = document.createElement('dialog');
  panel.innerHTML = `
    <form>
      <h2>Immersal VPS for Web</h2>
      <label>Map ID <input name="mapId" inputmode="numeric" pattern="[1-9][0-9]*" required></label>
      <label>Developer Token <input name="token" type="password" autocomplete="off" required></label>
      <p>權杖用於此頁的 Immersal API 請求，重新整理後需重填。</p>
      <button type="button">取消</button> <button>啟動定位</button>
    </form>`;
  const status = document.createElement('output');
  status.id = 'vpsStatus';
  status.setAttribute('role', 'status');
  status.textContent = '尚未啟動定位';
  document.body.append(panel, status);
  const form = panel.querySelector('form');
  button.onclick = () => panel.showModal();
  panel.querySelector('[type=button]').onclick = () => panel.close();
  form.onsubmit = async event => {
    event.preventDefault();
    const mapId = Number(form.elements.mapId.value);
    const token = form.elements.token.value.trim();
    if (!Number.isSafeInteger(mapId) || mapId <= 0 || !token) return;
    immersalParams.mapIds = [mapId];
    immersalParams.developerToken = token;
    form.elements.token.value = '';
    panel.close();
    button.hidden = true;
    status.textContent = '正在啟動相機並載入地圖…';
    try {
      await startTracking();
      status.textContent = '地圖已載入 · 請對準已掃描區域';
    } catch (error) {
      document.querySelector('video')?.srcObject?.getTracks().forEach(track => track.stop());
      status.textContent = error.name === 'NotAllowedError' ? '相機權限未開啟' :
        '啟動失敗 · 請檢查連線、Map ID、Pro 授權與相機權限';
      button.textContent = '重新載入';
      button.hidden = false;
      button.onclick = () => location.reload();
    }
  };
  let lastMessage = '';
  return (count, fresh = count > 0) => {
    const message = !count ? '等待首次定位' :
      fresh ? `成功定位 · ${count} 次` : `定位暫失 · 已成功 ${count} 次`;
    if (lastMessage === message) return;
    lastMessage = message;
    status.textContent = message;
  };
}
