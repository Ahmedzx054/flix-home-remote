import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),page=path.join(root,'flix-s/tools/tv-remote.html'),script=path.join(root,'flix-s/tools/remote-account.js');
if(fs.existsSync(page)&&fs.existsSync(script)){
 let html=fs.readFileSync(page,'utf8').replace(/<!-- FLIX_WEB_ACCOUNT_BEGIN -->[\s\S]*?<!-- FLIX_WEB_ACCOUNT_END -->\s*/g,'');
 html=html.replace(/<meta name="flix-remote-revision" content="[a-f0-9]+">\s*/g,'');
 html=html.replace('<script>','<!-- FLIX_WEB_ACCOUNT_BEGIN -->\n<script>'+fs.readFileSync(script,'utf8').replace(/<\/script/gi,'<\\/script')+'</script>\n<!-- FLIX_WEB_ACCOUNT_END -->\n<script>');
 const revision=createHash('sha256').update(html).digest('hex');
 html=html.replace('<head>','<head>\n<meta name="flix-remote-revision" content="'+revision+'">');fs.writeFileSync(page,html);
}
