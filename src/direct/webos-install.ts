import type { Device,PackageEntry } from '../model.ts';
import {Lan,localHost,from64,to64} from './native.ts';
import {getSecrets,saveSecrets} from './adb.ts';
type SshReply={fingerprint:string;needsTrust:boolean;message:string;error?:string};
declare global {interface Window {Go:new()=>{importObject:WebAssembly.Imports;run(instance:WebAssembly.Instance):Promise<void>};flixSsh:(input:string)=>Promise<string>;flixSshWire:unknown;__sshReady?:Promise<void>}}
async function ready(){
 if(!window.__sshReady)window.__sshReady=(async()=>{
  window.flixSshWire={open:async(host:string,port:number)=>{localHost(host);const id=crypto.randomUUID();await Lan.open({id,kind:'tcp',host,port});return id;},read:(id:string)=>Lan.read({id}),write:(id:string,data:string)=>Lan.write({id,data}),close:(id:string)=>Lan.close({id})};
  await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='/ssh/wasm_exec.js';script.onload=()=>resolve();script.onerror=()=>reject(new Error('تعذر تحميل مكوّن تثبيت LG.'));document.head.append(script);});
  const go=new window.Go(),bytes=await (await fetch('/ssh/sshcore.wasm')).arrayBuffer();const {instance}=await WebAssembly.instantiate(bytes,go.importObject);void go.run(instance);
 })();return window.__sshReady;
}
async function ssh(d:Device,operation:string,key:string,passphrase:string,fingerprint:string,p?:PackageEntry,bytes?:Uint8Array){await ready();const result:SshReply=JSON.parse(await window.flixSsh(JSON.stringify({host:localHost(d.host),port:9922,operation,key,passphrase,fingerprint,id:p?.id,data:bytes?to64(bytes):undefined})));if(result.error)throw new Error(result.error);return result;}
export async function prepareWebos(d:Device,passphrase:string,acceptedFingerprint?:string){
 if(!passphrase||passphrase.length>64)throw new Error('أدخل Passphrase الظاهر في Developer Mode.');
 const response=await Lan.http({url:`http://${localHost(d.host)}:9991/webos_rsa`,limit:16384});const key=new TextDecoder().decode(from64(response.data));if(!key.includes('PRIVATE KEY'))throw new Error('شغّل Key Server في Developer Mode على LG.');
 const old=getSecrets()['ssh:'+d.id];const saved=old?JSON.parse(old):undefined;
 const fingerprint=acceptedFingerprint||saved?.fingerprint||'';
 const result=await ssh(d,'probe',key,passphrase,fingerprint);
 if(result.needsTrust)return result;
 getSecrets()['ssh:'+d.id]=JSON.stringify({key,passphrase,fingerprint:result.fingerprint});await saveSecrets();return result;
}
export async function installWebos(d:Device,p:PackageEntry,bytes:Uint8Array){const secret=getSecrets()['ssh:'+d.id];if(!secret)throw new Error('جهّز Developer Mode للشاشة أولًا.');const config=JSON.parse(secret);const result=await ssh(d,'install',config.key,config.passphrase,config.fingerprint,p,bytes);return result.message;}
