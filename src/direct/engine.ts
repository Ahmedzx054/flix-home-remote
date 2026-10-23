import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { validateWgt } from './package-format.ts';
import { XMLParser } from 'fast-xml-parser';
import type { Device, Capabilities, Command, PackageEntry, InstallReceipt, Platform } from '../model.ts';
import { Lan, requireNative, localHost, localUrl, from64 } from './native.ts';
import {prepareWebos,installWebos} from './webos-install.ts';
import {probeSdb,installTizen} from './sdb.ts';
import { Adapters,safeAppId } from './adapters.ts';
import { getSecrets, loadSecrets, saveSecrets, installApk, closeAndroid } from './adb.ts';
export interface DirectStore { data: { devices: Device[]; keys: Record<string,string>; packages: PackageEntry[]; receipts: InstallReceipt[] }; save(): Promise<void> }
const platforms: Platform[]=['webos','tizen','android','roku','unknown'];
export const directStore: DirectStore={data:{devices:[],keys:{},packages:[],receipts:[]},async save(){await saveSecrets();await Preferences.set({key:'direct-tv-library',value:JSON.stringify({...this.data,keys:undefined})});}};
const adapters=new Adapters(directStore);let initialized=false,activeDevice='';const installing=new Set<string>();
export async function initDirect() {requireNative();if(initialized)return;await loadSecrets();const {value}=await Preferences.get({key:'direct-tv-library'});if(value){const saved=JSON.parse(value);directStore.data.devices=Array.isArray(saved.devices)?saved.devices:[];directStore.data.packages=saved.packages||[];directStore.data.receipts=saved.receipts||[];}directStore.data.keys=getSecrets();for(const r of directStore.data.receipts)if(r.status==='installing'){r.status='failed';r.message='انقطع التطبيق قبل تأكيد التثبيت. تحقّق من التلفزيون قبل إعادة المحاولة.';r.endedAt=Date.now();}initialized=true;}
export function capabilities(d: Device): Capabilities {
  const known=d.platform!=='unknown', paired=known&&d.paired;
  const commands: Command[]=d.platform==='roku'?['up','down','left','right','ok','back','home','volumeUp','volumeDown','mute','playPause','powerOff']:['up','down','left','right','ok','back','home','volumeUp','volumeDown','mute','playPause','powerOff','settings'];
  const guides: Record<Platform,{steps:string[];docs:string}>={
    webos:{steps:['الهاتف يتصل مباشرة بالتلفزيون؛ اسمح بإذن الشبكة المحلية.','فعّل LG Connect Apps / Mobile TV On إن كان موجودًا، ووافق على الاقتران على الشاشة.','التحكم وقراءة التطبيقات لا يتطلبان وضع المطوّر.','تثبيت IPK مخصص يتطلب وضع المطوّر وطريقة نشر يدعمها الموديل؛ جهّز Developer Mode وKey Server، وأدخل Passphrase في مكتبة التطبيقات؛ ينقل الهاتف IPK عبر SSH مباشرة.'],docs:'https://webostv.developer.lge.com/develop/getting-started/developer-mode-app'},
    tizen:{steps:['اسمح بالتحكم عن بعد من مدير اتصال الأجهزة على التلفزيون.','وافق على طلب FLIX Home Remote على الشاشة.','قد لا يُرجع بعض موديلات Samsung قائمة التطبيقات.','تثبيت WGT يتطلب شهادة وتفويض جهاز؛ فعّل Developer Mode من Apps، وأدخل عنوان الهاتف المسموح، ثم جهّز اتصال SDB من المكتبة.'],docs:'https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html'},
    android:{steps:['افتح حول الجهاز واضغط رقم الإصدار لتفعيل خيارات المطوّر وفق تعليمات الشركة.','إذا أتاح التلفزيون تصحيح الشبكة TCP، فعّله وأدخل منفذه (غالبًا 5555)، ثم وافق على مفتاح هذا الهاتف.','اتصال ADB المباشر يتيح الأزرار وقائمة تطبيقات التلفزيون وفتح الإعدادات وتثبيت APK.','لـWireless Debugging في Android 11+ افتح الاقتران برمز وأدخل الرمز ومنفذ الاقتران ومنفذ الاتصال، وهما مختلفان. لا يمكن تفعيله أو تجاوز موافقة التلفزيون من الهاتف.'],docs:'https://developer.android.com/tools/adb#wireless'},
    roku:{steps:['اسمح بالتحكم من تطبيقات الهاتف في إعدادات الشبكة في Roku.','الهاتف يتصل مباشرة بمنفذ 8060؛ قد تمنع بعض الإصدارات أو إعدادات الأمان ECP.','Roku لا يشغّل APK أو IPK أو WGT.'],docs:'https://developer.roku.com/docs/developer-program/dev-tools/external-control-api.md'},
    unknown:{steps:['تحقق من نظام التلفزيون من صفحة حول الجهاز. اسم TCL وحده لا يحدد النظام.','أدخل عنوان التلفزيون واختر نظامه الصحيح.'],docs:''},
  };
  const reason=!paired?'يلزم الاقتران أولًا.':d.platform==='android'?'':d.platform==='webos'||d.platform==='tizen'?'جهّز اتصال المطوّر من مكتبة التطبيقات.':'تثبيت الحزم غير مدعوم لهذا النظام.';
  return {control:{available:paired},apps:{available:paired},settings:{available:paired&&d.platform!=='roku'},install:{available:paired&&(d.platform==='android'||(d.platform==='webos'&&!!getSecrets()['ssh:'+d.id])||(d.platform==='tizen'&&!!d.developerReady)),reason},commands:paired?commands:[],note:'اتصال مباشر من الهاتف إلى التلفزيون عبر Wi-Fi. تظهر الوظائف التي يتيحها نظامه؛ نجاح إرسال الأمر لا يثبت نتيجة الشاشة.',...guides[d.platform]};
}
function publicDevices() {return directStore.data.devices.map(d=>({...d,capabilities:capabilities(d)}));}
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:''});
export async function scanDirect() {
  requireNative();const reply=await Lan.discover();const seen=new Set<string>(),deadline=Date.now()+12000;
  for(const entry of [...reply.devices].sort((a,b)=>Number(b.service?.includes('adb-tls-connect')||false)-Number(a.service?.includes('adb-tls-connect')||false)).slice(0,100)){
    if(Date.now()>deadline)break;
    try{
      const host=localHost(entry.host);if(seen.has(host))continue;seen.add(host);let name=entry.name||host,model='',platform:Platform=entry.platform==='android'?'android':'unknown';
      const location=entry.ssdp?.match(/^location:\s*(.+)$/im)?.[1]?.trim();let description='';
      if(location){const url=localUrl(location,host);if(!['http:','https:'].includes(url.protocol))continue;const r=await Lan.http({url:url.href,limit:131072});description=new TextDecoder().decode(from64(r.data));if(/<!DOCTYPE|<!ENTITY/i.test(description))continue;const device=parser.parse(description)?.root?.device;name=String(device?.friendlyName||name);model=String(device?.modelName||'');}
      const text=(description+' '+entry.ssdp+' '+entry.name).toLowerCase();
      if(/webos|lg electronics|lge.com/.test(text))platform='webos';else if(/samsung|tizen/.test(text))platform='tizen';else if(/roku/.test(text))platform='roku';else if(/android|google|chromecast/.test(text))platform='android';
      if(platform==='unknown')continue;
      const previous=directStore.data.devices.find(d=>d.host===host);
      if(previous){previous.seenAt=Date.now();if(previous.platform==='android'&&!previous.paired&&entry.service?.includes('adb-tls-connect')&&entry.port)previous.port=entry.port;if(previous.platform==='unknown')previous.platform=platform;}
      else if(directStore.data.devices.length<30)directStore.data.devices.push({id:crypto.randomUUID(),name:name.slice(0,100),model:model.slice(0,100),host,platform,port:platform==='android'?entry.port||5555:undefined,paired:false,seenAt:Date.now()});
    }catch{/* One malformed/blocked discovery response cannot cancel other TVs. */}
  }
  await directStore.save();return {devices:publicDevices()};
}
export async function directApi<T>(route: string,method='GET',input?: any): Promise<T> {
  requireNative();await initDirect();const path=new URL(route,'https://direct.invalid').pathname;const data=input||{};let result:unknown;
  if(path==='/api/devices'&&method==='GET')result={devices:publicDevices()};
  else if(path==='/api/scan')result=await scanDirect();
  else if(path==='/api/devices'&&method==='POST'){
    const host=localHost(String(data.host));const platform=platforms.includes(data.platform)?data.platform:'unknown';if(directStore.data.devices.some(d=>d.host===host))throw new Error('التلفزيون محفوظ بالفعل.');if(directStore.data.devices.length>=30)throw new Error('المكتبة ممتلئة.');directStore.data.devices.push({id:crypto.randomUUID(),host,platform,name:String(data.name||host).slice(0,100),paired:false,seenAt:Date.now()});await directStore.save();result={ok:true};
  }else if(path==='/api/packages'&&method==='GET')result={packages:directStore.data.packages};
  else if(path==='/api/receipts')result={receipts:directStore.data.receipts};
  else if(path==='/api/packages'&&method==='POST'){
    const suffix:Record<string,string>={android:'.apk',webos:'.ipk',tizen:'.wgt'};const platform=data.platform as Platform;safeAppId(String(data.appId));const filename=String(data.filename);if(!suffix[platform]||!filename.toLowerCase().endsWith(suffix[platform])||/[\\/]/.test(filename))throw new Error('صيغة الحزمة لا تطابق نظام التلفزيون.');
    const bytes=from64(String(data.data));if(!bytes.length||bytes.length>64*1024*1024)throw new Error('الحزمة فارغة أو أكبر من 64 MB.');const magic=new TextDecoder().decode(bytes.slice(0,8));if(platform==='webos'?!magic.startsWith('!<arch>'):bytes[0]!==80||bytes[1]!==75)throw new Error('الملف ليس حزمة صالحة.');
    if(platform==='tizen')validateWgt(bytes,String(data.appId));
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(directStore.data.packages.length>=50)throw new Error('مكتبة الحزم ممتلئة.');
    const p:PackageEntry={id:crypto.randomUUID(),appId:String(data.appId).slice(0,200),name:String(data.name||filename).slice(0,120),version:String(data.version||'').slice(0,40),filename,platform,sha256,bytes:bytes.length,addedAt:Date.now()};
    await Filesystem.writeFile({path:'packages/'+p.id,directory:Directory.Data,data:String(data.data),recursive:true});directStore.data.packages.push(p);await directStore.save();result={package:p};
  }else{
    const match=path.match(/^\/api\/devices\/([a-f0-9-]{36})(?:\/(.*))?$/);const d=directStore.data.devices.find(d=>d.id===match?.[1]);if(!d)throw new Error('التلفزيون غير موجود.');localHost(d.host);if(activeDevice!==d.id){if(installing.size)throw new Error('انتظر انتهاء التثبيت على الشاشة الأخرى.');adapters.close();closeAndroid();activeDevice=d.id;}const operation=match?.[2]||'';
    if(method==='PATCH'&&!operation){if(data.port!==undefined){const port=Number(data.port);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('منفذ غير صالح.');if(port!==d.port){d.port=port;d.paired=false;adapters.close();closeAndroid();}}await directStore.save();result={ok:true};}
    else if(operation==='developer'){
      if(!d.paired)throw new Error('اقرن الريموت أولًا.');
      if(d.platform==='webos'){result=await prepareWebos(d,String(data.passphrase||''),data.fingerprint?String(data.fingerprint):undefined);}
      else if(d.platform==='tizen'){const port=Number(data.port||26101);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('منفذ SDB غير صالح.');d.developerPort=port;d.developerReady=false;await directStore.save();await probeSdb(d);d.developerReady=true;result={message:'اتصال SDB جاهز؛ يجب أن تكون WGT موقعة للتلفزيون.'};}
      else throw new Error('لا يوجد تجهيز مطوّر منفصل لهذا النظام.');await directStore.save();
    }
    else if(operation==='pair'){await adapters.pair(d,data.code,data.pairPort);result={ok:true};}
    else if(operation==='apps')result={apps:await adapters.apps(d)};
    else if(operation==='activity'&&method==='GET')result={activity:await adapters.activity(d)};
    else if(operation==='app-metadata')result={app:await adapters.appMetadata(d,new URL(route,'https://direct.invalid').searchParams.get('appId')||'')};
    else if(operation==='settings'&&method==='GET')result={settings:await adapters.settings(d)};
    else if(operation==='settings'){await adapters.setSetting(d,data.id,data.value);result={ok:true};}
    else if(operation==='command'){await adapters.command(d,data.command);result={ok:true};}
    else if(operation==='launch'){await adapters.launch(d,data.appId);result={ok:true};}
    else if(operation==='icon'){
      const appId=new URL(route,'https://direct.invalid').searchParams.get('appId');const app=(await adapters.apps(d)).find(a=>a.id===appId);if(!app?.icon)throw new Error('الأيقونة غير متاحة.');const url=localUrl(app.icon,d.host);if(!['http:','https:'].includes(url.protocol))throw new Error('أيقونة غير متاحة.');const image=await Lan.http({url:url.href,limit:1024*1024});if(!/^image\/(png|jpeg|webp|gif)(?:;|$)/i.test(image.type))throw new Error('صيغة أيقونة غير مدعومة.');result={icon:'data:'+image.type.split(';')[0]+';base64,'+image.data};
    }else if(operation==='install'){
      if(data.confirmed!==true||!capabilities(d).install.available)throw new Error('يلزم اقتران وتجهيز تثبيت الحزمة المتوافقة وموافقتك.');const p=directStore.data.packages.find(p=>p.id===data.packageId);if(!p||p.platform!==d.platform)throw new Error('الحزمة غير متوافقة.');if(installing.has(d.id))throw new Error('يوجد تثبيت جارٍ على الشاشة.');installing.add(d.id);
      const receipt:InstallReceipt={id:crypto.randomUUID(),deviceId:d.id,packageId:p.id,sha256:p.sha256,status:'installing',startedAt:Date.now(),message:'ينقل الهاتف الحزمة مباشرة إلى التلفزيون.'};directStore.data.receipts.unshift(receipt);directStore.data.receipts=directStore.data.receipts.slice(0,50);
      try{await directStore.save();const file=await Filesystem.readFile({path:'packages/'+p.id,directory:Directory.Data});const bytes=from64(String(file.data));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==p.sha256)throw new Error('تغيرت بصمة الحزمة.');receipt.message=d.platform==='webos'?await installWebos(d,p,bytes):d.platform==='tizen'?await installTizen(d,p,bytes):await installApk(d.host,d.port||5555,bytes,p.id);receipt.status='installed';result={receipt};}
      catch(e){receipt.status='failed';receipt.message=e instanceof Error?e.message:'فشل التثبيت';throw e;}
      finally{receipt.endedAt=Date.now();installing.delete(d.id);await directStore.save();}
    }else throw new Error('وظيفة غير مدعومة.');
  }
  return result as T;
}
export async function forgetDirect(){if(installing.size)throw new Error('انتظر انتهاء التثبيت قبل مسح المكتبة.');activeDevice='';adapters.close();closeAndroid();await VaultReset();directStore.data={devices:[],keys:getSecrets(),packages:[],receipts:[]};await Preferences.remove({key:'direct-tv-library'});await Filesystem.rmdir({path:'packages',directory:Directory.Data,recursive:true}).catch(()=>{});}
// The phone identity remains stable, as it does in iOS ADBCore Keychain and Android's TLS context.
// TV tokens, host pins, passphrases and per-TV TLS flags are removed here.
async function VaultReset(){const {Vault}=await import('./native.ts');await Vault.clearSession({key:'tv-secrets'});const keys=getSecrets();for(const key of Object.keys(keys))if(key!=='adb')delete keys[key];}
