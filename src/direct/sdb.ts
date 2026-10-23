import type {Device,PackageEntry} from '../model.ts';
import {Lan,localHost,to64,from64} from './native.ts';
const C={CNXN:0x4e584e43,OPEN:0x4e45504f,OKAY:0x59414b4f,CLSE:0x45534c43,WRTE:0x45545257,AUTH:0x48545541};
const text=new TextEncoder(),decode=new TextDecoder();
const join=(a:Uint8Array,b:Uint8Array)=>{const r=new Uint8Array(a.length+b.length);r.set(a);r.set(b,a.length);return r;};
export function sdbFrame(command:number,a:number,b:number,data:Uint8Array=new Uint8Array()){
 const out=new Uint8Array(24+data.length),view=new DataView(out.buffer);[command,a,b,data.length,data.reduce((n,v)=>(n+v)>>>0,0),(command^0xffffffff)>>>0].forEach((v,i)=>view.setUint32(i*4,v,true));out.set(data,24);return out;
}
export class SdbChannel {
 id=crypto.randomUUID();buffer=new Uint8Array();queued:Uint8Array[]=[];remote=0;max=4096;closed=false;deadline=Date.now()+180000;
 async exact(n:number):Promise<Uint8Array>{while(this.buffer.length<n){if(Date.now()>this.deadline)throw new Error('انتهت مهلة سامسونغ.');const r=await Lan.read({id:this.id});if(r.data)this.buffer=join(this.buffer,from64(r.data));if(r.closed&&this.buffer.length<n)throw new Error('أغلق سامسونغ الاتصال.');}const out=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n);return out;}
 async packet(){const h=await this.exact(24),v=new DataView(h.buffer);const command=v.getUint32(0,true),n=v.getUint32(12,true);if(n>262144||v.getUint32(20,true)!==((command^0xffffffff)>>>0))throw new Error('إطار SDB غير صالح.');const data=await this.exact(n);if(v.getUint32(16,true)!==data.reduce((s,b)=>(s+b)>>>0,0))throw new Error('تلفت بيانات SDB.');return {command,a:v.getUint32(4,true),b:v.getUint32(8,true),data};}
 async send(command:number,a:number,b:number,data:Uint8Array=new Uint8Array()){await Lan.write({id:this.id,data:to64(sdbFrame(command,a,b,data))});}
 async open(d:Device,service:string){
  try{this.deadline=Date.now()+15000;await Lan.open({id:this.id,kind:'tcp',host:localHost(d.host),port:d.developerPort||26101});await this.send(C.CNXN,0x00100000,262144,text.encode('host::\0'));const hello=await this.packet();if(hello.command===C.AUTH)throw new Error('سامسونغ يطلب تفويضًا إضافيًا؛ تحقق من Developer Mode وعنوان الهاتف المسموح.');if(hello.command!==C.CNXN)throw new Error('لم يستجب سامسونغ ببروتوكول SDB.');this.max=Math.min(262144,hello.b||4096);if(this.max<256)throw new Error('حجم SDB غير صالح.');await this.send(C.OPEN,1,0,text.encode(service+'\0'));const opened=await this.packet();if(opened.command!==C.OKAY||opened.b!==1)throw new Error('رفض التلفزيون خدمة المطوّر.');this.remote=opened.a;this.deadline=Date.now()+180000;return this;}catch(e){await this.close();throw e;}
 }
 async receive(){const p=await this.packet();if(p.b!==1||p.a!==this.remote)throw new Error('قناة SDB غير متوقعة.');if(p.command===C.WRTE){await this.send(C.OKAY,1,this.remote);return p;}if(p.command===C.CLSE){this.closed=true;await this.send(C.CLSE,1,this.remote);return p;}return p;}
 async write(data:Uint8Array){for(let off=0;off<data.length;off+=this.max){await this.send(C.WRTE,1,this.remote,data.subarray(off,off+this.max));for(;;){const p=await this.receive();if(p.command===C.OKAY)break;if(p.command===C.WRTE)this.queued.push(p.data);else throw new Error('رفض سامسونغ نقل الملف.');}}}
 async read(){if(this.queued.length)return this.queued.shift()!;if(this.closed)return undefined;for(;;){const p=await this.receive();if(p.command===C.WRTE)return p.data;if(p.command===C.CLSE)return undefined;}}
 async close(){await Lan.close({id:this.id}).catch(()=>{});this.closed=true;}
}
export async function sdbShell(d:Device,service:string,limit=131072){const channel=await new SdbChannel().open(d,service);try{let out=new Uint8Array();for(;;){const chunk=await channel.read();if(!chunk)break;if(out.length+chunk.length>limit)throw new Error('رد سامسونغ أكبر من الحد.');out=join(out,chunk);}return decode.decode(out);}finally{await channel.close();}}
function sync(id:string,value:number,data:Uint8Array=new Uint8Array()){const out=new Uint8Array(8+data.length);out.set(text.encode(id));new DataView(out.buffer).setUint32(4,value,true);out.set(data,8);return out;}
export async function probeSdb(d:Device){const output=await sdbShell(d,'capability:',8192);if(!/platform|secure_protocol|sdbd|version|profile/i.test(output))throw new Error('لم يؤكد سامسونغ قدرات المطوّر.');return output;}
export function confirmTizenInstall(output:string){
 if(/failed|failure|denied|error|not found/i.test(output))throw new Error('رفض سامسونغ التثبيت: '+output.slice(-500));
 const exit=/appcmd_exitcode:\s*(-?\d+)/i.exec(output);if(exit&&Number(exit[1])!==0)throw new Error('فشل تثبيت WGT: '+output.slice(-500));
 if(!(exit&&Number(exit[1])===0)&&!/install completed|successfully installed|processing result\s*:\s*(?:ok|success)\s*\[0\]/i.test(output))throw new Error('لم يؤكد سامسونغ اكتمال التثبيت: '+output.slice(-500));return 'Samsung confirmed WGT installed';
}
export async function installTizen(d:Device,p:PackageEntry,bytes:Uint8Array){
 if(!/^[a-f0-9-]{36}$/.test(p.id)||!/^[A-Za-z0-9._-]+$/.test(p.appId))throw new Error('معرف الحزمة غير صالح.');const remote='/home/owner/share/tmp/sdk_tools/flix-'+p.id+'.wgt';const channel=await new SdbChannel().open(d,'sync:');
 try{const path=text.encode(remote+',33188');await channel.write(sync('SEND',path.length,path));const size=Math.min(65536,channel.max-8);for(let i=0;i<bytes.length;i+=size){const chunk=bytes.subarray(i,i+size);await channel.write(sync('DATA',chunk.length,chunk));}await channel.write(sync('DONE',Math.floor(Date.now()/1000)));let reply=new Uint8Array();while(reply.length<8){const chunk=await channel.read();if(!chunk)throw new Error('لم يؤكد التلفزيون نقل WGT.');reply=join(reply,chunk);}if(decode.decode(reply.subarray(0,4))!=='OKAY')throw new Error('رفض التلفزيون نقل WGT.');await channel.write(sync('QUIT',0));}
 catch(e){await sdbShell(d,'shell:0 rmfile "'+remote+'"').catch(()=>{});throw e;}
 finally{await channel.close();}
 try{return confirmTizenInstall(await sdbShell(d,'shell:0 vd_appinstall '+p.appId.split('.')[0]+' '+remote));}
 finally{await sdbShell(d,'shell:0 rmfile "'+remote+'"').catch(()=>{});}
}
