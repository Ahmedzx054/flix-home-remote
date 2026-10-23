// Single remote source -> hashed native UI update. Build/release always stages this output.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),html=readFileSync(path.join(root,'src/remote-page/source.html'),'utf8');
const sha256=createHash('sha256').update(html).digest('hex'),version=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version;
const output=path.resolve(root,'../flix-s/public/home-remote/ui');mkdirSync(output,{recursive:true});
const release={schema:1,bridge:1,version,sha256,bytes:Buffer.byteLength(html),path:'/home-remote/ui/page-'+sha256+'.html'};
writeFileSync(path.join(output,'page-'+sha256+'.html'),html);writeFileSync(path.join(output,'release.json'),JSON.stringify(release,null,2)+'\n');
console.log(JSON.stringify({stagedUI:true,sha256,bytes:release.bytes,bridge:1}));
