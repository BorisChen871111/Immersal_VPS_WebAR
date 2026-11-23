import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCipheriv, randomBytes } from 'node:crypto';
import { handlePublicVps } from './public-vps.mjs';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const configFile = new URL('./webar.local.json', import.meta.url);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.wasm', 'application/wasm'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
]);
const hasAnchor = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const reply = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

const phoneTest = process.argv.includes('--phone-test');
const publicVps = process.argv.includes('--public-vps');
const phoneKey = phoneTest ? randomBytes(32) : null;
const port = Number(process.env.PORT || (publicVps ? 8769 : phoneTest ? 8768 : 8767));
createServer(async (req, res) => {
  if (!phoneTest && !publicVps && req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
    return reply(res, 403, { error: 'localhost_only' });
  }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (publicVps && url.pathname === '/vps/localize') return handlePublicVps(req, res, configFile);
    if (req.method !== 'GET') return reply(res, 405, { error: 'method' });
    if (publicVps && url.pathname === '/pages-runtime.js') {
      res.writeHead(200, {'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store'});
      return res.end('globalThis.WEBAR_PAGES_MODE=true;globalThis.WEBAR_VPS_ENDPOINT="/vps/localize";');
    }
    if (url.pathname === '/local-vps-config') {
      if (publicVps) return reply(res, 404, { error: 'not_found' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return reply(res, 403, { error: 'origin' });
      const saved = JSON.parse((await readFile(configFile, 'utf8')).replace(/^\uFEFF/, ''));
      const developerToken = typeof saved.developerToken === 'string' ? saved.developerToken.trim() : '';
      const maps = Array.isArray(saved.maps) ? saved.maps.filter(map => map && Number.isSafeInteger(map.mapId) && map.mapId > 0)
        .map(map => ({
          mapId: map.mapId,
          name: String(map.name || `展點 ${map.mapId}`),
          anchor: hasAnchor(map.anchor) ? map.anchor : null,
          yaw: Number.isFinite(map.yaw) ? map.yaw : 0,
        })) : [];
      if (!developerToken || !maps.length) return reply(res, 503, { error: 'settings_missing' });
      const settings = { developerToken, maps };
      if (!phoneTest) return reply(res, 200, settings);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', phoneKey, iv);
      const packet = Buffer.concat([cipher.update(JSON.stringify(settings), 'utf8'), cipher.final(), cipher.getAuthTag()]);
      return reply(res, 200, { iv: iv.toString('base64url'), encrypted: packet.toString('base64url') });
    }
    const pathname = url.pathname === '/' ? '/visit.html' : decodeURIComponent(url.pathname);
    const filename = resolve(root, '.' + pathname);
    if (!filename.startsWith(root + sep)) return reply(res, 404, { error: 'not_found' });
    const data = await readFile(filename);
    res.writeHead(200, {
      'Content-Type': mime.get(extname(filename).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(data);
  } catch (error) {
    if (req.url === '/local-vps-config') return reply(res, 503, { error: 'settings_missing' });
    reply(res, error.code === 'ENOENT' ? 404 : 500, { error: 'request_failed' });
  }
}).listen(port, process.env.VPS_BIND || '127.0.0.1', () => {
  console.log(`WebAR: http://127.0.0.1:${port}/`);
  if (phoneTest) console.log(`Phone link fragment: #test=${phoneKey.toString('base64url')}`);
});
