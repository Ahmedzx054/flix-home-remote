import os from 'node:os';
import net from 'node:net';
import { XMLParser } from 'fast-xml-parser';
export const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', processEntities: false });
export function isLanHost(value: string) {
  if (net.isIP(value) !== 4) return false;
  const [a, b] = value.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
export function assertLanHost(value: unknown): asserts value is string { if (typeof value !== 'string' || !isLanHost(value)) throw new Error('استخدم عنوان IPv4 محليًا للتلفزيون.'); }
export function localAddresses() { return Object.values(os.networkInterfaces()).flatMap(xs => xs ?? []).filter(x => x.family === 'IPv4' && !x.internal && isLanHost(x.address)).map(x => x.address); }
export function portValue(value: unknown, fallback: number) { const n = value === undefined ? fallback : Number(value); if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error('منفذ غير صالح.'); return n; }
export async function tvFetch(host: string, port: number, route: string, init: RequestInit = {}) {
  assertLanHost(host);
  const response = await fetch(`http://${host}:${port}${route}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`التلفزيون رفض الطلب (${response.status}).`);
  return response;
}
export function decodeXml<T>(source: string): T { if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('وصف جهاز غير صالح.'); return xml.parse(source) as T; }
