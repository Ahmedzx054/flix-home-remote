import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { transform } from 'esbuild';
const root=path.resolve(import.meta.dirname,'..');
const original=path.resolve(root,'../flix-s/tools/tv-remote.html');
const target=path.join(root,'src/remote-page/source.html');
if(!fs.existsSync(original)) {
 const receipt=JSON.parse(fs.readFileSync(path.join(root,'src/remote-page/source.json'),'utf8'));
 for(const [file,hash] of [[target,receipt.bundledSha256],[path.join(root,'src/remote-page/picture-rules.js'),receipt.pictureBundledSha256],[path.join(root,'src/remote-page/bluetooth-rules.js'),receipt.bluetoothBundledSha256]]){
  if(!hash||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw Error('Bundled remote source receipt mismatch');
 }
 process.exit(0);
}
let html=fs.readFileSync(original,'utf8');
const sourceSha256=crypto.createHash('sha256').update(html).digest('hex');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
for(const match of scripts){
 let code=match[1];
 code=code.replace("document.getElementById('tvPick').addEventListener", "window.flixRemote.useHost = useHost;\n  document.getElementById('tvPick').addEventListener");
 if(code.includes('const FLIX_REMOTE_BASE =')){const begin=code.indexOf('const FLIX_REMOTE_BASE ='),end=code.indexOf('(() => {',begin);code=code.slice(0,begin)+code.slice(end);}
 code=code.replace('const HOUSE = `http://${location.hostname}:3000`;','const HOUSE = "https://flix-s-neon.vercel.app";').replace('const HOUSE_IPTV = `http://${location.hostname}:3002`;','const HOUSE_IPTV = "https://flix-iptv-snowy.vercel.app";');
 const built=await transform(code,{loader:'js',legalComments:'none',target:'es2022'});
 html=html.replace(match[0],'<script>'+built.code.replace(/<\/script/gi,'<\\/script')+'</script>');
}
html=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<style>([\s\S]*?)<\/style>/g,(_,css)=>'<style>'+css.replace(/\/\*[\s\S]*?\*\//g,'')+'</style>');
html=html.replaceAll('192.168.8.241','192.168.1.30').replaceAll('تعذّر الوصول للخادم في البيت','تعذّر الاتصال بالتلفزيون من الجوال');
const pictureSource=fs.readFileSync(path.resolve(root,'../flix-s/tools/tv-picture.mjs'),'utf8');
const picture=(await transform(pictureSource.replace('"./tv-network-power.mjs"','"./webos-settings.ts"'),{loader:'js',legalComments:'none',target:'es2022'})).code;
const bluetoothSource=fs.readFileSync(path.resolve(root,'../flix-s/tools/tv-bluetooth.mjs'),'utf8');
const bluetooth=(await transform(bluetoothSource,{loader:'js',legalComments:'none',target:'es2017'})).code;
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,html);
fs.writeFileSync(path.join(root,'src/remote-page/picture-rules.js'),picture);
fs.writeFileSync(path.join(root,'src/remote-page/bluetooth-rules.js'),bluetooth);
fs.writeFileSync(path.join(root,'src/remote-page/source.json'),JSON.stringify({source:'local_apps/flix-s/tools/tv-remote.html',sourceSha256,bundledSha256:crypto.createHash('sha256').update(html).digest('hex'),pictureSourceSha256:crypto.createHash('sha256').update(pictureSource).digest('hex'),pictureBundledSha256:crypto.createHash('sha256').update(picture).digest('hex'),bluetoothBundledSha256:crypto.createHash('sha256').update(bluetooth).digest('hex')},null,2)+'\n');
console.log('Original FLIX remote page synchronized');
