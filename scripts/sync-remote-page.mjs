import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { transform } from 'esbuild';
const root=path.resolve(import.meta.dirname,'..');
const original=path.resolve(root,'../flix-s/tools/tv-remote.html');
const target=path.join(root,'src/remote-page/source.html');
if(!fs.existsSync(original)) {
 const receipt=JSON.parse(fs.readFileSync(path.join(root,'src/remote-page/source.json'),'utf8'));
 for(const [file,hash] of [[target,receipt.bundledSha256],...['picture','bluetooth','keep-awake','voice-commands','voice-executor'].map(name=>[path.join(root,'src/remote-page/'+name+'-rules.js'),receipt[name+'BundledSha256']])]){
  if(!hash||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw Error('Bundled remote source receipt mismatch');
 }
 process.exit(0);
}
let html=fs.readFileSync(original,'utf8');
const sourceSha256=crypto.createHash('sha256').update(html).digest('hex');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
for(const match of scripts){
 let code=match[1].replace(/\r\n/g,'\n');
 code=code.replace("document.getElementById('tvPick').addEventListener", "window.flixRemote.useHost = useHost;\n  document.getElementById('tvPick').addEventListener");
 if(code.includes('const FLIX_REMOTE_BASE =')){const begin=code.indexOf('const FLIX_REMOTE_BASE ='),end=code.indexOf('(() => {',begin);code=code.slice(0,begin)+code.slice(end);}
 code=code.replace('const HOUSE = `http://${location.hostname}:3000`;','const HOUSE = "https://flix-s-neon.vercel.app";').replace('const HOUSE_IPTV = `http://${location.hostname}:3002`;','const HOUSE_IPTV = "https://flix-iptv-snowy.vercel.app";');
 code=code.replace("line('مدة المشاهدة', hours(data.seconds))","line('التقدم المحفوظ', hours(data.seconds))").replace("body.append(\n      line('الأجهزة'","if(data.scopeText)body.append(el('p','exNote',data.scopeText));\n    body.append(\n      line('الأجهزة'");
 const built=await transform(code,{loader:'js',legalComments:'none',target:'es2022'});
 html=html.replace(match[0],'<script>'+built.code.replace(/<\/script/gi,'<\\/script')+'</script>');
}
html=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<style>([\s\S]*?)<\/style>/g,(_,css)=>'<style>'+css.replace(/\/\*[\s\S]*?\*\//g,'')+'</style>');
html=html.replaceAll('192.168.8.241','192.168.1.30').replaceAll('تعذّر الوصول للخادم في البيت','تعذّر الاتصال بالتلفزيون من الجوال');
const pictureSource=fs.readFileSync(path.resolve(root,'../flix-s/tools/tv-picture.mjs'),'utf8');
const picture=(await transform(pictureSource.replace('"./tv-network-power.mjs"','"./webos-settings.ts"'),{loader:'js',legalComments:'none',target:'es2022'})).code;
const bluetoothSource=fs.readFileSync(path.resolve(root,'../flix-s/tools/tv-bluetooth.mjs'),'utf8');
const bluetooth=(await transform(bluetoothSource,{loader:'js',legalComments:'none',target:'es2017'})).code;
const keepSource=fs.readFileSync(path.resolve(root,'../flix-s/tools/tv-keep-awake.mjs'),'utf8');
const keep=(await transform(keepSource
 .replace('var listener = new PalmServiceBridge();','w.__flixKeepAwakeReady=false;w.__flixKeepAwakeError="";var listener = new PalmServiceBridge();')
 .replace('if (!message || message.timestamp === undefined) return;','if(message && message.returnValue===false){w.__flixKeepAwakeError=message.errorText||"TV refused";return;}if(message && message.subscribed===true)w.__flixKeepAwakeReady=true;if (!message || message.timestamp === undefined) return;')
 .replace('w.__flixKeepAwake = null;','w.__flixKeepAwake = null;w.__flixKeepAwakeReady=false;'),{loader:'js',legalComments:'none',target:'es2017'})).code;
const commandsSource=fs.readFileSync(path.resolve(root,'../flix-s/tools/voice-commands.mjs'),'utf8');
const commands=(await transform(commandsSource
 .replace('token === "بعدين"','token === "بعدين" || token === "بعدها" || token === "وبعدها"')
 .replace('export function splitOrders(text) {','const isSplitVerb=token=>SPLIT_VERBS.has(VERB_OF.get(token)||"")||["رجوع","ارجع","فوق","تحت","يمين","يسار","home","back"].includes(token);\nexport function splitOrders(text) {')
 .replace('SPLIT_VERBS.has(VERB_OF.get(token.slice(1)) || "")','isSplitVerb(token.slice(1))')
 .replace('SPLIT_VERBS.has(VERB_OF.get(tokens[index + 1] || "") || "")','isSplitVerb(tokens[index+1]||"")'),{loader:'js',legalComments:'none',target:'es2022'})).code;
const executorSource=fs.readFileSync(path.resolve(root,'../flix-s/tools/voice-executor.mjs'),'utf8');
let executor=executorSource.replace(/^import (?:fs|path|\{ randomUUID \}).*\r?\n/gm,'')
 .replace('"./voice-commands.mjs"','"./voice-commands-rules.js"');
const poolStart=executor.indexOf('let pool = null;'),executorStart=executor.indexOf('export function createVoiceExecutor');
if(poolStart<0||executorStart<poolStart)throw Error('Original voice source layout changed');
executor=executor.slice(0,poolStart)+'const randomUUID=()=>crypto.randomUUID();\nconst loadTitlePool=async()=>[];\n'+executor.slice(executorStart);
const jsonStart=executor.indexOf('  async function houseJson('),jsonEnd=executor.indexOf('  async function screen(',jsonStart);
executor=executor.slice(0,jsonStart)+'  const houseJson=(route,timeoutMs=8000)=>options.houseJson(route,timeoutMs);\n'+executor.slice(jsonEnd);
const modelStart=executor.indexOf('  let modelProbe ='),runStart=executor.indexOf('  async function run(',modelStart);
executor=executor.slice(0,modelStart)+'  const modelEndpoint=async()=>"";\n  const askModel=async()=>null;\n'+executor.slice(runStart);
const sleepStart=executor.indexOf('      case "sleep": {'),sleepEnd=executor.indexOf('      case "volume":',sleepStart);
executor=executor.slice(0,sleepStart)+'      case "sleep": return {ok:false,error:"اضبط مؤقت الإطفاء من إعدادات التلفزيون؛ لا يضمن الجوال تشغيل مؤقته بعد إغلاق التطبيق."};\n'+executor.slice(sleepEnd);
executor=executor.replace('const muted = Boolean(answer?.volumeStatus?.muteStatus ?? answer?.muted);','const rawMuted=answer?.volumeStatus?.muteStatus ?? answer?.volumeStatus?.muted ?? answer?.volumeStatus?.mute ?? answer?.muted ?? answer?.mute; if(typeof rawMuted!=="boolean")return null; const muted=rawMuted;')
 .replace('if (intent.op === "mute" || intent.op === "unmute") { await tv.press("MUTE", host);','if (intent.op === "unmute") return {ok:false,error:"التلفزيون لا يعيد حالة الكتم؛ استخدم زر الكتم وراقب الشاشة.",verified:false}; if (intent.op === "mute") { await tv.press("MUTE", host);');
executor=executor.replace(/^  const house =.*\r?\n/m,'').replace(/^  const sleepTimers =.*\r?\n/m,'');
executor=(await transform(executor,{loader:'js',legalComments:'none',target:'es2022'})).code;
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,html);
fs.writeFileSync(path.join(root,'src/remote-page/picture-rules.js'),picture);
fs.writeFileSync(path.join(root,'src/remote-page/bluetooth-rules.js'),bluetooth);
const extra={'keep-awake':keep,'voice-commands':commands,'voice-executor':executor};
for(const [name,code] of Object.entries(extra))fs.writeFileSync(path.join(root,'src/remote-page/'+name+'-rules.js'),code);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
fs.writeFileSync(path.join(root,'src/remote-page/source.json'),JSON.stringify({source:'local_apps/flix-s/tools/tv-remote.html',sourceSha256,bundledSha256:digest(html),pictureSourceSha256:digest(pictureSource),...Object.fromEntries(Object.entries({picture,bluetooth,...extra}).map(([name,code])=>[name+'BundledSha256',digest(code)])),keepAwakeSourceSha256:digest(keepSource),voiceCommandsSourceSha256:digest(commandsSource),voiceExecutorSourceSha256:digest(executorSource)},null,2)+'\n');
console.log('Original FLIX remote page synchronized');
