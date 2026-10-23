import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import type { Device, Platform, Command } from '../src/model.ts';
import { Store } from './store.ts';
import { Discovery } from './discovery.ts';
import { Adapters } from './adapters.ts';
import { capabilities } from './capabilities.ts';
import { Packages, MAX_PACKAGE_BYTES } from './packages.ts';
import { assertLanHost, portValue, localAddresses } from './network.ts';
import { safeTarget } from './tools.ts';
import { VERSION, BUILD_ID } from '../src/build-info.ts';
const platforms = new Set<Platform>(['webos', 'tizen', 'android', 'roku', 'unknown']);
const json = (res: http.ServerResponse, code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
async function body(req: http.IncomingMessage, max = 16384) {
  if (Number(req.headers['content-length']) > max) throw new Error('الطلب أكبر من الحد المسموح.');
  let size = 0; const chunks: Buffer[] = [];
  for await (const part of req) { const b = Buffer.from(part); size += b.length; if (size > max) throw new Error('الطلب أكبر من الحد المسموح.'); chunks.push(b); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, any> : {};
}
export function createHub(options: { root: string; webRoot: string; pin?: string; adapters?: Adapters; discovery?: Discovery }) {
  const store = new Store(options.root), adapters = options.adapters || new Adapters(store), discovery = options.discovery || new Discovery(), packages = new Packages(store);
  const pin = options.pin || String(randomInt(100000, 1000000));
  const attempts = new Map<string, { count: number; until: number }>();
  const hubId = store.data.token.slice(-16);
  const server = http.createServer(async (req, res) => {
    try {
      const remote = req.socket.remoteAddress || '';
      // Validate Host and Origin before allowing pairing or bearer-authenticated mutations.
      const host = req.headers.host || '';
      const hostname = new URL('http://' + host).hostname;
      if (!['127.0.0.1', 'localhost', 'flix-remote.local', ...localAddresses()].includes(hostname)) { json(res, 403, { error: 'عنوان وسيط غير مسموح.' }); return; }
      const origin = req.headers.origin;
      if (origin && ![`http://${host}`, `https://${host}`, 'capacitor://localhost', 'http://localhost', 'https://localhost'].includes(origin)) { json(res, 403, { error: 'مصدر الطلب غير مسموح.' }); return; }
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS'); }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const url = new URL(req.url || '/', 'http://' + host), route = url.pathname;
      if (route === '/api/health' && req.method === 'GET') { json(res, 200, { name: 'ريموت البيت', service: 'flix-home-remote', hubId, version: VERSION, buildId: BUILD_ID }); return; }
      if (route === '/download/android' && req.method === 'GET') {
        const apk = path.join(options.webRoot, '..', 'releases', 'home-remote-android-debug.apk');
        if (!existsSync(apk)) { json(res, 404, { error: 'نسخة Android لم تُبنَ على هذا الوسيط بعد.' }); return; }
        res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="home-remote-android-debug.apk"', 'X-Content-Type-Options': 'nosniff' }); res.end(readFileSync(apk)); return;
      }
      if (route === '/api/pair' && req.method === 'POST') {
        if (attempts.size > 1000) for (const [k, v] of attempts) if (v.until < Date.now()) attempts.delete(k);
        const limit = attempts.get(remote); if (limit && limit.until > Date.now() && limit.count >= 5) { json(res, 429, { error: 'انتظر دقيقة قبل إعادة إدخال الرمز.' }); return; }
        const input = await body(req);
        if (input.pin !== pin) { attempts.set(remote, { count: (limit && limit.until > Date.now() ? limit.count : 0) + 1, until: Date.now() + 60000 }); json(res, 401, { error: 'رمز وسيط البيت غير صحيح.' }); return; }
        attempts.delete(remote); json(res, 200, { token: store.data.token, hubId }); return;
      }
      if (route.startsWith('/api/')) {
        if (!store.authorized(String(req.headers.authorization || '').replace(/^Bearer /, ''))) { json(res, 401, { error: 'اربط الهاتف بوسيط البيت أولًا.' }); return; }
        if (route === '/api/devices' && req.method === 'GET') { json(res, 200, { devices: store.data.devices.map(d => ({ ...d, capabilities: capabilities(d) })) }); return; }
        if (route === '/api/scan' && req.method === 'POST') { await discovery.scan(store); json(res, 200, { devices: store.data.devices }); return; }
        if (route === '/api/devices' && req.method === 'POST') {
          const input = await body(req); assertLanHost(input.host);
          if (!platforms.has(input.platform)) throw new Error('اختر نظام التلفزيون.');
          const d = store.upsert({ host: input.host, name: String(input.name || input.host).slice(0, 80), platform: input.platform, seenAt: 0, port: input.port ? portValue(input.port, 5555) : undefined }); json(res, 201, { device: d }); return;
        }
        if (route === '/api/packages' && req.method === 'GET') { json(res, 200, { packages: store.data.packages }); return; }
        if (route === '/api/receipts' && req.method === 'GET') { json(res, 200, { receipts: store.data.receipts }); return; }
        if (route === '/api/packages' && req.method === 'POST') { const input = await body(req, Math.ceil(MAX_PACKAGE_BYTES * 4 / 3) + 16384); json(res, 201, { package: packages.add(input as Parameters<Packages['add']>[0]) }); return; }
        const match = /^\/api\/devices\/([^/]+)(?:\/(pair|command|apps|launch|settings|install|icon))?$/.exec(route);
        if (match) {
          const d = store.device(match[1]), action = match[2];
          if (!action && req.method === 'PATCH') {
            const input = await body(req);
            if (input.name !== undefined) d.name = String(input.name).trim().slice(0, 80) || d.name;
            if (input.port !== undefined) d.port = portValue(input.port, 5555);
            if (input.developerTarget !== undefined) { safeTarget(input.developerTarget); d.developerTarget = input.developerTarget; }
            store.save(); json(res, 200, { device: d }); return;
          }
          if (req.method === 'GET') {
            if (action === 'apps') { const apps = await adapters.apps(d); json(res, 200, { apps }); return; }
            if (action === 'settings') { json(res, 200, { settings: await adapters.settings(d) }); return; }
            if (action === 'icon') {
              // Never proxy an arbitrary URL. Only fetch an icon this paired television just reported.
              const app = (await adapters.apps(d)).find(a => a.id === url.searchParams.get('appId'));
              if (!app?.icon) throw new Error('لا توجد أيقونة لهذا التطبيق.');
              const icon = new URL(app.icon, `http://${d.host}`);
              if (!['http:', 'https:'].includes(icon.protocol) || icon.hostname !== d.host || icon.username || icon.password) throw new Error('أيقونة غير متاحة عبر شبكة التلفزيون.');
              const response = await fetch(icon, { redirect: 'error', signal: AbortSignal.timeout(4000) });
              const type = response.headers.get('content-type') || '';
              if (!response.ok || !/^image\/(png|jpeg|webp)(;|$)/.test(type)) throw new Error('صيغة الأيقونة غير مدعومة.');
              const reader = response.body?.getReader(); if (!reader) throw new Error('أيقونة فارغة.'); let bytes = Buffer.alloc(0);
              try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes = Buffer.concat([bytes, Buffer.from(chunk.value)]); if (bytes.length > 512000) throw new Error('أيقونة أكبر من الحد.'); } } finally { await reader.cancel(); }
              json(res, 200, { icon: `data:${type.split(';')[0]};base64,${bytes.toString('base64')}` }); return;
            }
          }
          if (req.method === 'POST') {
            const input = await body(req);
            if (action === 'pair') { await adapters.pair(d, input.code, input.pairPort ? portValue(input.pairPort, 5555) : undefined); json(res, 200, { device: d }); return; }
            if (action === 'command') { await adapters.command(d, input.command as Command); json(res, 200, { status: 'sent', message: 'أُرسل الأمر إلى التلفزيون.' }); return; }
            if (action === 'launch') { await adapters.launch(d, input.appId); json(res, 200, { status: 'sent' }); return; }
            if (action === 'settings') { await adapters.setSetting(d, input.id, input.value); json(res, 200, { status: 'sent' }); return; }
            if (action === 'install') { const receipt = await packages.install(d, input.packageId, input.confirmed === true); json(res, receipt.status === 'failed' ? 422 : 200, { receipt }); return; }
          }
        }
        json(res, 404, { error: 'مسار غير موجود.' }); return;
      }
      if (req.method !== 'GET') { json(res, 405, { error: 'طريقة غير مسموحة.' }); return; }
      const relative = decodeURIComponent(route).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(options.webRoot, relative);
      if (!file.startsWith(path.resolve(options.webRoot) + path.sep)) { json(res, 403, { error: 'مسار غير مسموح.' }); return; }
      if (!existsSync(file)) { json(res, 404, { error: 'ابنِ التطبيق باستخدام npm run build أولًا.' }); return; }
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'" }); res.end(readFileSync(file)); return;
    } catch (error) { if (!res.headersSent) json(res, 400, { error: error instanceof Error ? error.message : 'تعذر إكمال الطلب.' }); else res.end(); }
  });
  server.requestTimeout = 240000;
  server.on('close', () => adapters.close());
  return { server, store, pin, hubId };
}
