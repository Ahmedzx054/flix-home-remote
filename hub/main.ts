import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bonjour } from 'bonjour-service';
import { createHub } from './server.ts';
import { localAddresses } from './network.ts';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.HOME_REMOTE_PORT || 7799);
const bind = process.env.HOME_REMOTE_BIND || '0.0.0.0';
const hub = createHub({ root: process.env.HOME_REMOTE_DATA || path.join(root, '.data'), webRoot: path.join(root, 'dist') });
const bonjour = new Bonjour();
hub.server.listen(port, bind, () => {
  bonjour.publish({ name: 'ريموت البيت', type: 'flixremote', port, txt: { id: hub.hubId, version: '1' } });
  console.log(`ريموت البيت: ${localAddresses().map(host => `http://${host}:${port}`).join(' | ') || `http://127.0.0.1:${port}`}`);
  console.log(`رمز ربط الهاتف: ${hub.pin} — أدخله داخل التطبيق. لا ترسل الرمز خارج البيت.`);
});
hub.server.on('error', e => { console.error(e.message); bonjour.destroy(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { bonjour.destroy(); hub.server.close(); setTimeout(() => process.exit(0), 1000).unref(); });
