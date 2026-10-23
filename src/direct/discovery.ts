import { XMLParser } from 'fast-xml-parser';
import type { Platform } from '../model.ts';
import { localHost, localUrl, from64, type Discovery } from './native.ts';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
/** Validate device-returned identity; an open port alone never identifies a television. */
export async function identifyTelevision(entry: Discovery, read: (url: string) => Promise<string>) {
  const host = localHost(entry.host);
  let name = entry.name || host, model = '', description = '';
  let platform: Platform = entry.platform === 'android' ? 'android' : 'unknown';
  const location = entry.location || entry.ssdp?.match(/^location:\s*(.+)$/im)?.[1]?.trim();
  if (location) {
    const url = localUrl(location, host);
    if (!['http:', 'https:'].includes(url.protocol)) throw Error('Invalid description URL');
    try { description = await read(url.href); } catch { /* A Bonjour/header identity can remain valid. */ }
    if (/<!DOCTYPE|<!ENTITY/i.test(description)) throw Error('Unsafe TV XML');
    if (description.trim().startsWith('{')) {
      const data = JSON.parse(description), device = data.device;
      // Samsung's /api/v2 response has an explicit device type and model.
      if (device && /samsung/i.test(JSON.stringify(device)) && /tv/i.test(String(device.type || device.modelName || ''))) {
        platform = 'tizen'; name = String(device.name || data.name || name); model = String(device.modelName || '');
      }
    } else if (description) {
      const data = parser.parse(description), device = data?.root?.device || data?.['device-info'];
      name = String(device?.friendlyName || device?.['friendly-device-name'] || device?.['user-device-name'] || name);
      model = String(device?.modelName || device?.['model-name'] || '');
    }
  }
  const identity = `${description} ${entry.ssdp || ''} ${entry.name || ''}`.toLowerCase();
  if (/webos|lg electronics|lge\.com/.test(identity)) platform = 'webos';
  else if (/samsung|tizen/.test(identity)) platform = 'tizen';
  else if (/roku/.test(identity)) platform = 'roku';
  else if (/android|google\s*tv|googlecast|chromecast/.test(identity)) platform = 'android';
  return platform === 'unknown' ? undefined : { host, name: name.slice(0, 100), model: model.slice(0, 100), platform };
}
export const decodeDescription = (data: string) => new TextDecoder().decode(from64(data));
