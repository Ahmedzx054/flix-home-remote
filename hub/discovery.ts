import dgram from 'node:dgram';
import { Bonjour } from 'bonjour-service';
import type { Platform } from '../src/model.ts';
import { Store } from './store.ts';
import { assertLanHost, decodeXml, isLanHost } from './network.ts';
export function identify(text: string): Platform {
  if (/roku/i.test(text)) return 'roku';
  if (/webos|lge\.com|\blg\b/i.test(text)) return 'webos';
  if (/samsung|tizen/i.test(text)) return 'tizen';
  if (/android|google.?tv|chromecast|google inc/i.test(text)) return 'android';
  return 'unknown'; // TCL ships Android, Google TV AND Roku. A brand is not a protocol.
}
export async function readDescription(location: string, sender: string, store: Store) {
  const url = new URL(location);
  assertLanHost(sender);
  if (url.protocol !== 'http:' || url.hostname !== sender || url.username || url.password) return;
  const response = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' });
  if (!response.ok || Number(response.headers.get('content-length')) > 128_000) return;
  const reader = response.body?.getReader(); if (!reader) return;
  let data = Buffer.alloc(0);
  try { while (true) { const { value, done } = await reader.read(); if (done) break; data = Buffer.concat([data, Buffer.from(value)]); if (data.length > 128_000) throw new Error('description too large'); } } finally { await reader.cancel(); }
  const parsed = decodeXml<{ root?: { device?: Record<string, string> } }>(data.toString());
  const d = parsed.root?.device;
  if (!d) return;
  const text = `${d.manufacturer ?? ''} ${d.modelName ?? ''} ${d.deviceType ?? ''} ${d.friendlyName ?? ''}`;
  const platform = identify(text);
  if (platform === 'unknown' && !/television|mediarenderer|smart.?tv/i.test(text)) return;
  store.upsert({ host: sender, name: String(d.friendlyName || d.modelName || sender).slice(0, 100), model: String(d.modelName || '').slice(0, 80), platform, seenAt: Date.now() });
}
export class Discovery {
  private pending?: Promise<void>;
  scan(store: Store): Promise<void> { return this.pending ??= this.perform(store).finally(() => { this.pending = undefined; }); }
  private async perform(store: Store) {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const bonjour = new Bonjour();
    const work: Promise<unknown>[] = [];
    const locations = new Set<string>();
    let error: Error | undefined;
    socket.on('error', e => { error = e; });
    socket.on('message', (message, rinfo) => {
      if (locations.size >= 64 || !isLanHost(rinfo.address)) return;
      const location = /^location:\s*(.+)$/im.exec(message.toString())?.[1]?.trim();
      if (!location || locations.has(location)) return;
      locations.add(location); work.push(readDescription(location, rinfo.address, store).catch(() => undefined));
    });
    // mDNS provides the actual ADB connect/pair ports; Android 11+ ports are not fixed at 5555.
    const browsers = ['googlecast', 'androidtvremote2', 'adb-tls-connect', 'adb-tls-pairing'].map(type => bonjour.find({ type }, service => {
      const host = service.addresses?.find(isLanHost); if (!host) return;
      const current = store.data.devices.find(d => d.host === host);
      const isPair = type === 'adb-tls-pairing';
      store.upsert({ host, platform: 'android', name: String(service.txt?.fn || current?.name || service.name).slice(0, 100), model: String(service.txt?.md || current?.model || ''), seenAt: Date.now(), ...(type === 'adb-tls-connect' ? { port: service.port } : {}), ...(isPair ? { pairPort: service.port } : {}) });
    }));
    try {
      await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.bind(0, () => { socket.off('error', reject); resolve(); }); });
      const query = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n');
      socket.setMulticastTTL(2); socket.send(query, 1900, '239.255.255.250');
      await new Promise(resolve => setTimeout(resolve, 2800));
      await Promise.allSettled(work);
      if (error) throw error;
    } finally { socket.close(); browsers.forEach(b => b.stop()); bonjour.destroy(); }
  }
}
