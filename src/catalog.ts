import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { request } from './api.ts';
import type { PackageEntry, Platform } from './model.ts';
export interface CatalogRelease { id:string; appId:string; name:string; version:string; platform:Platform; filename:string; url:string; sha256:string; bytes:number; notes:string; updatedAt:number }
export async function fetchCatalog(session:{url:string;sessionToken:string}) { return (await request<{releases:CatalogRelease[]}>(session.url,'/api/home-remote/catalog',session.sessionToken)).releases; }
export async function verifyPackage(release:CatalogRelease,data:string){
 if(!Number.isInteger(release.bytes)||release.bytes<1||release.bytes>64*1024*1024||data.length>Math.ceil(64*1024*1024*4/3)+4)throw Error('الحزمة أكبر من الحد المسموح.');
 const raw=atob(data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 if(bytes.length!==release.bytes)throw Error('حجم الحزمة لا يطابق النسخة المنشورة.');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==release.sha256)throw Error('بصمة الحزمة لا تطابق النسخة المنشورة؛ لم تحفظ أو تثبت.');
 return data;
}
export async function downloadRelease(release:CatalogRelease){
 const url=new URL(release.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('رابط الحزمة غير صالح.');
 let data:string;
 if(Capacitor.isNativePlatform()){
  const response=await CapacitorHttp.get({url:release.url,responseType:'arraybuffer',connectTimeout:8000,readTimeout:120000});
  if(response.status!==200||typeof response.data!=='string')throw Error('فشل تنزيل الحزمة.');data=response.data;
 }else{
  const response=await fetch(release.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('فشل تنزيل الحزمة.');
  const reader=response.body?.getReader();if(!reader)throw Error('تعذر قراءة الحزمة.');let count=0;const chunks:Uint8Array[]=[];
  while(true){const {value,done}=await reader.read();if(done)break;count+=value.length;if(count>release.bytes||count>64*1024*1024){await reader.cancel();throw Error('الحزمة أكبر من الحجم المعلن.');}chunks.push(value);}
  const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));data=btoa(raw);
 }
 return verifyPackage(release,data);
}
export function catalogState(release:CatalogRelease,packages:PackageEntry[]){
 const matching=packages.find(p=>p.appId===release.appId&&p.platform===release.platform&&p.sha256===release.sha256);
 return matching?{label:'محفوظة على الجوال',package:matching}:{label:packages.some(p=>p.appId===release.appId&&p.platform===release.platform)?'نسخة مختلفة متاحة':'متاح للتنزيل',package:undefined};
}
