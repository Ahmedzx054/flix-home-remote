import {Capacitor,CapacitorHttp} from '@capacitor/core';
/** Catalogue requests contain no TV or account credentials. The origin is fixed. */
export async function catalogueJson(route:string,timeout=10000){
 if(!/^\/api\/(?:search|faselhd|catalog\/browse)(?:\?|$)/.test(route)||route.length>1400)throw Error('طلب فهرس غير صالح.');
 const url='https://flix-s-neon.vercel.app'+route;
 if(Capacitor.isNativePlatform()){
  const r=await CapacitorHttp.get({url,headers:{'x-flix-tv-mode':'1'},connectTimeout:timeout,readTimeout:timeout});
  if(r.status<200||r.status>=300)throw Error('خدمة فهرس فلكس '+r.status);return r.data;
 }
 const r=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{'x-flix-tv-mode':'1'}});if(!r.ok)throw Error('خدمة فهرس فلكس '+r.status);return r.json();
}
