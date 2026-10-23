import { Adb, AdbDaemonTransport, type AdbCredentialStore, type AdbPrivateKey, type AdbPacketData, type AdbPacketInit, AdbPacketSerializeStream } from '@yume-chan/adb';
import { Consumable, MaybeConsumable, ReadableStream, WritableStream } from '@yume-chan/stream-extra';
import { Lan, NativeAdb, localHost, from64, to64, Vault } from './native.ts';
let secrets: Record<string,string> = {}; let save = Promise.resolve();
export async function loadSecrets() { const r=await Vault.readSession({key:'tv-secrets'}); secrets=r.value ? JSON.parse(r.value) : {};const identity=await Vault.readSession({key:'phone-adb-identity'});if(identity.value)secrets.adb=identity.value;else if(secrets.adb)await Vault.saveSession({key:'phone-adb-identity',value:secrets.adb}); }
export function getSecrets() { return secrets; }
export function saveSecrets() { const value=JSON.stringify(secrets); save=save.catch(()=>{}).then(()=>Vault.saveSession({key:'tv-secrets',value})); return save; }
const credentials: AdbCredentialStore = {
  async generateKey(): Promise<AdbPrivateKey> { const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-1'},true,['sign','verify']); const buffer=new Uint8Array(await crypto.subtle.exportKey('pkcs8',pair.privateKey)); secrets.adb=to64(buffer);await Vault.saveSession({key:'phone-adb-identity',value:secrets.adb}); await saveSecrets(); return { buffer, name:'FLIX@phone' }; },
  *iterateKeys() { if(secrets.adb) yield {buffer:from64(secrets.adb),name:'FLIX@phone'}; },
};
const sessions = new Map<string,Adb>(), opening = new Map<string,Promise<Adb>>();
/** Parse TCP fragments into bounded ADB packets, including fragmented headers. */
export function packetParser() {
  let bytes = new Uint8Array(0);
  return (chunk: Uint8Array): AdbPacketData[] => {
    const next=new Uint8Array(bytes.length+chunk.length);next.set(bytes);next.set(chunk,bytes.length);bytes=next;const result:AdbPacketData[]=[];
    while(bytes.length>=24) { const h=new DataView(bytes.buffer,bytes.byteOffset,24),command=h.getUint32(0,true),n=h.getUint32(12,true);if(n>1024*1024 || h.getUint32(20,true)!==((command^0xffffffff)>>>0))throw new Error('Invalid ADB packet');if(bytes.length<n+24)break;result.push({command,arg0:h.getUint32(4,true),arg1:h.getUint32(8,true),payload:bytes.slice(24,24+n)});bytes=bytes.slice(24+n); }
    return result;
  };
}
export async function android(host: string, port=5555, prompt=false): Promise<Adb> {
  localHost(host);const serial=`${host}:${port}`; const active=sessions.get(serial);if(active)return active;const pending=opening.get(serial);if(pending)return pending;
  const promise=(async()=>{
    const id=crypto.randomUUID();await Lan.open({id,kind:'tcp',host,port});const parse=packetParser();let closed=false;
    const close=async()=>{if(!closed){closed=true;await Lan.close({id});}};
    const readable=new ReadableStream<AdbPacketData>({async pull(controller){try{while(!closed){const r=await Lan.read({id});if(r.data){for(const p of parse(from64(r.data)))controller.enqueue(p);return;}if(r.closed){controller.close();await close();return;}}}catch(e){controller.error(e);await close();}},cancel:close});
    const raw=new WritableStream<Consumable<Uint8Array>>({write(item){return item.tryConsume(async bytes=>{for(let i=0;i<bytes.length;i+=65536)await Lan.write({id,data:to64(bytes.subarray(i,i+65536))});});},close,abort:close});
    const serializer=new AdbPacketSerializeStream();void serializer.readable.pipeTo(raw).catch(()=>close());
    let timer:ReturnType<typeof setTimeout>|undefined;
    try { const transport=await Promise.race([AdbDaemonTransport.authenticate({serial,connection:{readable,writable:serializer.writable},credentialStore:credentials}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void close();reject(new Error(prompt?'وافق على تصحيح الشبكة على التلفزيون، أو استخدم الاقتران برمز إن كان التلفزيون يعرض Wireless Debugging.':'انتهت مهلة الاتصال المباشر بالتلفزيون.'));},prompt?60000:8000);})]); const adb=new Adb(transport);sessions.set(serial,adb);void adb.disconnected.finally(()=>{sessions.delete(serial);void close();}).catch(()=>{});return adb; }
    catch(e){await close();throw e;}finally{if(timer)clearTimeout(timer);}
  })().finally(()=>opening.delete(serial));opening.set(serial,promise);return promise;
}
async function bounded<T>(adb: Adb, operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void adb.close();reject(new Error('انتهت مهلة العملية على التلفزيون. حدّث الاتصال قبل المحاولة التالية.'));},milliseconds);})]); }
  finally { if(timer)clearTimeout(timer); }
}
export async function executeAndroid(_tool: string, args: string[], timeout=15000): Promise<string> {
  if(args[0]==='pair'){
    const [host,port]=args[1].split(':');localHost(host);if(!/^\d{6}$/.test(args[2])||!Number.isInteger(Number(port))||Number(port)<1024||Number(port)>65535)throw new Error('أدخل رمزًا من 6 أرقام ومنفذ الاقتران.');
    if(!secrets.adb)await credentials.generateKey();await NativeAdb.pair({host,port:Number(port),code:args[2],key:secrets.adb});secrets['tls:'+host]='1';await saveSecrets();return 'Successfully paired';
  }
  const [tlsHost,tlsPort]=args[1].split(':');
  if(secrets['tls:'+tlsHost]){
    localHost(tlsHost);const command=args[0]==='connect'||args[2]==='get-state'?'echo FLIX_CONNECTED':args.slice(3).map(v=>"'"+v.replace(/'/g,"'\\''")+"'").join(' ');
    const r=await NativeAdb.shell({host:tlsHost,port:Number(tlsPort)||5555,key:secrets.adb,command});
    if(args[0]==='connect'||args[2]==='get-state'){if(!r.output.includes('FLIX_CONNECTED'))throw new Error('لم يؤكد التلفزيون اتصال ADB.');return args[0]==='connect'?'connected':'device';}return r.output;
  }
  const serial=args[0]==='connect'?args[1]:args[1];const [host,p]=serial.split(':');const adb=await android(host,Number(p)||5555,args[0]==='connect');
  if(args[0]==='connect')return 'connected';if(args[2]==='get-state')return 'device';if(args[2]!=='shell')throw new Error('Unsupported ADB operation');
  const command=args.slice(3).map(v=>"'"+v.replace(/'/g,"'\\''")+"'").join(' ');return bounded(adb,adb.createSocketAndWait('shell:'+command),timeout);
}
export async function installApk(host: string,port: number, bytes: Uint8Array,id: string) {
  if(secrets['tls:'+host]){const {Filesystem,Directory}=await import('@capacitor/filesystem');const uri=await Filesystem.getUri({path:'packages/'+id,directory:Directory.Data});const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))].map(v=>v.toString(16).padStart(2,'0')).join('');return (await NativeAdb.install({host:localHost(host),port,key:secrets.adb,uri:uri.uri,id,sha256:hash})).output;}
  if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid package');const adb=await android(host,port);const remote='/data/local/tmp/flix-'+id+'.apk';const sync=await adb.sync();
  try { await bounded(adb,sync.write({filename:remote,file:new ReadableStream<MaybeConsumable<Uint8Array>>({start(c){for(let i=0;i<bytes.length;i+=65536)c.enqueue(bytes.subarray(i,i+65536));c.close();}})}),180000);const output=await bounded(adb,adb.createSocketAndWait('shell:pm install -r '+remote),120000);if(!/(?:^|\r?\n)Success(?:\r?\n|$)/.test(output))throw new Error(output.slice(0,500)||'لم يؤكد التلفزيون التثبيت.');return output.trim(); }
  finally {await sync.dispose();await bounded(adb,adb.createSocketAndWait('shell:rm -f '+remote),5000).catch(()=>{});}
}
export function closeAndroid() {for(const a of sessions.values())void a.close();sessions.clear();}
