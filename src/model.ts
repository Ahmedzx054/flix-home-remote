export type Platform = 'webos' | 'tizen' | 'android' | 'roku' | 'unknown';
export type Command = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'home' | 'volumeUp' | 'volumeDown' | 'mute' | 'playPause' | 'powerOff' | 'settings' | 'channelUp' | 'channelDown' | 'rewind' | 'fastForward' | 'info' | 'exit' | 'play' | 'pause';
export interface Device {
  id: string; name: string; host: string; platform: Platform; model?: string;
  port?: number; pairPort?: number; developerTarget?: string; developerPort?: number; developerReady?: boolean; paired: boolean; seenAt: number;
}
export interface TvApp { id: string; label: string; icon?: string }
export interface TvActivity { available: boolean; appId?: string; label?: string; title?: string; state?: string; reason?: string; checkedAt: number }
export interface Setting { id: string; label: string; value?: string | number | boolean; kind: 'number' | 'boolean' | 'action' | 'choice'; min?: number; max?: number; options?: { id: string; label: string }[] }
export interface Capability { available: boolean; reason?: string }
export interface Capabilities {
  control: Capability; apps: Capability; settings: Capability; install: Capability;
  commands: Command[]; note: string; steps: string[]; docs: string;
}
export interface PackageEntry { id: string; appId: string; name: string; version: string; platform: Platform; filename: string; sha256: string; bytes: number; addedAt: number }
export interface InstallReceipt { id: string; deviceId: string; packageId: string; sha256: string; status: 'installing' | 'installed' | 'failed'; startedAt: number; endedAt?: number; message: string }
export const platformNames: Record<Platform, string> = { webos: 'LG · webOS', tizen: 'Samsung · Tizen', android: 'Android / Google TV', roku: 'Roku TV', unknown: 'نظام غير معروف' };
