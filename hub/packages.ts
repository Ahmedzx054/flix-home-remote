import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Device, PackageEntry, Platform, InstallReceipt } from '../src/model.ts';
import { Store } from './store.ts';
import { androidSerial, runTool, safeAppId, safeTarget } from './tools.ts';
import { capabilities } from './capabilities.ts';
export const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
const extensions: Partial<Record<Platform, string>> = { android: '.apk', webos: '.ipk', tizen: '.wgt' };
export function validatePackage(platform: Platform, filename: string, bytes: Buffer) {
  const ext = extensions[platform];
  if (!ext || path.extname(filename).toLowerCase() !== ext) throw new Error('نوع الحزمة لا يطابق نظام التلفزيون. APK للأندرويد، IPK لـ LG، وWGT لسامسونغ.');
  if (bytes.length < 8 || bytes.length > MAX_PACKAGE_BYTES) throw new Error('حجم الحزمة يجب أن يكون بين 8 بايت و64 ميغابايت.');
  if (ext === '.ipk' ? bytes.subarray(0, 8).toString() !== '!<arch>\n' : !bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))) throw new Error('محتوى الملف لا يطابق صيغة الحزمة.');
}
export class Packages {
  private busy = new Set<string>();
  constructor(private store: Store) {}
  add(input: { name: string; appId: string; version: string; platform: Platform; filename: string; data: string }) {
    safeAppId(input.appId);
    if (typeof input.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)) throw new Error('محتوى الحزمة غير صالح.');
    const bytes = Buffer.from(input.data, 'base64');
    validatePackage(input.platform, input.filename, bytes);
    const id = randomUUID();
    const entry: PackageEntry = { id, name: String(input.name).trim().slice(0, 80) || input.appId, appId: input.appId, version: String(input.version || '').slice(0, 40), platform: input.platform, filename: id + extensions[input.platform], sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, addedAt: Date.now() };
    writeFileSync(path.join(this.store.packagesDir, entry.filename), bytes, { mode: 0o600 });
    try { this.store.data.packages.push(entry); this.store.save(); } catch (error) { this.store.data.packages = this.store.data.packages.filter(p => p.id !== id); unlinkSync(path.join(this.store.packagesDir, entry.filename)); throw error; }
    return entry;
  }
  async install(d: Device, id: string, confirmed: boolean, execute = runTool): Promise<InstallReceipt> {
    const pkg = this.store.data.packages.find(p => p.id === id);
    if (!pkg) throw new Error('الحزمة غير موجودة.');
    if (!confirmed) throw new Error('راجع اسم التلفزيون والحزمة ثم وافق على التثبيت.');
    if (pkg.platform !== d.platform) throw new Error('هذه الحزمة تخص نظام تلفزيون مختلفًا.');
    if (!capabilities(d).install.available) throw new Error(capabilities(d).install.reason);
    if (this.busy.has(d.id)) throw new Error('هناك تثبيت جارٍ على هذا التلفزيون.');
    const file = path.join(this.store.packagesDir, pkg.filename);
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (hash !== pkg.sha256) throw new Error('تغيرت الحزمة بعد إضافتها؛ ارفع النسخة الصحيحة.');
    this.busy.add(d.id);
    const receipt: InstallReceipt = { id: randomUUID(), packageId: id, deviceId: d.id, sha256: hash, status: 'installing', startedAt: Date.now(), message: 'جارٍ تثبيت الحزمة؛ اترك الوسيط متصلًا.' };
    this.store.data.receipts.unshift(receipt); this.store.data.receipts = this.store.data.receipts.slice(0, 100); this.store.save();
    try {
      let output = '';
      if (d.platform === 'android') output = await execute('adb', ['-s', androidSerial(d.host, d.port), 'install', '-r', file], 180000);
      else if (d.platform === 'webos') {
        safeTarget(d.developerTarget);
        const targets = await execute('ares-setup-device', ['--list']);
        const target = targets.split(/\r?\n/).find(line => line.trim().split(/\s+/)[0] === d.developerTarget);
        if (!target?.includes('@' + d.host + ':')) throw new Error('اسم جهاز webOS لا يطابق عنوان التلفزيون المختار. صحح إعدادات ares قبل التثبيت.');
        output = await execute('ares-install', ['--device', d.developerTarget, file], 180000);
      }
      else if (d.platform === 'tizen') {
        const serial = `${d.host}:26101`;
        await execute('sdb', ['connect', serial]);
        const state = await execute('sdb', ['-s', serial, 'get-state']);
        if (state.trim() !== 'device') throw new Error('لم يؤكد Tizen اتصال التلفزيون المختار.');
        output = await execute('tizen', ['install', '-n', path.basename(file), '-s', serial, '--', path.dirname(file)], 180000);
      }
      else throw new Error('نظام غير قابل للتثبيت.');
      if (!/\bsuccess(?:ful(?:ly)?)?\b|install(?:ation)?[^\r\n]*(?:complete|succeed)/i.test(output)) throw new Error('انتهت الأداة دون تأكيد نجاح التثبيت. تحقق من التلفزيون قبل إعادة المحاولة.');
      receipt.status = 'installed'; receipt.message = 'أداة الجهاز أكدت انتهاء التثبيت. حدّث التطبيقات وتحقق من فتح النسخة على التلفزيون.';
    } catch (error) { receipt.status = 'failed'; receipt.message = error instanceof Error ? error.message : 'فشل التثبيت.'; }
    finally { receipt.endedAt = Date.now(); this.busy.delete(d.id); this.store.save(); }
    return receipt;
  }
}
