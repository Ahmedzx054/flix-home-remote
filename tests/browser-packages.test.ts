import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error shared browser server is plain JavaScript
import {packageLibrary,receivePackage} from '../../flix-s/tools/remote-packages.mjs';
test('browser package library persists new apps and replaces versions without installing',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'flix-packages-'));
 try{
  const library=packageLibrary(directory),payload={name:'FLIX New',appId:'com.flix.new',version:'1.0',filename:'new.ipk',data:Buffer.from('!<arch>\nfixture-package').toString('base64')};
  const first=library.add(payload);assert.equal(library.list('webos').length,1);assert.equal(library.list('android').length,0);assert.equal(readFileSync(library.list('webos')[0].full).toString(),'!<arch>\nfixture-package');
  library.add({...payload,version:'2.0'});assert.equal(library.list('webos').length,1);assert.equal(library.list('webos')[0].version,'2.0');assert.equal(packageLibrary(directory).list('webos')[0].key,first.key);
  assert.throws(()=>library.add({...payload,filename:'../bad.ipk'}));assert.throws(()=>library.add({...payload,filename:'bad.apk'}));assert.throws(()=>library.add({...payload,data:'invalid#base64'}));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('browser upload rejects a cross-origin request before accepting package data',async()=>{
 await assert.rejects(receivePackage({headers:{origin:'https://other.example','content-type':'application/json',host:'remote.example'}}),/مصدر الطلب/);
});
