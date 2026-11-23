import { readFile } from 'node:fs/promises';

const maxBytes = 1_000_000;
let ongoing = 0;
let quota = 0;
let quotaStart = Date.now();
const clients = new Map();
const permittedOrigins = new Set((process.env.VPS_ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean));

export async function readVpsSettings(file) {
  const input = process.env.IMMERSAL_CONFIG_JSON || await readFile(file, 'utf8');
  return JSON.parse(input.replace(/^\uFEFF/, ''));
}

async function readFrame(req) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > maxBytes) throw new Error('frame_size');
    parts.push(part);
  }
  return Buffer.concat(parts);
}

export async function handlePublicVps(req, res, configFile) {
  const origin = req.headers.origin;
  const publicOrigin = process.env.VPS_PUBLIC_ORIGIN;
  if (!origin || (origin !== publicOrigin && !permittedOrigins.has(origin))) {
    res.writeHead(403).end();
    return;
  }
  const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  const send = (status, body) => {
    res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }).end();
    return;
  }
  if (req.method !== 'POST') return send(405, { error: 'method' });
  if (req.headers['content-type'] !== 'application/octet-stream') return send(415, { error: 'type' });
  if (Number(req.headers['content-length']) > maxBytes) return send(413, { error: 'too_large' });
  const now = Date.now();
  if (now - quotaStart >= 60_000) {
    quotaStart = now;
    quota = 0;
    clients.clear();
  }
  const client = process.env.VPS_TRUST_CLOUDFLARE === '1' ? req.headers['cf-connecting-ip'] || req.socket.remoteAddress : req.socket.remoteAddress;
  const count = clients.get(client) || 0;
  if (ongoing >= 4 || quota >= 300 || count >= 100) return send(429, { error: 'rate_limit' });
  quota++;
  clients.set(client, count + 1);
  ongoing++;
  try {
    const data = await readFrame(req);
    const boundary = data.indexOf(0);
    let intrinsics;
    try {
      if (boundary < 0 || boundary > 256) throw new Error();
      intrinsics = JSON.parse(data.toString('utf8', 0, boundary));
      if (!intrinsics || !['fx','fy','ox','oy'].every(key => Number.isFinite(intrinsics[key]) && intrinsics[key] > 0 && intrinsics[key] < 2500)) throw new Error();
    } catch {
      return send(400, { error: 'intrinsics' });
    }
    const image = data.subarray(boundary + 1);
    if (image.length < 8 || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      return send(400, { error: 'png_required' });
    }
    const settings = await readVpsSettings(configFile);
    const token = settings.developerToken?.trim();
    const maps = settings.maps?.filter(map => Number.isSafeInteger(map.mapId) && map.mapId > 0).slice(0, 8);
    if (!token || !maps?.length) return send(503, { error: 'settings_missing' });
    const { fx, fy, ox, oy } = intrinsics;
    const metadata = { token, mapIds: maps.map(map => ({id:map.mapId})), fx, fy, ox, oy };
    const response = await fetch('https://api.immersal.com/localize', {
      method: 'POST', body: Buffer.concat([Buffer.from(JSON.stringify(metadata) + '\0'), image]),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    if (!response.ok || result.error !== 'none') return send(502, { error: 'localizer_unavailable' });
    if (!result.success) return send(200, { found: false });
    const index = maps.findIndex(map => map.mapId === result.map);
    if (index < 0) return send(200, { found: false });
    const { anchor, name, yaw } = maps[index];
    const position = [result.px, result.py, result.pz];
    const rotation = ['r00','r01','r02','r10','r11','r12','r20','r21','r22'].map(key => result[key]);
    if (![...position, ...rotation].every(Number.isFinite)) return send(502, { error: 'invalid_pose' });
    return send(200, {
      found: true, zone: index, name: String(name || `展區 ${index + 1}`),
      anchor: Array.isArray(anchor) && anchor.length === 3 && anchor.every(Number.isFinite) ? anchor : null,
      yaw: Number.isFinite(yaw) ? yaw : 0, position, rotation,
    });
  } catch (error) {
    if (!res.headersSent && !res.destroyed) send(error.message === 'frame_size' ? 413 : 502, { error: 'request_failed' });
  } finally {
    ongoing--;
  }
}
