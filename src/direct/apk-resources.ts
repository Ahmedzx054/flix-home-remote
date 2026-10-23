import { Inflate } from 'fflate';

// Android's binary resource layout: AOSP libs/androidfw/include/androidfw/ResourceTypes.h.
// This reader never executes APK code. Unsupported/split resources remain unavailable.
class Binary {
  view: DataView;
  constructor(readonly bytes: Uint8Array) { this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  check(at: number, size: number) { if (!Number.isSafeInteger(at) || at < 0 || size < 0 || at + size > this.bytes.length) throw Error('Invalid APK resource bounds'); }
  u8(at: number) { this.check(at, 1); return this.view.getUint8(at); }
  u16(at: number) { this.check(at, 2); return this.view.getUint16(at, true); }
  u32(at: number) { this.check(at, 4); return this.view.getUint32(at, true); }
  slice(at: number, size: number) { this.check(at, size); return this.bytes.subarray(at, at + size); }
  chunk(at: number, end = this.bytes.length) { const type = this.u16(at), header = this.u16(at + 2), size = this.u32(at + 4); if (header < 8 || size < header || at + size > end) throw Error('Invalid APK chunk'); return { at, type, header, size }; }
}
function stringPool(binary: Binary, at: number): (index: number) => string {
  const chunk = binary.chunk(at), count = binary.u32(at + 8), flags = binary.u32(at + 16), start = at + binary.u32(at + 20);
  if (chunk.type !== 1 || chunk.header < 28 || count > 300000 || at + chunk.header + count * 4 > at + chunk.size || start > at + chunk.size) throw Error('Invalid APK string pool');
  const cache = new Map<number, string>();
  return index => {
    if (index === 0xffffffff) return '';
    if (index >= count) throw Error('Invalid APK string index');
    if (cache.has(index)) return cache.get(index)!;
    let p = start + binary.u32(at + chunk.header + index * 4);
    const length8 = () => { const a = binary.u8(p++); return a & 128 ? (a & 127) * 256 + binary.u8(p++) : a; };
    const length16 = () => { const a = binary.u16(p); p += 2; if (!(a & 32768)) return a; const b = binary.u16(p); p += 2; return (a & 32767) * 65536 + b; };
    let length: number, encoding: string;
    if (flags & 256) { length8(); length = length8(); encoding = 'utf-8'; } else { length = length16() * 2; encoding = 'utf-16le'; }
    if (length > 65536 || p + length > at + chunk.size) throw Error('Invalid APK string length');
    const value = new TextDecoder(encoding, { fatal: true }).decode(binary.slice(p, length)); cache.set(index, value); return value;
  };
}
interface Value { type: number; data: number; text?: string }
interface XmlNode { tag: string; attrs: Record<string, Value>; children: XmlNode[] }
function xml(bytes: Uint8Array): XmlNode[] {
  const b = new Binary(bytes), root = b.chunk(0); if (root.type !== 3) throw Error('Invalid Android binary XML');
  let strings: (i: number) => string = () => ''; const roots: XmlNode[] = [], stack: XmlNode[] = [];
  for (let p = root.header, nodes = 0; p < root.size;) {
    const c = b.chunk(p, root.size);
    if (c.type === 1) strings = stringPool(b, p);
    if (c.type === 0x102) {
      if (++nodes > 10000 || stack.length > 64 || c.header < 16) throw Error('APK XML too complex');
      const ext = p + c.header, start = b.u16(ext + 8), stride = b.u16(ext + 10), count = b.u16(ext + 12);
      if (start < 20 || stride < 20 || count > 512 || ext + start + stride * count > p + c.size) throw Error('Invalid APK attributes');
      const node: XmlNode = { tag: strings(b.u32(ext + 4)), attrs: {}, children: [] };
      for (let i = 0; i < count; i++) { const a = ext + start + i * stride, type = b.u8(a + 15), data = b.u32(a + 16); node.attrs[strings(b.u32(a + 4))] = { type, data, text: type === 3 ? strings(data) : undefined }; }
      (stack.at(-1)?.children || roots).push(node); stack.push(node);
    }
    if (c.type === 0x103) stack.pop();
    p += c.size;
  }
  return roots;
}
export interface ApkManifest { packageName: string; label?: Value; icon?: Value; banner?: Value }
export function apkManifest(bytes: Uint8Array): ApkManifest {
  const manifest = xml(bytes).find(n => n.tag === 'manifest'), application = manifest?.children.find(n => n.tag === 'application');
  if (!application) throw Error('APK application missing');
  const launcher = application.children.find(n => ['activity', 'activity-alias'].includes(n.tag) && n.children.some(f => f.tag === 'intent-filter' && f.children.some(c => c.tag === 'category' && c.attrs.name?.text === 'android.intent.category.LEANBACK_LAUNCHER')));
  return { packageName: manifest?.attrs.package?.text || '', label: launcher?.attrs.label || application.attrs.label, icon: launcher?.attrs.icon || application.attrs.icon, banner: application.attrs.banner };
}
interface Variant extends Value { score: number }
export class ApkResources {
  private values = new Map<number, Variant[]>();
  constructor(bytes: Uint8Array, language = 'en') {
    const b = new Binary(bytes), table = b.chunk(0); if (table.type !== 2) throw Error('Invalid APK resource table');
    let strings: (i: number) => string = () => '';
    for (let p = table.header; p < table.size;) {
      const c = b.chunk(p, table.size);
      if (c.type === 1) strings = stringPool(b, p);
      if (c.type === 0x200) {
        if (c.header < 284) throw Error('Invalid APK package header');
        const packageId = b.u32(p + 8), typeOffset = c.header >= 288 ? b.u32(p + 284) : 0;
        for (let q = p + c.header; q < p + c.size;) {
          const t = b.chunk(q, p + c.size);
          if (t.type === 0x201) {
            const type = b.u8(q + 8) + typeOffset, flags = b.u8(q + 9), count = b.u32(q + 12), start = b.u32(q + 16), configSize = b.u32(q + 20);
            if (t.header < 40 || configSize < 20 || configSize > t.header - 20 || count > 100000 || start < t.header || start > t.size) throw Error('Invalid APK resource type');
            const locale = String.fromCharCode(b.u8(q + 28), b.u8(q + 29)).replace(/\0/g, ''), density = b.u16(q + 34);
            // Prefer the phone language, then unqualified/English labels; modest density avoids huge icons.
            const score = (locale === language.slice(0, 2) ? 10000 : !locale ? 9000 : locale === 'en' ? 8000 : 0) - Math.abs((density || 160) - 160);
            const stride = flags & 1 ? 4 : flags & 2 ? 2 : 4;
            if (t.header + count * stride > start) throw Error('Invalid APK entry offsets');
            for (let i = 0; i < count; i++) {
              const raw = flags & 1 ? b.u32(q + t.header + i * 4) : flags & 2 ? b.u16(q + t.header + i * 2) : b.u32(q + t.header + i * 4);
              if (!(flags & 1) && raw === (flags & 2 ? 65535 : 0xffffffff)) continue;
              const index = flags & 1 ? raw & 65535 : i, offset = flags & 1 ? (raw >>> 16) * 4 : flags & 2 ? raw * 4 : raw, entry = q + start + offset;
              if (entry + 8 > q + t.size) throw Error('Invalid APK entry');
              const entryFlags = b.u16(entry + 2); if (entryFlags & 1) continue;
              const compact = !!(entryFlags & 8), valueAt = entry + b.u16(entry), dataType = compact ? entryFlags >>> 8 : b.u8(valueAt + 3), data = compact ? b.u32(entry + 4) : b.u32(valueAt + 4);
              if (!compact && (b.u16(entry) < 8 || valueAt + 8 > q + t.size)) throw Error('Invalid APK value');
              const id = ((packageId << 24) | (type << 16) | index) >>> 0, variants = this.values.get(id) || [];
              variants.push({ type: dataType, data, text: dataType === 3 ? strings(data) : undefined, score }); this.values.set(id, variants);
            }
          }
          q += t.size;
        }
      }
      p += c.size;
    }
    for (const values of this.values.values()) values.sort((a, b) => b.score - a.score);
  }
  resolve(value?: Value, seen = new Set<number>()): string[] {
    if (!value) return []; if (value.type === 3) return value.text ? [value.text] : [];
    if (![1, 7].includes(value.type) || seen.has(value.data) || seen.size > 16) return [];
    const next = new Set(seen).add(value.data);
    return [...new Set((this.values.get(value.data) || []).flatMap(v => this.resolve(v, next)))];
  }
  imagePaths(value?: Value, bytes?: Uint8Array): string[] {
    if (!bytes) return this.resolve(value);
    const nodes = xml(bytes); return nodes.flatMap(n => n.tag === 'adaptive-icon' ? n.children.flatMap(c => this.resolve(c.attrs.drawable)) : []);
  }
  value(value?: Value, seen = new Set<number>()): Value | undefined {
    if (!value || ![1, 7].includes(value.type)) return value;
    if (seen.has(value.data) || seen.size > 16) return;
    return this.value(this.values.get(value.data)?.[0], new Set(seen).add(value.data));
  }
}
type RangeReader = (offset: number, length: number) => Promise<Uint8Array>;
interface Entry { name: string; compressed: number; size: number; method: number; crc: number; offset: number }
function crc32(bytes: Uint8Array) { let c = 0xffffffff; for (const byte of bytes) { c ^= byte; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; }
export class ApkArchive {
  entries = new Map<string, Entry>();
  constructor(private read: RangeReader, private size: number) { if (!Number.isSafeInteger(size) || size < 22 || size > 2147483647) throw Error('Invalid APK size'); }
  async open() {
    const length = Math.min(65557, this.size), tail = new Binary(await this.read(this.size - length, length)); let end = -1;
    for (let p = length - 22; p >= 0; p--) if (tail.u32(p) === 0x06054b50 && p + 22 + tail.u16(p + 20) === length) { end = p; break; }
    if (end < 0 || tail.u16(end + 4) || tail.u16(end + 6) || tail.u16(end + 8) !== tail.u16(end + 10)) throw Error('Unsupported APK ZIP directory');
    const count = tail.u16(end + 10), bytes = tail.u32(end + 12), offset = tail.u32(end + 16);
    if (count > 30000 || bytes > 2097152 || offset + bytes > this.size - length + end) throw Error('APK directory too large');
    const directory = new Binary(await this.read(offset, bytes)); let p = 0;
    for (let i = 0; i < count; i++) {
      if (directory.u32(p) !== 0x02014b50 || directory.u16(p + 8) & 1) throw Error('Invalid APK ZIP entry');
      const n = directory.u16(p + 28), extra = directory.u16(p + 30), comment = directory.u16(p + 32), name = new TextDecoder().decode(directory.slice(p + 46, n));
      const entry = { name, method: directory.u16(p + 10), crc: directory.u32(p + 16), compressed: directory.u32(p + 20), size: directory.u32(p + 24), offset: directory.u32(p + 42) };
      if (this.entries.has(name) || entry.offset >= offset || name.includes('\0')) throw Error('Invalid APK ZIP entry identity');
      this.entries.set(name, entry); p += 46 + n + extra + comment;
    }
    if (p !== bytes) throw Error('Invalid APK directory size'); return this;
  }
  async file(name: string, limit: number) {
    const e = this.entries.get(name); if (!e || e.size > limit || e.compressed > limit || ![0, 8].includes(e.method)) throw Error('APK resource unavailable or too large');
    const h = new Binary(await this.read(e.offset, 30)); if (h.u32(0) !== 0x04034b50) throw Error('Invalid APK local entry');
    const at = e.offset + 30 + h.u16(26) + h.u16(28); if (at + e.compressed > this.size) throw Error('Invalid APK data bounds');
    const raw = await this.read(at, e.compressed); let result = raw;
    if (e.method === 8) {
      result = new Uint8Array(e.size); let written = 0;
      const inflate = new Inflate(chunk => { if (written + chunk.length > e.size) throw Error('APK decompression limit'); result.set(chunk, written); written += chunk.length; });
      for (let i = 0; i < raw.length; i += 256) inflate.push(raw.subarray(i, i + 256), i + 256 >= raw.length);
      if (written !== e.size) throw Error('APK resource truncated');
    }
    if (result.length !== e.size || crc32(result) !== e.crc) throw Error('APK resource checksum failed'); return result;
  }
}
function vectorImage(bytes: Uint8Array, resources?: ApkResources): Uint8Array | undefined {
  const root = xml(bytes).find(n => n.tag === 'vector'); if (!root) return;
  const resolved = (v?: Value) => resources?.value(v) || v;
  const number = (v: Value | undefined, fallback: number) => {
    const value = resolved(v); if (!value) return fallback;
    let result = NaN;
    if (value.type === 4) { const data = new DataView(new ArrayBuffer(4)); data.setUint32(0, value.data, true); result = data.getFloat32(0, true); }
    else if ([16, 17].includes(value.type)) result = value.data | 0;
    else if (value.type === 3 && /^[-+\d.eE]+$/.test(value.text || '')) result = Number(value.text);
    if (!Number.isFinite(result) || Math.abs(result) > 100000) throw Error('Unsupported vector number'); return result;
  };
  const color = (v?: Value) => { const value = resolved(v); if (!value) return { fill: 'none', alpha: 1 };
    if (value.type >= 28 && value.type <= 31) return { fill: '#' + (value.data & 0xffffff).toString(16).padStart(6, '0'), alpha: (value.data >>> 24) / 255 };
    throw Error('Unsupported vector color');
  };
  const width = number(root.attrs.viewportWidth, 0), height = number(root.attrs.viewportHeight, 0);
  if (width <= 0 || height <= 0) throw Error('Invalid vector viewport');
  const render = (node: XmlNode): string => {
    if (node.tag === 'group') { const a = node.attrs, px = number(a.pivotX, 0), py = number(a.pivotY, 0); return `<g transform="translate(${number(a.translateX, 0)} ${number(a.translateY, 0)}) translate(${px} ${py}) rotate(${number(a.rotation, 0)}) scale(${number(a.scaleX, 1)} ${number(a.scaleY, 1)}) translate(${-px} ${-py})">${node.children.map(render).join('')}</g>`; }
    if (node.tag !== 'path') throw Error('Unsupported vector shape');
    const a = node.attrs, path = resolved(a.pathData)?.text || '';
    if (!path || path.length > 65536 || !/^[MLHVCSQTAZmlhvcsqtaz\d\s.,+eE-]+$/.test(path) || number(a.trimPathStart, 0) !== 0 || number(a.trimPathEnd, 1) !== 1 || number(a.trimPathOffset, 0) !== 0) throw Error('Unsupported vector path');
    const fill = color(a.fillColor), stroke = color(a.strokeColor), alpha = (n: number) => Math.max(0, Math.min(1, n));
    return `<path d="${path}" fill="${fill.fill}" fill-opacity="${alpha(fill.alpha * number(a.fillAlpha, 1))}" fill-rule="${number(a.fillType, 0) === 1 ? 'evenodd' : 'nonzero'}" stroke="${stroke.fill}" stroke-opacity="${alpha(stroke.alpha * number(a.strokeAlpha, 1))}" stroke-width="${number(a.strokeWidth, 0)}" stroke-linecap="${['butt', 'round', 'square'][number(a.strokeLineCap, 0)] || 'butt'}" stroke-linejoin="${['miter', 'round', 'bevel'][number(a.strokeLineJoin, 0)] || 'miter'}"/>`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" opacity="${Math.max(0, Math.min(1, number(root.attrs.alpha, 1)))}">${root.children.map(render).join('')}</svg>`;
  return new TextEncoder().encode(svg);
}
export async function apkMetadata(archive: ApkArchive, packageName: string, language = 'en') {
  const manifest = apkManifest(await archive.file('AndroidManifest.xml', 524288));
  if (manifest.packageName !== packageName) throw Error('APK package identity changed');
  let resources: ApkResources | undefined;
  if (archive.entries.has('resources.arsc')) resources = new ApkResources(await archive.file('resources.arsc', 8388608), language);
  const label = (resources?.resolve(manifest.label)[0] || manifest.label?.text || '').trim().slice(0, 160);
  const candidates = resources?.resolve(manifest.icon) || [];
  for (const path of candidates.filter(p => p.endsWith('.xml')).slice(0, 2)) {
    try { candidates.push(...resources!.imagePaths(undefined, await archive.file(path, 131072))); } catch { /* A vector or split-only resource keeps its fallback. */ }
  }
  // Use an actual launcher raster, including variants preceding an adaptive icon.
  for (const path of candidates.filter(p => /\.(png|webp|jpe?g)$/i.test(p)).slice(0, 8)) {
    try { const bytes = await archive.file(path, 262144), b = new Binary(bytes);
      const mime = b.u32(0) === 0x474e5089 ? 'image/png' : b.u32(0) === 0x46464952 && new TextDecoder().decode(b.slice(8, 4)) === 'WEBP' ? 'image/webp' : b.u8(0) === 255 && b.u8(1) === 216 ? 'image/jpeg' : '';
      if (mime) return { label, image: { mime, bytes } };
    } catch { /* Try the next actual resource variant. */ }
  }
  for (const path of candidates.filter(p => p.endsWith('.xml')).slice(0, 6)) {
    try { const bytes = vectorImage(await archive.file(path, 131072), resources); if (bytes) return { label, image: { mime: 'image/svg+xml', bytes } }; } catch { /* Unsupported vectors retain the package fallback. */ }
  }
  return { label };
}
