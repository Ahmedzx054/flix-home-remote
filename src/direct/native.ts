import { Capacitor, registerPlugin } from '@capacitor/core';
export interface Discovery { host: string; name?: string; platform?: string; port?: number; service?: string; ssdp?: string }
export interface LanPlugin {
  discover(): Promise<{ devices: Discovery[] }>;
  open(input: { id: string; kind: 'tcp' | 'ws'; host?: string; port?: number; url?: string }): Promise<void>;
  read(input: { id: string }): Promise<{ data?: string; closed: boolean }>;
  write(input: { id: string; data: string }): Promise<void>;
  close(input: { id: string }): Promise<void>;
  http(input: { url: string; method?: string; limit?: number }): Promise<{ data: string; type: string }>;
}
export const Lan = registerPlugin<LanPlugin>('DirectLan');
export const NativeAdb=registerPlugin<{
 pair(input:{host:string;port:number;code:string;key:string}):Promise<void>;
 shell(input:{host:string;port:number;key:string;command:string}):Promise<{output:string}>;
 install(input:{host:string;port:number;key:string;uri:string;id:string;sha256:string}):Promise<{output:string}>;
}>('DirectAdb');
export const Vault = registerPlugin<{ saveSession(input: { key: string; value: string }): Promise<void>; readSession(input: { key: string }): Promise<{ value?: string }>; clearSession(input: { key: string }): Promise<void> }>('HomeDiscovery');
export function requireNative() { if (!Capacitor.isNativePlatform()) throw new Error('افتح نسخة iPhone أو Android المثبتة. المتصفح يعرض الواجهة فقط ولا يملك اتصال TCP واكتشاف الشبكة.'); }
export function localHost(host: string) {
  const p = host.split('.'); if (p.length !== 4 || p.some(v => !/^\d{1,3}$/.test(v) || String(Number(v)) !== v || +v > 255)) throw new Error('أدخل عنوان IPv4 المحلي للتلفزيون.');
  const [a,b] = p.map(Number); if (!(a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31 || a === 169 && b === 254)) throw new Error('يُسمح بعناوين الشبكة المحلية فقط.'); return host;
}
export function localUrl(value: string, host?: string) { const u = new URL(value); localHost(u.hostname); if (host && u.hostname !== host || u.username || u.password || u.hash || !['http:','https:','ws:','wss:'].includes(u.protocol)) throw new Error('التلفزيون أعاد عنوانًا غير مسموح.'); return u; }
export const from64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export function to64(bytes: Uint8Array) { let s = ''; for (let i=0;i<bytes.length;i+=16384) s += String.fromCharCode(...bytes.subarray(i,i+16384)); return btoa(s); }
export async function tvFetch(host: string, port: number, path: string, options: { method?: string } = {}) {
  localHost(host); const url = localUrl(`http://${host}:${port}${path}`, host); const response = await Lan.http({ url: url.href, method: options.method || 'GET' });
  return { text: async () => new TextDecoder().decode(from64(response.data)) };
}
