import type {Device} from '../model.ts';
import {tvFetch,localUrl} from './native.ts';
import {TvSocket} from './socket.ts';
const origins=new Set(['https://flix-s-neon.vercel.app','https://flix-iptv-snowy.vercel.app']);
/** An explicitly enabled TV inspector. Only the selected FLIX target and its own app origin are accepted. */
export async function inFlix(d:Device,expression:string,appId?:string,top=false,timeout=15000){
 if(d.platform!=='webos')throw Error('هذه الوظيفة تحتاج قناة فلكس على webOS مع تفعيل وضع المطور؛ التحكم الأساسي متاح من الريموت.');
 let targets:any[];try{targets=JSON.parse(await(await tvFetch(d.host,9998,'/json/list')).text());}catch{throw Error('افتح فلكس على التلفزيون وفعّل وضع المطور للوصول لوظائف التطبيق المتقدمة. منفذ فلكس9998 لا يجيب.');}
 const page=targets.find(p=>p.type==='page'&&/com\.netflixfree\./.test(String(p.url||''))&&(!appId||String(p.url).includes(appId)));
 if(!page?.webSocketDebuggerUrl)throw Error('لم يظهر تطبيق فلكس المطلوب في التلفزيون المحدد؛ افتحه عليه أولًا.');
 const url=localUrl(String(page.webSocketDebuggerUrl),d.host);if(!['ws:','wss:'].includes(url.protocol))throw Error('عنوان قناة فلكس غير صالح.');
 const socket=new TvSocket(url.href);await socket.open();
 try{
  let contextId:number|undefined;
  if(!top){
   await socket.rpc('Runtime.enable');
   // Runtime.enable replays the document contexts to this new connection, including the app iframe.
   for(let n=0;n<12;n++){
    let message:any;try{message=await socket.wait(m=>m.method==='Runtime.executionContextCreated',250);}catch{break;}
    const c=message.params?.context;if(origins.has(String(c?.origin))&&c.auxData?.isDefault!==false){contextId=c.id;break;}
   }
   if(contextId===undefined)throw Error('لم يظهر إطار فلكس الموثوق؛ انتظر اكتمال فتح التطبيق على التلفزيون.');
  }
  const result=await socket.rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,...(contextId!==undefined?{contextId}:{})},timeout);
  if(result?.exceptionDetails)throw Error(String(result.exceptionDetails.text||'تعذر تنفيذ الطلب داخل فلكس.'));
  return result?.result?.value;
 }finally{socket.close();}
}
export function navigateExpression(path:string){
 if(!/^\/(?!\/)[A-Za-z0-9/_\-.?=&%]{0,400}$/.test(path))throw Error('مسار محتوى غير صالح.');
 return `(function(){var to=${JSON.stringify(path)};var q=new URLSearchParams(location.search),keep=new URLSearchParams();['tv','shell','appShell'].forEach(function(k){if(q.get(k))keep.set(k,q.get(k));});if(!keep.get('tv')&&document.documentElement.classList.contains('tv-device'))keep.set('tv','1');var s=keep.toString();location.assign(to+(s?(to.indexOf('?')<0?'?':'&')+s:''));return {ok:true,path:to};})()`;
}
export function textExpression(text:string,replace=false){
 if(text.length>2000||text.includes('\0'))throw Error('نص غير صالح.');
 return `(function(){var e=document.activeElement;if(!e||!(/^(INPUT|TEXTAREA)$/.test(e.tagName)||e.isContentEditable))return {ok:false,via:'no-field'};var t=${JSON.stringify(text)};if(e.isContentEditable){e.textContent=${replace?'t':'e.textContent+t'};}else{var v=${replace?'t':'e.value+t'};var p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;var set=Object.getOwnPropertyDescriptor(p,'value').set;set.call(e,v);}e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return {ok:true,via:'page'};})()`;
}
export function historyExpression(id=''){
 if(id&&!/^[A-Za-z0-9_-]{1,32}$/.test(id))throw Error('معرف عنوان غير صالح.');
 // Account tokens and unrelated storage never leave the television.
 return `(function(){var out=[],wanted=${JSON.stringify(id)};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(!k||k.indexOf('netflixfree-watch-history')<0||k.indexOf('backup')>=0)continue;try{var rows=JSON.parse(localStorage.getItem(k)||'[]');if(!Array.isArray(rows))continue;rows.forEach(function(e){if(!e||wanted&&String(e.id)!==wanted)return;out.push({id:String(e.id||''),type:String(e.type||e.mediaType||''),title:String(e.title||''),poster:String(e.poster||e.poster_path||''),season:Number(e.season)||0,episode:Number(e.episode)||0,progress:Number(e.progress)||0,currentTime:Number(e.currentTime)||0,duration:Number(e.duration)||0,updatedAt:e.updatedAt||e.watchedAt||e.timestamp||0});});}catch(e){}}return out.slice(0,100);})()`;
}
