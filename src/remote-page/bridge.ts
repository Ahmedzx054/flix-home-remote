import type { Command, Device, Capabilities, TvApp, PackageEntry } from '../model.ts';
import { VERSION, BUILD_ID } from '../build-info.ts';
type Tv=Device & {capabilities:Capabilities};
export type Utility='support'|'library'|'pair'|'manual'|'settings'|'devices';
export interface PageHost {
 api<T>(path:string,method?:string,data?:unknown):Promise<T>;
 selected():string;
 select(id:string):void;
 open(action:Utility,host?:string):void;
 record(path:string,ok:boolean,message:string,deviceId:string):void;
}
export const pageKeys:Record<string,Command>={UP:'up',DOWN:'down',LEFT:'left',RIGHT:'right',ENTER:'ok',BACK:'back',HOME:'home',MENU:'settings',VOLUMEUP:'volumeUp',VOLUMEDOWN:'volumeDown',MUTE:'mute',PLAY:'playPause',PAUSE:'pause',REWIND:'rewind',FASTFORWARD:'fastForward',INFO:'info',EXIT:'exit',CHANNELUP:'channelUp',CHANNELDOWN:'channelDown'};
export function resolveShortcut(id:string,apps:TvApp[]){
 const exact=apps.find(a=>a.id===id);if(exact)return exact.id;
 const aliases:Record<string,RegExp>={netflix:/netflix|نتفلكس/i,'youtube.leanback.v4':/youtube|يوتيوب/i,'com.apple.appletv':/apple\s*tv|أبل تي/i,'net.mbc.shahid-lgapp':/shahid|شاهد/i,'com.netflixfree.s.cloud':/flix\s*s\b|فلكس\s*(اس|إس)/i,'com.netflixfree.f.cloud':/flix\s*f\b|فلكس\s*(اف|إف)/i,'com.netflixfree.tv.cloud':/flix.*iptv|فلكس.*آي بي/i};
 const pattern=aliases[id],matches=pattern?apps.filter(a=>pattern.test(a.label)):[];
 if(matches.length!==1)throw Error(matches.length?'يوجد أكثر من تطبيق مطابق؛ اختر التطبيق من قائمة التلفزيون.':'التطبيق غير موجود في القائمة التي أعادها التلفزيون.');return matches[0].id;
}
export function createPageBridge(h:PageHost){
 let scanning:Promise<any>|undefined;
 const events:{at:string;action:string;ok:boolean;ms:number;why:string}[]=[];
 const list=async()=>(await h.api<{devices:Tv[]}>('/api/devices')).devices;
 const path=(d:Device)=>'/api/devices/'+encodeURIComponent(d.id);
 const target=async(host?:string)=>{const all=await list();const d=host?all.find(d=>d.host===host):all.find(d=>d.id===h.selected())||all[0];if(!d){throw Error('اختر تلفزيونًا من البحث، أو أضف عنوانه ونظامه أولًا.');}return d;};
 return async function request(route:string,method='GET',body:Record<string,any>={}){
  const url=new URL(route,'https://phone.invalid'),action=url.pathname,started=Date.now();let deviceId='';let chosen:Tv|undefined;
  try{
   if(action==='/api/native-panel'){if(!['support','library','pair','manual','settings','devices'].includes(body.panel))throw Error('نافذة غير صالحة');h.open(body.panel,body.host);return{ok:true};}
   if(action==='/api/voice/warm')return{ok:true};
   if(action==='/api/discover'){
    scanning ||= h.api<any>('/api/scan','POST',{}).finally(()=>{scanning=undefined;});
    const r=await scanning;return{ok:true,found:r.devices.map((d:Tv)=>({...d,kind:d.platform,lg:d.platform==='webos'})),diagnostics:r.diagnostics};
   }
   if(action==='/api/televisions'){return{ok:true,televisions:(await list()).map(d=>({...d,kind:d.platform,canWake:false}))};}
   if(action==='/api/versions'){return{ok:true,builds:[{label:'ريموت FLIX',platform:'iPhone · Android',version:VERSION,updated:BUILD_ID}]};}
   if(action==='/api/monitor'){const failed=events.filter(e=>!e.ok);return{ok:true,commands:events.length,failed:failed.length,causes:failed.slice(-5).map(e=>({count:1,why:e.why,did:'افتح حساب FLIX والدعم لمشاركة التشخيص'})),recent:events.slice(-30).reverse()};}
   const d=await target(body.host||url.searchParams.get('host')||undefined);deviceId=d.id;chosen=d;
   if(method!=='GET')h.select(d.id);
   const call=<T>(operation:string,data?:unknown,verb='POST')=>h.api<T>(path(d)+'/'+operation,verb,data);
   if(action==='/api/state'){let connected=false;if(d.paired){try{connected=!!(await call<any>('page-operation',{operation:'connection'})).connected;}catch{}}return{ok:true,connected,paired:(await list()).filter(x=>x.paired).map(x=>x.host),defaultHost:d.host};}
   if(action==='/api/tv-targets')return{ok:true,targets:(await list()).map(x=>({id:'__direct__@'+x.host,name:x.name,label:x.name,direct:true}))};
   if(action==='/api/apps-on-tv'){if(!d.paired)return{ok:false,apps:[],message:'اقرن التلفزيون أولًا'};const r=await call<{apps:TvApp[]}>('apps',undefined,'GET');return{ok:true,apps:r.apps.map(a=>({...a,title:a.label}))};}
   if(action==='/api/tv-apps'){const r=await h.api<{packages:PackageEntry[]}>('/api/packages');return{ok:true,platform:d.platform,device:true,apps:r.packages.filter(p=>p.platform===d.platform).map(p=>({id:p.id,key:p.id,app:p.id,label:p.name,version:p.version,file:p.filename})),note:'أضف حزمة متوافقة من تطبيقاتي'};}
   if(action==='/api/tv-install'){h.open('library',d.host);throw Error('راجع الحزمة والتلفزيون في نافذة تطبيقاتي ثم وافق على التثبيت.');}
   if(action==='/api/picture-pair'){h.open('pair',d.host);return{ok:true,paired:false,pairing:true,message:'أكمل موافقة التلفزيون في نافذة الاقتران ثم ارجع للريموت.'};}
   if(!d.paired){if(method!=='GET')h.open('pair',d.host);throw Error('يحتاج التلفزيون موافقتك على الاقتران أولًا.');}
   const operation=(name:string,data:Record<string,any>=body)=>call<any>('page-operation',{...data,operation:name});
   if(action==='/api/button'){const command=pageKeys[String(body.name)];if(!command||!d.capabilities.commands.includes(command))throw Error('هذا الزر لا يدعمه بروتوكول التلفزيون.');await call('command',{command});}
   else if(action==='/api/power-off')await call('command',{command:'powerOff'});
   else if(action==='/api/power-on')throw Error('تشغيل الشاشة من الاستعداد يحتاج دعم Wake-on-LAN وعنوانها المادي وإذن الشبكة؛ شغّلها بريموتها حاليًا.');
   else if(action==='/api/launch'){const apps=await call<{apps:TvApp[]}>('apps',undefined,'GET');await call('launch',{appId:resolveShortcut(String(body.id),apps.apps)});}
   else if(action==='/api/settings'){const r=await call<any>('settings',undefined,'GET');const wanted=String(body.page||'open');await call('settings',{id:r.settings.some((s:any)=>s.id===wanted)?wanted:'open'});}
   else if(['/api/move','/api/scroll','/api/click','/api/type','/api/input','/api/open-in-app'].includes(action)){const result=await operation(action.slice(5));h.record(action,result?.ok!==false,String(result?.message||method),deviceId);return{ok:true,...result};}
   else if(action==='/api/inputs')return{ok:true,...await operation('inputs')};
   else if(action==='/api/sound')return{ok:true,...await operation('sound',method==='GET'?{}:body)};
   else if(action==='/api/picture')return{ok:true,...await operation('picture',method==='GET'?{}:body)};
   else if(action==='/api/bluetooth')return{ok:true,...await operation('bluetooth',method==='GET'?{}:body)};
   else if(action==='/api/sound-output-set')return{ok:true,...await operation('sound',{output:body.output})};
   else if(action==='/api/voice'){
    const text=String(body.text||'').trim();const keys:Record<string,Command>={'ارفع الصوت':'volumeUp','خفض الصوت':'volumeDown','كتم':'mute','رجوع':'back','الرئيسية':'home','يمين':'right','يسار':'left','فوق':'up','تحت':'down','توقف':'pause','شغل':'play','القناة التالية':'channelUp'};
    if(keys[text])await call('command',{command:keys[text]});
    else {const apps=await call<{apps:TvApp[]}>('apps',undefined,'GET');const search=text.replace(/^(افتح|شغل|شغّل)\s+/,'').toLowerCase();const app=apps.apps.find(a=>a.label.toLowerCase()===search);if(app)await call('launch',{appId:app.id});else throw Error('اكتب اسم تطبيق مثبت كما يظهر في قائمته، أو أمرًا مثل «ارفع الصوت». البحث عن المحتوى من اكسبلور.');}
    return{ok:true,message:'أُرسل الطلب إلى '+d.name,said:text};
   }
   else if(action==='/api/title-progress'||action==='/api/continue'){
    const id=action==='/api/title-progress'?url.searchParams.get('id')||'':'';
    const r=await operation('history',{id});
    if(id)return{ok:true,connected:true,entries:r.entries};
    return{ok:true,app:url.searchParams.get('app')||'s',cards:r.entries.map((e:any)=>({...e,label:e.title,poster:e.poster?.startsWith('/')?'https://image.tmdb.org/t/p/w342'+e.poster:e.poster,path:e.type==='tv'?'/tv/'+e.id+'/watch?s='+(e.season||1)+'&e='+(e.episode||1):'/movie/'+e.id+'/watch'}))};
   }
   else if(action==='/api/stats')throw Error('إحصاءات مستخدمي فلكس تتطلب حساب الإدارة؛ سجل الشاشة المحددة متاح من المتابعة.');
   else throw Error('الوظيفة غير متاحة عبر بروتوكول هذه الشاشة. أرسل التشخيص من حساب FLIX والدعم.');
   h.record(action,true,method,deviceId);events.push({at:new Date().toISOString(),action,ok:true,ms:Date.now()-started,why:''});if(events.length>80)events.shift();return{ok:true};
  }catch(error){const message=error instanceof Error?error.message:'تعذر الاتصال';h.record(action,false,message,deviceId);events.push({at:new Date().toISOString(),action,ok:false,ms:Date.now()-started,why:message});if(events.length>80)events.shift();return{ok:false,error:'phone_direct',message,...(action==='/api/picture'?{lg:chosen?.platform==='webos',paired:false,pairingError:message}:{})};}
 };
}
