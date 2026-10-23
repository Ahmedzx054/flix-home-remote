import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import source from './source.html?raw';
import { createPageBridge, type PageHost, type Utility } from './bridge.ts';

declare global {interface Window {flixRemotePageRequest:(route:string,init?:{method?:string;body?:string})=>Promise<Response>;flixRemoteSpeech:()=>Promise<{text:string}>}}
const cloudHosts=new Set(['flix-s-neon.vercel.app','flix-iptv-snowy.vercel.app','flix-admin-tan.vercel.app']);
/** The bundled original page runs unchanged; only transport and account/install entry points change. */
export function mountOriginalRemote(host:PageHost){
 const frame=document.createElement('iframe');frame.id='original-remote';frame.title='صفحة ريموت FLIX الأصلية';
 frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals');
 const request=createPageBridge(host),browserFetch=window.fetch.bind(window);
 window.flixRemotePageRequest=async(route,init={})=>{
  const method=init.method||'GET';
  if(route.startsWith('/api/')){
   let body:Record<string,unknown>={};try{body=init.body?JSON.parse(init.body):{};}catch{return Response.json({ok:false,message:'طلب غير صالح'},{status:400});}
   return Response.json(await request(route,method,body));
  }
  const url=new URL(route,window.location.href);
  if(url.protocol!=='https:'||!cloudHosts.has(url.hostname))throw Error('عنوان خدمة غير مسموح');
  if(!Capacitor.isNativePlatform())return browserFetch(route,init);
  const result=await CapacitorHttp.request({url:url.href,method,headers:{'Content-Type':'application/json'},data:init.body?JSON.parse(init.body):undefined,connectTimeout:10000,readTimeout:20000});
  return Response.json(result.data,{status:result.status});
 };
 window.flixRemoteSpeech=()=>registerPlugin<{recognizeSpeech():Promise<{text:string}>}>('HomeDiscovery').recognizeSpeech();
 const speechShim=Capacitor.isNativePlatform()?`window.SpeechRecognition=class{start(){parent.flixRemoteSpeech().then(r=>{const row=[{transcript:r.text}];row.isFinal=true;this.onresult?.({resultIndex:0,results:[row]});}).catch(()=>this.onerror?.({error:'not-allowed'})).finally(()=>this.onend?.());}};`:'';
 const shim=`<script>window.fetch=(route,init)=>parent.flixRemotePageRequest(String(route),init);${speechShim}</script>`;
 const additions=`<style>.phone-tools{display:flex;gap:6px;padding:6px;flex-wrap:wrap}.phone-tools button{flex:1;font-size:12px;min-height:38px}.installBody .empty button{min-height:44px}</style><script>
 const phonePanel=(panel,host)=>fetch('/api/native-panel',{method:'POST',body:JSON.stringify({panel,host:host||window.flixRemote?.host()||''})});
 const bar=document.createElement('div');bar.className='phone-tools';
 for(const [panel,label] of [['devices','الشاشات والاقتران'],['library','تطبيقاتي وإرسال الحزم'],['support','حساب FLIX والدعم']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>phonePanel(panel);bar.append(b);}
 document.querySelector('.remote header')?.after(bar);
 const oldLink=document.querySelector('a[href="/home-remote"]');if(oldLink)oldLink.remove();
 const install=document.querySelector('.installer');install?.addEventListener('toggle',()=>{if(install.open)phonePanel('library');});
 document.getElementById('useIp').addEventListener('click',()=>phonePanel('manual',document.getElementById('ipInput').value.trim()));
 </script>`;
 frame.srcdoc=source.replace('<head>','<head>'+shim).replace('</body>',additions+'</body>');
 document.body.prepend(frame);document.body.classList.add('remote-original');
 return{show:(tvHost?:string)=>{if(tvHost)(frame.contentWindow as any)?.flixRemote?.useHost(tvHost);document.body.classList.add('remote-original');},open:(action:Utility)=>host.open(action)};
}
