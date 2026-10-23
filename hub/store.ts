import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Device, PackageEntry, InstallReceipt } from '../src/model.ts';
interface Data { token: string; devices: Device[]; keys: Record<string, string>; packages: PackageEntry[]; receipts: InstallReceipt[] }
export class Store {
  data: Data;
  readonly packagesDir: string;
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.packagesDir = path.join(root, 'packages');
    mkdirSync(this.packagesDir, { recursive: true, mode: 0o700 });
    try { this.data = JSON.parse(readFileSync(path.join(root, 'state.json'), 'utf8')) as Data; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('ملف بيانات الوسيط غير صالح؛ احتفظ به قبل إصلاحه.');
      this.data = { token: randomBytes(32).toString('hex'), devices: [], keys: {}, packages: [], receipts: [] };
    }
    for (const receipt of this.data.receipts) if (receipt.status === 'installing') { receipt.status = 'failed'; receipt.message = 'توقف الوسيط أثناء التثبيت؛ تحقق من التلفزيون قبل إعادة المحاولة.'; receipt.endedAt = Date.now(); }
    this.save();
  }
  save() { const file = path.join(this.root, 'state.json'); writeFileSync(file + '.tmp', JSON.stringify(this.data, null, 2), { mode: 0o600 }); renameSync(file + '.tmp', file); }
  authorized(value: string) { const a = Buffer.from(value), b = Buffer.from(this.data.token); return a.length === b.length && timingSafeEqual(a, b); }
  device(id: string) { const d = this.data.devices.find(d => d.id === id); if (!d) throw new Error('التلفزيون غير موجود.'); return d; }
  upsert(input: Omit<Device, 'id' | 'paired'>) {
    // One identity per LAN host. Discovery may refine an unknown model, but cannot overwrite a pairing or developer target.
    let d = this.data.devices.find(d => d.host === input.host);
    if (d) { const { platform, ...rest } = input; Object.assign(d, rest); if (platform !== 'unknown') { if (d.platform !== 'unknown' && d.platform !== platform) { d.paired = false; delete this.data.keys[d.id]; delete d.developerTarget; } d.platform = platform; } }
    else { d = { ...input, id: randomUUID(), paired: false }; this.data.devices.push(d); }
    this.save(); return d;
  }
}
