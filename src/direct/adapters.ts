import type { Command, Device, TvApp, Setting, TvActivity } from '../model.ts';
import { androidActivity } from './activity.ts';
import type { DirectStore as Store } from './engine.ts';
import { TvSocket } from './socket.ts';
import { executeAndroid as runTool } from './adb.ts';
import { androidAppMetadata, clearAndroidAppMetadata } from './android-apps.ts';
import {inFlix,navigateExpression,textExpression,historyExpression} from './flix-debug.ts';
import {BLUETOOTH_ADDRESS,BLUETOOTH_OPS,bluetoothExpression,bluetoothListing,bluetoothMessage} from '../remote-page/bluetooth-rules.js';
import { PICTURE_KEYS, SOUND_KEYS, SOUND_MODES, readCategory, writeCategory, describePicture, presetSettings, luminanceSettings, modeValue } from '../remote-page/picture-rules.js';
const androidSerial=(host: string,port=5555)=>`${host}:${port}`;
export function safeAppId(id: string){if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(id))throw new Error('معرف تطبيق غير صالح.');}
import { tvFetch } from './native.ts';
import { XMLParser } from 'fast-xml-parser';
const decodeXml=<T>(value: string):T=>{if(/<!DOCTYPE|<!ENTITY/i.test(value))throw new Error('Invalid TV XML');return new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',isArray:(tag)=>tag==='app'}).parse(value) as T;};
const androidKeys: Record<Command, number> = { up: 19, down: 20, left: 21, right: 22, ok: 23, back: 4, home: 3, volumeUp: 24, volumeDown: 25, mute: 164, playPause: 85, powerOff: 223, settings: 176, channelUp:166,channelDown:167,rewind:89,fastForward:90,info:165,exit:4,play:126,pause:127 };
const androidSettings:Record<string,{action:string;label:string}>={network:{action:'WIFI_SETTINGS',label:'إعدادات Wi-Fi'},bluetooth:{action:'BLUETOOTH_SETTINGS',label:'إعدادات Bluetooth'},display:{action:'DISPLAY_SETTINGS',label:'إعدادات العرض'},sound:{action:'SOUND_SETTINGS',label:'إعدادات الصوت'},applications:{action:'MANAGE_APPLICATIONS_SETTINGS',label:'إدارة التطبيقات'},developer:{action:'APPLICATION_DEVELOPMENT_SETTINGS',label:'خيارات المطوّر'}};
const samsungKeys: Record<Command, string> = { up: 'KEY_UP', down: 'KEY_DOWN', left: 'KEY_LEFT', right: 'KEY_RIGHT', ok: 'KEY_ENTER', back: 'KEY_RETURN', home: 'KEY_HOME', volumeUp: 'KEY_VOLUP', volumeDown: 'KEY_VOLDOWN', mute: 'KEY_MUTE', playPause: 'KEY_PLAYPAUSE', powerOff: 'KEY_POWEROFF', settings: 'KEY_MENU',channelUp:'KEY_CHUP',channelDown:'KEY_CHDOWN',rewind:'KEY_REWIND',fastForward:'KEY_FF',info:'KEY_INFO',exit:'KEY_EXIT',play:'KEY_PLAY',pause:'KEY_PAUSE' };
const rokuKeys: Partial<Record<Command, string>> = { up: 'Up', down: 'Down', left: 'Left', right: 'Right', ok: 'Select', back: 'Back', home: 'Home', volumeUp: 'VolumeUp', volumeDown: 'VolumeDown', mute: 'VolumeMute', playPause: 'Play', powerOff: 'PowerOff',rewind:'Rev',fastForward:'Fwd',info:'Info',exit:'Back' };
const lgButtons: Partial<Record<Command, string>> = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', ok: 'ENTER', back: 'BACK', home: 'HOME', settings: 'MENU',channelUp:'CHANNELUP',channelDown:'CHANNELDOWN',info:'INFO',exit:'EXIT',playPause:'PLAY' };
const LG_PERMISSIONS = ['LAUNCH', 'CONTROL_AUDIO', 'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_POWER', 'CONTROL_INPUT_TEXT', 'CONTROL_MOUSE_AND_KEYBOARD', 'READ_INSTALLED_APPS', 'READ_INPUT_DEVICE_LIST', 'READ_APP_STATUS', 'READ_SETTINGS', 'WRITE_NOTIFICATION_ALERT'];
export class Adapters {
  private sessions = new Map<string, TvSocket>();
  private pointers = new Map<string, TvSocket>();
  private opening = new Map<string, Promise<TvSocket>>();
  private bluetoothBusy=new Set<string>();
  constructor(private store: Store, private execute = runTool, private makeSocket = (url: string) => new TvSocket(url)) {}
  close() { this.sessions.forEach(s => s.close()); this.pointers.forEach(s => s.close()); clearAndroidAppMetadata(); }
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
    const url = d.platform === 'webos' ? `${port === 3000 ? 'ws' : 'wss'}://${d.host}:${port}` : `${port === 8001 ? 'ws' : 'wss'}://${d.host}:${port}/api/v2/channels/samsung.remote.control?name=${btoa('FLIX Home Remote')}${key && key !== 'legacy' ? '&token=' + encodeURIComponent(key) : ''}`;
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
      this.store.data.keys[d.id] = pairedKey; d.paired = true; await this.store.save(); this.sessions.set(d.id, s);
      return s;
    } catch (error) { s.close(); throw error; }
  }
  async pair(d: Device, code?: string, pairPort?: number) {
    if(d.platform==='webos'){this.sessions.get(d.id)?.close();this.sessions.delete(d.id);this.pointers.get(d.id)?.close();this.pointers.delete(d.id);}
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
    d.seenAt = Date.now(); await this.store.save();
  }
  async command(d: Device, command: Command) {
    this.requirePaired(d);
    if (!(command in androidKeys)) throw new Error('زر غير معروف.');
    if (d.platform === 'android') { await this.execute('adb', ['-s', this.serial(d), 'shell', 'input', 'keyevent', String(androidKeys[command])]); return; }
    if (d.platform === 'roku') { const key = rokuKeys[command]; if (!key) throw new Error('هذا الزر غير متاح.'); await tvFetch(d.host, 8060, '/keypress/' + key, { method: 'POST' }); return; }
    const s = await this.socket(d);
    if (d.platform === 'tizen') { await s.write(JSON.stringify({ method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: samsungKeys[command], Option: 'false', TypeOfRemote: 'SendRemoteKey' } })); return; }
    const button = lgButtons[command];
    if (button) {
      let pointer = this.pointers.get(d.id);
      if (!pointer?.alive) {
        const result = await s.request('ssap://com.webos.service.networkinput/getPointerInputSocket');
        const url = new URL(String(result.socketPath));
        if (!['ws:', 'wss:'].includes(url.protocol) || url.hostname !== d.host) throw new Error('عنوان مؤشر غير صالح من التلفزيون.');
        pointer = this.makeSocket(url.href); await pointer.open(); this.pointers.set(d.id, pointer);
      }
      await pointer.write(`type:button\nname:${button}\n\n`); return;
    }
    const actions: Partial<Record<Command, string>> = { volumeUp: 'audio/volumeUp', volumeDown: 'audio/volumeDown', playPause: 'media.controls/pause', powerOff: 'system/turnOff',play:'media.controls/play',pause:'media.controls/pause',rewind:'media.controls/rewind',fastForward:'media.controls/fastForward' };
    if (command === 'mute') { const payload = await s.request('ssap://audio/getVolume'); const volume = payload.volumeStatus || payload; const muted = volume.muted ?? volume.mute; if (typeof muted !== 'boolean') throw new Error('لم يرجع التلفزيون حالة الكتم. حدّث الإعدادات وحاول مجددًا.'); await s.request('ssap://audio/setMute', { mute: !muted }); }
    else { const action = actions[command]; if (!action) throw new Error('زر غير متاح.'); await s.request('ssap://' + action); }
  }
  /** The original remote page talks to this bounded operation set, directly on the phone. */
  async pageOperation(d: Device, operation: string, data: Record<string, any>) {
    this.requirePaired(d);
    if(operation==='connection'){
      if(d.platform==='android')await this.execute('adb',['-s',this.serial(d),'get-state']);
      else if(d.platform==='roku')await tvFetch(d.host,8060,'/query/device-info');
      else {const socket=await this.socket(d);if(d.platform==='webos')await socket.request('ssap://audio/getVolume');}
      return {connected:true};
    }
    if(operation==='history')return {entries:await inFlix(d,historyExpression(String(data.id||'')))};
    if(operation==='bluetooth'){
      if(d.platform!=='webos')throw Error('البروتوكول لا يكشف أجهزة Bluetooth. افتح إعدادات Bluetooth على التلفزيون.');
      const op=String(data.op||'status'),address=String(data.address||'').toLowerCase();
      if(!BLUETOOTH_OPS.includes(op)||(['connect','disconnect','remove'].includes(op)&&!BLUETOOTH_ADDRESS.test(address)))throw Error('طلب Bluetooth غير صالح.');
      if(this.bluetoothBusy.has(d.id))throw Error('عملية Bluetooth أخرى جارية على هذا التلفزيون.');
      this.bluetoothBusy.add(d.id);
      try{
        if(address){const state=await inFlix(d,bluetoothExpression('status'),undefined,true);if(!state?.ok||!bluetoothListing(state.devices).some(x=>x.address===address))throw Error('الجهاز غير موجود في قائمة أجهزة الصوت المتاحة؛ لا يسمح بحذف ريموت التلفزيون.');}
        let expression=bluetoothExpression(op,address,25000);
        // The TV owns the stop timer, so the scan ends even if iOS suspends the phone.
        if(op==='scan')expression=`Promise.resolve(${expression}).then(function(r){setTimeout(function(){var b=new PalmServiceBridge();b.onservicecallback=function(){b.cancel();};b.call('luna://com.webos.service.bluetooth2/adapter/cancelDiscovery','{}');},30000);return r;})`;
        const result=await inFlix(d,expression,undefined,true,op==='connect'?80000:45000);
        if(!result?.ok)throw Error(bluetoothMessage(result?.error));
        const state=op==='status'?result:await inFlix(d,bluetoothExpression('status'),undefined,true);
        if(!state?.ok)throw Error(bluetoothMessage(state?.error));
        return {name:state.adapter?.name||'',powered:state.adapter?.powered!==false,scanning:!!state.adapter?.discovering,devices:bluetoothListing(state.devices)};
      }finally{this.bluetoothBusy.delete(d.id);}
    }
    if(operation==='inputs') { const all=await this.settings(d);return {inputs:all.find(x=>x.id==='input')?.options||[]}; }
    if(operation==='input') return this.setSetting(d,'input',String(data.id));
    if(operation==='type') {
      if(data.set!==undefined){try{return await inFlix(d,textExpression(String(data.set),true));}catch{return {ok:false,via:'no-page',message:'تُرسل فروق النص إلى خانة التلفزيون المفتوحة.'};}}
      if(data.action==='enter'){await this.command(d,'ok');return {via:'sent'};}
      const text=String(data.text||'');if(text.length>2000||text.includes('\0'))throw Error('النص أطول من المسموح.');
      if(data.action==='backspace') {
        if(d.platform==='webos')return (await this.socket(d)).request('ssap://com.webos.service.ime/deleteCharacters',{count:1});
        if(d.platform==='android')return this.execute('adb',['-s',this.serial(d),'shell','input','keyevent','67']);
        if(d.platform==='roku')return tvFetch(d.host,8060,'/keypress/Backspace',{method:'POST'});
      }
      if(d.platform==='webos'){await (await this.socket(d)).request('ssap://com.webos.service.ime/insertText',{text,replace:data.replace===true});return {via:'sent'};}
      if(d.platform==='android') { if(/[^\x20-\x7e]/.test(text))throw Error('لوحة Android الحالية تقبل النص اللاتيني؛ استخدم لوحة مفاتيح التلفزيون للنص العربي.');return this.execute('adb',['-s',this.serial(d),'shell','input','text',text.replace(/ /g,'%s')]); }
      if(d.platform==='roku') {for(const character of text)await tvFetch(d.host,8060,'/keypress/Lit_'+encodeURIComponent(character),{method:'POST'});return;}
      throw Error('موديل Samsung هذا لا يتيح إدخال النص عبر قناة الأزرار؛ استخدم لوحة التلفزيون.');
    }
    if(operation==='click'&&d.platform!=='webos') {for(let i=0;i<Math.min(2,Math.max(1,Number(data.times)||1));i++)await this.command(d,'ok');return;}
    if(operation==='move'||operation==='scroll'||operation==='click') {
      const dx=Number(data.dx||0),dy=Number(data.dy||0);if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>2000||Math.abs(dy)>2000)throw Error('حركة غير صالحة.');
      if(d.platform!=='webos') {if(operation==='scroll'&&(dx||dy))return this.command(d,Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'up':'down');throw Error('هذا التلفزيون يتيح التنقل بالأسهم؛ حركة المؤشر الحر غير متاحة في بروتوكوله.');}
      let pointer=this.pointers.get(d.id);
      if(!pointer?.alive) {const p=await (await this.socket(d)).request('ssap://com.webos.service.networkinput/getPointerInputSocket');const u=new URL(String(p.socketPath));if(!['ws:','wss:'].includes(u.protocol)||u.hostname!==d.host)throw Error('عنوان مؤشر غير صالح.');pointer=this.makeSocket(u.href);await pointer.open();this.pointers.set(d.id,pointer);}
      if(operation==='click'){for(let i=0;i<Math.min(2,Math.max(1,Number(data.times)||1));i++)await pointer.write('type:click\n\n');return;}
      return pointer.write(operation==='move'?`type:move\ndx:${Math.round(dx)}\ndy:${Math.round(dy)}\ndown:${data.drag===true?1:0}\n\n`:`type:scroll\ndx:${Math.round(dx)}\ndy:${Math.round(dy)}\n\n`);
    }
    if(operation==='open-in-app') {
      safeAppId(String(data.app));let path=String(data.path||'');navigateExpression(path);
      if(d.platform!=='webos')throw Error('فتح التطبيق متاح؛ فتح محتوى فلكس داخله يحتاج قناة روابط يدعمها إصدار التلفزيون.');
      if(!String(data.app).startsWith('com.netflixfree.'))throw Error('فتح المحتوى مخصص لتطبيقات فلكس.');
      const front=await this.activity(d);if(front.appId!==data.app){await this.launch(d,data.app);throw Error('فُتح التطبيق المطلوب؛ انتظر اكتمال فتحه ثم اختر المحتوى مرة ثانية.');}
      if(data.play===true){if(/^\/movie\/\d+$/.test(path))path+='/watch';else if(/^\/tv\/\d+$/.test(path)){const id=path.split('/')[2];const entries=await inFlix(d,historyExpression(id),data.app);const last=entries?.[0];path+='/watch?s='+(last?.season||1)+'&e='+(last?.episode||1);}}
      return inFlix(d,navigateExpression(path),data.app);
    }
    if(operation==='sound'||operation==='picture') {
      if(d.platform!=='webos')return {ok:false,lg:false,message:'البروتوكول لا يعيد هذه القيم؛ افتح الإعدادات على التلفزيون.'};
      const socket=await this.socket(d),call=(_:unknown,uri:string,params?:unknown)=>socket.request(uri,params);
      if(operation==='picture'){
        const current=await readCategory(call,socket,'picture',PICTURE_KEYS);if(!Object.keys(current).length)throw Error('التلفزيون لم يعد إعدادات الصورة. اطلب إذن الإعدادات من هذه النافذة.');
        let write:Record<string,string|number|boolean>|null=null;
        if(data.preset)write=presetSettings(String(data.preset),current);
        else if(data.luminance!==undefined)write=luminanceSettings(data.luminance,current);
        else if(data.mode){const value=modeValue(String(data.mode),current.pictureMode);if(!value)throw Error('وضع غير مناسب لنوع الفيديو الحالي.');write={pictureMode:value};}
        else if(data.eyeComfort!==undefined)write={eyeComfortMode:data.eyeComfort?'on':'off'};
        else if(data.fixBlack)write={brightness:'50'};
        if(write){
          // Only values actually returned by this TV can be written and verified.
          write=Object.fromEntries(Object.entries(write).filter(([key])=>current[key]!==undefined));
          if(!Object.keys(write).length)throw Error('التلفزيون لا يكشف هذه الإعدادات للتحقق منها. افتح صفحة الصورة عليه.');
          await writeCategory(call,socket,'picture',write);
          const after=await readCategory(call,socket,'picture',PICTURE_KEYS);
          const missed=Object.entries(write).filter(([key,value])=>String(after[key])!==String(value)).map(([key])=>key);
          if(missed.length)throw Error('التلفزيون لم يؤكد تعديل: '+missed.join(', '));
          return {lg:true,paired:true,picture:describePicture(after),wrote:write,missed:[]};
        }
        return {lg:true,paired:true,picture:describePicture(current)};
      }
      if(data.volume!==undefined)await this.setSetting(d,'volume',Number(data.volume));
      if(data.step!==undefined){const r=await socket.request('ssap://audio/getVolume'),v=Number((r.volumeStatus||r).volume);if(!Number.isFinite(v))throw Error('لم يعد التلفزيون مستوى الصوت.');await this.setSetting(d,'volume',Math.max(0,Math.min(100,v+Number(data.step))));}
      if(data.mute!==undefined)await this.setSetting(d,'mute',data.mute);
      if(data.output){if(!/^[a-z_]{3,40}$/.test(String(data.output)))throw Error('مخرج غير صالح.');await socket.request('ssap://audio/changeSoundOutput',{output:data.output});}
      const before=await readCategory(call,socket,'sound',SOUND_KEYS).catch(()=>({} as Record<string,string|number|boolean>));
      const write:Record<string,string>={};
      if(data.soundMode!==undefined){if(!SOUND_MODES.some(m=>m.value===data.soundMode)||before.soundMode===undefined)throw Error('نمط غير متاح من هذا التلفزيون.');write.soundMode=String(data.soundMode);}
      if(data.autoVolume!==undefined){if(before.autoVolume===undefined)throw Error('التلفزيون لا يكشف توازن الصوت.');write.autoVolume=data.autoVolume?'on':'off';}
      if(Object.keys(write).length)await writeCategory(call,socket,'sound',write);
      const sound=Object.keys(write).length?await readCategory(call,socket,'sound',SOUND_KEYS):before;
      if(Object.entries(write).some(([k,v])=>String(sound[k])!==v))throw Error('التلفزيون لم يؤكد تعديل نمط الصوت.');
      const v=await socket.request('ssap://audio/getVolume'),volume=v.volumeStatus||v;
      const out=await socket.request('ssap://audio/getSoundOutput').catch(()=>({}));
      if(data.output&&out.soundOutput!==data.output)throw Error('لم يؤكد التلفزيون اختيار مخرج الصوت.');
      return {lg:true,volume:volume.volume,muted:volume.muted??volume.mute,output:out.soundOutput||'',paired:!!Object.keys(sound).length,soundMode:sound.soundMode,autoVolume:sound.autoVolume==='on',modes:sound.soundMode===undefined?[]:SOUND_MODES};
    }
    throw Error('هذه الوظيفة تحتاج إذنًا أو واجهة إضافية من التلفزيون؛ افتح إعداداته أو أرسل التشخيص للدعم.');
  }
  async apps(d: Device): Promise<TvApp[]> {
    this.requirePaired(d);
    if (d.platform === 'android') {
      const list = await this.execute('adb', ['-s', this.serial(d), 'shell', 'cmd', 'package', 'query-activities', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LEANBACK_LAUNCHER']);
      const ids = new Set(list.split(/\r?\n/).map(l => l.trim().split('/')[0]).filter(l => /^[\w]+(?:\.[\w]+)+$/.test(l)));
      if (!ids.size) throw new Error('الجهاز لم يعد قائمة تطبيقات التلفزيون. جرّب تحديث القائمة بعد الاقتران.');
      return [...ids].map(id => ({ id, label: id }));
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
      return apps.map((a: any) => ({ id: String(a.appId || a.id), label: String(a.name || a.appId), icon: String(a.icon || '') }));
    }
    const payload = await s.request('ssap://com.webos.applicationManager/listLaunchPoints');
    if (!Array.isArray(payload.launchPoints)) throw new Error('لم يعد LG قائمة تطبيقات.');
    return payload.launchPoints.map((a: any) => ({ id: String(a.id), label: String(a.title || a.id), icon: String(a.icon || '') }));
  }
  async activity(d: Device): Promise<TvActivity> {
    this.requirePaired(d);
    if(d.platform==='android'){
      const foreground=await this.execute('adb',['-s',this.serial(d),'shell','dumpsys','window','windows'],12000);
      const media=await this.execute('adb',['-s',this.serial(d),'shell','dumpsys','media_session'],12000).catch(()=> '');
      return androidActivity(foreground,media);
    }
    if(d.platform==='webos'){
      const payload=await (await this.socket(d)).request('ssap://com.webos.applicationManager/getForegroundAppInfo');
      return {available:!!payload.appId,appId:String(payload.appId||'').slice(0,200),reason:'يعرض التطبيق النشط؛ عنوان المحتوى غير متاح عبر هذا المسار.',checkedAt:Date.now()};
    }
    if(d.platform==='roku'){
      const active=decodeXml<any>(await (await tvFetch(d.host,8060,'/query/active-app')).text())?.['active-app']?.app;
      const app=Array.isArray(active)?active[0]:active;
      let state='';try{state=String(decodeXml<any>(await (await tvFetch(d.host,8060,'/query/media-player')).text())?.player?.state||'');}catch{/* The active app may still be available. */}
      return {available:!!app,appId:String(app?.id||'').slice(0,200),label:String(app?.['#text']||'').slice(0,200),state,reason:'عنوان المحتوى غير متاح عبر هذا المسار.',checkedAt:Date.now()};
    }
    return {available:false,reason:'مسار التحكم لهذا الموديل لا يكشف التطبيق أو المحتوى الظاهر؛ لا نخمنه من آخر أمر.',checkedAt:Date.now()};
  }
  async appMetadata(d: Device, appId: string): Promise<TvApp> {
    this.requirePaired(d); safeAppId(appId);
    if (d.platform !== 'android' || !(await this.apps(d)).some(app => app.id === appId)) throw Error('التطبيق غير موجود في قائمة التلفزيون.');
    return androidAppMetadata(this.serial(d), appId, args => this.execute('adb', ['-s', this.serial(d), 'shell', ...args], 30000));
  }
  async launch(d: Device, appId: string) {
    this.requirePaired(d); safeAppId(appId);
    if (d.platform === 'android') { await this.execute('adb', ['-s', this.serial(d), 'shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LEANBACK_LAUNCHER', '1']); return; }
    if (d.platform === 'roku') { await tvFetch(d.host, 8060, '/launch/' + encodeURIComponent(appId), { method: 'POST' }); return; }
    const s = await this.socket(d);
    if (d.platform === 'webos') await s.request('ssap://system.launcher/launch', { id: appId });
    else await s.write(JSON.stringify({ method: 'ms.channel.emit', params: { event: 'ed.apps.launch', to: 'host', data: { action_type: 'DEEP_LINK', appId, metaTag: '' } } }));
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
      if (inputs.status === 'fulfilled' && Array.isArray(inputs.value.devices)) result.push({ id: 'input', label: 'مصدر العرض', kind: 'choice', options: inputs.value.devices.map((x: any) => ({ id: String(x.id), label: String(x.label || x.id) })) });
    }
    if(d.platform==='android'){
      // Resolve the TV's actual activities in one read-only request. OEM menus differ.
      const script=Object.entries(androidSettings).map(([id,s])=>`echo FLIX_SETTING_${id}; cmd package resolve-activity --brief -a android.settings.${s.action}`).join('; ');
      const output=await this.execute('adb',['-s',this.serial(d),'shell','sh','-c',script]);
      for(const section of output.split('FLIX_SETTING_').slice(1)){const [id,...lines]=section.trim().split(/\r?\n/);if(androidSettings[id]&&lines.some(line=>/^[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+$/.test(line.trim())))result.push({id,label:androidSettings[id].label,kind:'action'});}
    }
    return result;
  }
  async setSetting(d: Device, id: string, value?: unknown) {
    this.requirePaired(d);
    if (id === 'open') return this.command(d, 'settings');
    if(d.platform==='android'&&androidSettings[id]){if(!(await this.settings(d)).some(s=>s.id===id))throw new Error('هذا التلفزيون لا يتيح صفحة الإعداد المطلوبة.');const out=await this.execute('adb',['-s',this.serial(d),'shell','am','start','-a','android.settings.'+androidSettings[id].action]);if(/Error:|Exception|unable to resolve/i.test(out))throw new Error(out.slice(0,500));return;}
    if (d.platform !== 'webos') throw new Error('هذه الإعدادات لا يتيحها نظام التلفزيون عن بعد.');
    const s = await this.socket(d);
    if (id === 'volume' && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100) return s.request('ssap://audio/setVolume', { volume: value });
    if (id === 'mute' && typeof value === 'boolean') return s.request('ssap://audio/setMute', { mute: value });
    if (id === 'input' && typeof value === 'string') { const inputs = await s.request('ssap://tv/getExternalInputList'); if (!inputs.devices?.some((x: { id: string }) => x.id === value)) throw new Error('المدخل غير موجود.'); return s.request('ssap://tv/switchInput', { inputId: value }); }
    throw new Error('قيمة إعداد غير صالحة.');
  }
}
