import type { Command, Device, TvApp, Setting } from '../src/model.ts';
import { Store } from './store.ts';
import { TvSocket } from './socket.ts';
import { androidSerial, runTool, safeAppId } from './tools.ts';
import { tvFetch, decodeXml } from './network.ts';
const androidKeys: Record<Command, number> = { up: 19, down: 20, left: 21, right: 22, ok: 23, back: 4, home: 3, volumeUp: 24, volumeDown: 25, mute: 164, playPause: 85, powerOff: 223, settings: 176 };
const samsungKeys: Record<Command, string> = { up: 'KEY_UP', down: 'KEY_DOWN', left: 'KEY_LEFT', right: 'KEY_RIGHT', ok: 'KEY_ENTER', back: 'KEY_RETURN', home: 'KEY_HOME', volumeUp: 'KEY_VOLUP', volumeDown: 'KEY_VOLDOWN', mute: 'KEY_MUTE', playPause: 'KEY_PLAYPAUSE', powerOff: 'KEY_POWEROFF', settings: 'KEY_MENU' };
const rokuKeys: Partial<Record<Command, string>> = { up: 'Up', down: 'Down', left: 'Left', right: 'Right', ok: 'Select', back: 'Back', home: 'Home', volumeUp: 'VolumeUp', volumeDown: 'VolumeDown', mute: 'VolumeMute', playPause: 'Play', powerOff: 'PowerOff' };
const lgButtons: Partial<Record<Command, string>> = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', ok: 'ENTER', back: 'BACK', home: 'HOME', settings: 'MENU' };
const LG_PERMISSIONS = ['LAUNCH', 'CONTROL_AUDIO', 'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_POWER', 'CONTROL_INPUT_TEXT', 'CONTROL_MOUSE_AND_KEYBOARD', 'READ_INSTALLED_APPS', 'READ_INPUT_DEVICE_LIST', 'READ_APP_STATUS'];
export class Adapters {
  private sessions = new Map<string, TvSocket>();
  private pointers = new Map<string, TvSocket>();
  private opening = new Map<string, Promise<TvSocket>>();
  constructor(private store: Store, private execute = runTool, private makeSocket = (url: string) => new TvSocket(url)) {}
  close() { this.sessions.forEach(s => s.close()); this.pointers.forEach(s => s.close()); }
  private serial(d: Device) { return androidSerial(d.host, d.port); }
  private requirePaired(d: Device) { if (!d.paired) throw new Error('اقترن بالتلفزيون أولًا.'); }
  private async socket(d: Device, allowPrompt = false): Promise<TvSocket> {
    const active = this.sessions.get(d.id); if (active?.alive) return active;
    if (!allowPrompt) this.requirePaired(d);
    const existing = this.opening.get(d.id); if (existing) return existing;
    const pending = this.openSocket(d, allowPrompt).finally(() => this.opening.delete(d.id)); this.opening.set(d.id, pending); return pending;
  }
  private async openSocket(d: Device, allowPrompt: boolean) {
    const key = this.store.data.keys[d.id] || '';
    if (!allowPrompt && !key) throw new Error('تحتاج موافقة التلفزيون مرة واحدة.');
    const port = d.port || (d.platform === 'webos' ? 3001 : 8002);
    const url = d.platform === 'webos' ? `${port === 3000 ? 'ws' : 'wss'}://${d.host}:${port}` : `${port === 8001 ? 'ws' : 'wss'}://${d.host}:${port}/api/v2/channels/samsung.remote.control?name=${Buffer.from('Home Remote').toString('base64')}${key && key !== 'legacy' ? '&token=' + encodeURIComponent(key) : ''}`;
    const s = this.makeSocket(url);
    try {
      // Samsung can send its connect event in the same turn as the handshake.
      const samsungResponse = d.platform === 'tizen' ? s.wait(m => ['ms.channel.connect', 'ms.channel.unauthorized'].includes(m.event), allowPrompt ? 60000 : 8000) : undefined;
      samsungResponse?.catch(() => undefined);
      await s.open();
      let pairedKey = key;
      if (d.platform === 'webos') {
        const response = s.wait(m => m.type === 'registered' || (m.id === 'pair' && m.type === 'error'), allowPrompt ? 60000 : 8000);
        s.send({ id: 'pair', type: 'register', payload: { forcePairing: false, pairingType: 'PROMPT', 'client-key': key || undefined, manifest: { manifestVersion: 1, appVersion: '1.0', permissions: LG_PERMISSIONS } } });
        pairedKey = (await response).payload?.['client-key'];
        if (!pairedKey) throw new Error('لم يعط التلفزيون مفتاح الاقتران.');
      } else { const m = await samsungResponse!; pairedKey = m.data?.token || key || 'legacy'; }
      this.store.data.keys[d.id] = pairedKey; d.paired = true; this.store.save(); this.sessions.set(d.id, s);
      return s;
    } catch (error) { s.close(); throw error; }
  }
  async pair(d: Device, code?: string, pairPort?: number) {
    if (d.platform === 'webos' || d.platform === 'tizen') await this.socket(d, true);
    else if (d.platform === 'android') {
      if (code) {
        if (!/^\d{6}$/.test(code) || !pairPort) throw new Error('أدخل رمز الاقتران المكون من 6 أرقام ومنفذ الاقتران.');
        const output = await this.execute('adb', ['pair', `${d.host}:${pairPort}`, code], 25000);
        if (!/successfully paired/i.test(output)) throw new Error('لم يؤكد ADB نجاح الاقتران.');
      }
      await this.execute('adb', ['connect', this.serial(d)], 12000);
      if ((await this.execute('adb', ['-s', this.serial(d), 'get-state'])).trim() !== 'device') throw new Error('اسمح بالتصحيح على التلفزيون وأدخل منفذ الاتصال الصحيح.');
      d.paired = true;
    } else if (d.platform === 'roku') { await tvFetch(d.host, 8060, '/query/device-info'); d.paired = true; }
    else throw new Error('اختر نظام التلفزيون الصحيح أولًا.');
    d.seenAt = Date.now(); this.store.save();
  }
  async command(d: Device, command: Command) {
    this.requirePaired(d);
    if (!(command in androidKeys)) throw new Error('زر غير معروف.');
    if (d.platform === 'android') { await this.execute('adb', ['-s', this.serial(d), 'shell', 'input', 'keyevent', String(androidKeys[command])]); return; }
    if (d.platform === 'roku') { const key = rokuKeys[command]; if (!key) throw new Error('هذا الزر غير متاح.'); await tvFetch(d.host, 8060, '/keypress/' + key, { method: 'POST' }); return; }
    const s = await this.socket(d);
    if (d.platform === 'tizen') { s.send({ method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: samsungKeys[command], Option: 'false', TypeOfRemote: 'SendRemoteKey' } }); return; }
    const button = lgButtons[command];
    if (button) {
      let pointer = this.pointers.get(d.id);
      if (!pointer?.alive) {
        const result = await s.request('ssap://com.webos.service.networkinput/getPointerInputSocket');
        const url = new URL(String(result.socketPath));
        if (!['ws:', 'wss:'].includes(url.protocol) || url.hostname !== d.host) throw new Error('عنوان مؤشر غير صالح من التلفزيون.');
        pointer = this.makeSocket(url.href); await pointer.open(); this.pointers.set(d.id, pointer);
      }
      pointer.ws.send(`type:button\nname:${button}\n\n`); return;
    }
    const actions: Partial<Record<Command, string>> = { volumeUp: 'audio/volumeUp', volumeDown: 'audio/volumeDown', playPause: 'media.controls/pause', powerOff: 'system/turnOff' };
    if (command === 'mute') { const payload = await s.request('ssap://audio/getVolume'); const volume = payload.volumeStatus || payload; const muted = volume.muted ?? volume.mute; if (typeof muted !== 'boolean') throw new Error('لم يرجع التلفزيون حالة الكتم. حدّث الإعدادات وحاول مجددًا.'); await s.request('ssap://audio/setMute', { mute: !muted }); }
    else { const action = actions[command]; if (!action) throw new Error('زر غير متاح.'); await s.request('ssap://' + action); }
  }
  async apps(d: Device): Promise<TvApp[]> {
    this.requirePaired(d);
    if (d.platform === 'android') {
      const list = await this.execute('adb', ['-s', this.serial(d), 'shell', 'cmd', 'package', 'query-activities', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LEANBACK_LAUNCHER']);
      const ids = new Set(list.split(/\r?\n/).map(l => l.trim().split('/')[0]).filter(l => /^[\w]+(?:\.[\w]+)+$/.test(l)));
      if (!ids.size) throw new Error('الجهاز لم يعد قائمة تطبيقات التلفزيون. جرّب تحديث القائمة بعد الاقتران.');
      return [...ids].map(id => ({ id, label: id.split('.').slice(-2).join(' ') }));
    }
    if (d.platform === 'roku') {
      const payload = decodeXml<{ apps?: { app?: Record<string, string>[] | Record<string, string> } }>(await (await tvFetch(d.host, 8060, '/query/apps')).text());
      const list = payload.apps?.app; return (Array.isArray(list) ? list : list ? [list] : []).map(a => ({ id: String(a.id), label: String(a['#text'] || a.id), icon: `http://${d.host}:8060/query/icon/${encodeURIComponent(a.id)}` }));
    }
    const s = await this.socket(d);
    if (d.platform === 'tizen') {
      const response = s.wait(m => m.event === 'ed.installedApp.get');
      s.send({ method: 'ms.channel.emit', params: { event: 'ed.installedApp.get', to: 'host' } });
      const data = (await response).data;
      const apps = typeof data === 'string' ? JSON.parse(data).data : data?.data || data;
      if (!Array.isArray(apps)) throw new Error('موديل سامسونغ هذا لم يعد قائمة التطبيقات.');
      return apps.map(a => ({ id: String(a.appId || a.id), label: String(a.name || a.appId), icon: String(a.icon || '') }));
    }
    const payload = await s.request('ssap://com.webos.applicationManager/listLaunchPoints');
    if (!Array.isArray(payload.launchPoints)) throw new Error('لم يعد LG قائمة تطبيقات.');
    return payload.launchPoints.map(a => ({ id: String(a.id), label: String(a.title || a.id), icon: String(a.icon || '') }));
  }
  async launch(d: Device, appId: string) {
    this.requirePaired(d); safeAppId(appId);
    if (d.platform === 'android') { await this.execute('adb', ['-s', this.serial(d), 'shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LEANBACK_LAUNCHER', '1']); return; }
    if (d.platform === 'roku') { await tvFetch(d.host, 8060, '/launch/' + encodeURIComponent(appId), { method: 'POST' }); return; }
    const s = await this.socket(d);
    if (d.platform === 'webos') await s.request('ssap://system.launcher/launch', { id: appId });
    else s.send({ method: 'ms.channel.emit', params: { event: 'ed.apps.launch', to: 'host', data: { action_type: 'DEEP_LINK', appId, metaTag: '' } } });
  }
  async settings(d: Device): Promise<Setting[]> {
    this.requirePaired(d);
    const result: Setting[] = d.platform !== 'roku' ? [{ id: 'open', label: 'فتح إعدادات التلفزيون', kind: 'action' }] : [];
    if (d.platform === 'webos') {
      const s = await this.socket(d);
      const [volume, inputs] = await Promise.allSettled([s.request('ssap://audio/getVolume'), s.request('ssap://tv/getExternalInputList')]);
      if (volume.status === 'fulfilled') {
        const v = volume.value.volumeStatus || volume.value;
        if (typeof v.volume === 'number') result.push({ id: 'volume', label: 'مستوى الصوت', kind: 'number', value: v.volume, min: 0, max: 100 });
        if (typeof v.muted === 'boolean' || typeof v.mute === 'boolean') result.push({ id: 'mute', label: 'كتم الصوت', kind: 'boolean', value: v.muted ?? v.mute });
      }
      if (inputs.status === 'fulfilled' && Array.isArray(inputs.value.devices)) result.push({ id: 'input', label: 'مصدر العرض', kind: 'choice', options: inputs.value.devices.map(x => ({ id: String(x.id), label: String(x.label || x.id) })) });
    }
    if (d.platform === 'android') result.push({ id: 'developer', label: 'فتح خيارات المطوّر على التلفزيون', kind: 'action' });
    return result;
  }
  async setSetting(d: Device, id: string, value?: unknown) {
    this.requirePaired(d);
    if (id === 'open') return this.command(d, 'settings');
    if (d.platform === 'android' && id === 'developer') { await this.execute('adb', ['-s', this.serial(d), 'shell', 'am', 'start', '-a', 'android.settings.APPLICATION_DEVELOPMENT_SETTINGS']); return; }
    if (d.platform !== 'webos') throw new Error('هذه الإعدادات لا يتيحها نظام التلفزيون عن بعد.');
    const s = await this.socket(d);
    if (id === 'volume' && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100) return s.request('ssap://audio/setVolume', { volume: value });
    if (id === 'mute' && typeof value === 'boolean') return s.request('ssap://audio/setMute', { mute: value });
    if (id === 'input' && typeof value === 'string') { const inputs = await s.request('ssap://tv/getExternalInputList'); if (!inputs.devices?.some((x: { id: string }) => x.id === value)) throw new Error('المدخل غير موجود.'); return s.request('ssap://tv/switchInput', { inputId: value }); }
    throw new Error('قيمة إعداد غير صالحة.');
  }
}
