import { ApkArchive, apkMetadata } from './apk-resources.ts';
import { from64, to64 } from './native.ts';
import type { TvApp } from '../model.ts';

export type AndroidShell = (args: string[]) => Promise<string>;
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
const cache = new Map<string, { at: number; info: TvApp }>();
const pending = new Map<string, Promise<TvApp>>();
let generation = 0;
export function clearAndroidAppMetadata() { generation++; cache.clear(); pending.clear(); }

/** Read only small APK regions through the existing phone ADB connection, on either OS. */
export async function androidAppMetadata(endpoint: string, id: string, shell: AndroidShell): Promise<TvApp> {
  if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(id)) throw Error('Invalid Android app id');
  const key = endpoint + ':' + id, cached = cache.get(key);
  if (cached && Date.now() - cached.at < 300000) return cached.info;
  if (pending.has(key)) return pending.get(key)!;
  const current = generation, deadline = Date.now() + 60000;
  const call = (args: string[]) => { if (generation !== current || Date.now() > deadline) throw Error('TV app metadata cancelled or timed out'); return shell(args); };
  const task = (async () => {
    const paths = (await call(['pm', 'path', id])).split(/\r?\n/).filter(p => p.startsWith('package:')).map(p => p.slice(8).trim());
    const path = paths.find(p => p.endsWith('/base.apk')) || paths[0] || '';
    if (!/^\/(?:data\/app|system\/(?:priv-app|app)|product\/(?:priv-app|app)|system_ext\/(?:priv-app|app)|vendor\/(?:priv-app|app)|oem\/app|odm\/app)\/[A-Za-z0-9_./+~=\-]+\.apk$/.test(path) || path.split('/').includes('..')) throw Error('TV APK path unavailable');
    const sizeText = (await call(['stat', '-c', '%s', path])).trim();
    if (!/^\d{1,10}$/.test(sizeText)) throw Error('TV APK size unavailable');
    const size = Number(sizeText); let transferred = 0;
    const read = async (offset: number, length: number) => {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > size || length > 8388608) throw Error('Invalid APK range');
      const result = new Uint8Array(length);
      for (let i = 0; i < length; i += 131072) {
        const start = offset + i, amount = Math.min(131072, length - i), block = Math.floor(start / 4096), skip = start - block * 4096, count = Math.ceil((skip + amount) / 4096);
        transferred += count * 4096; if (transferred > 16777216) throw Error('TV app metadata transfer limit');
        const output = (await call(['sh', '-c', `dd if=${quote(path)} bs=4096 skip=${block} count=${count} 2>/dev/null | base64`])).replace(/\s/g, '');
        if (output.length > count * 5500 || !/^[A-Za-z0-9+/]*={0,2}$/.test(output)) throw Error('Invalid TV APK data');
        const bytes = from64(output); if (bytes.length < skip + amount || bytes.length > count * 4096) throw Error('TV APK range truncated');
        result.set(bytes.subarray(skip, skip + amount), i);
      }
      return result;
    };
    const archive = await new ApkArchive(read, size).open();
    const metadata = await apkMetadata(archive, id, typeof navigator === 'undefined' ? 'en' : navigator.language);
    const info: TvApp = { id, label: metadata.label || id };
    if (metadata.image) info.icon = 'data:' + metadata.image.mime + ';base64,' + to64(metadata.image.bytes);
    if (generation !== current) throw Error('TV app metadata cancelled');
    if (cache.size >= 150) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), info }); return info;
  })().finally(() => { if (pending.get(key) === task) pending.delete(key); });
  pending.set(key, task); return task;
}
