import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const files=[path.resolve('../flix-s/tools/tv-remote-server.mjs')];
if(process.env.REMOTE_SERVER_SOURCE)files.push(path.resolve(process.env.REMOTE_SERVER_SOURCE));
for(const file of [...new Set(files)]){
 const source=readFileSync(file,'utf8');
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const statements=ast.statements.map(node=>node.getText(ast));
 const fn=(name:string)=>{
  const node=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  assert.ok(node,`${name} exists`);return node.getText(ast);
 };
 test(`${path.basename(path.dirname(path.dirname(file)))}: background startup and timers never invoke TV writers`,()=>{
  const startup=statements.filter(text=>text.includes('watchForAddresses()')&&!text.startsWith('function'));
  assert.equal(startup.length,1);
  const timers=statements.filter(text=>text.startsWith('setInterval(')&&['watchSoundOutput()','watchNight()','watchKeepAwake()'].some(name=>text.includes(name)));
  assert.equal(timers.length,3);
  for(const background of [true,false]){
   const invoked:string[]=[];
   const context={BACKGROUND_ONLY:background,SOUND_WATCH_MS:1,NIGHT_WATCH_MS:1,KEEP_AWAKE_MS:1,
    setInterval:(callback:()=>void)=>{callback();return {unref(){}};},
    ...Object.fromEntries(['watchForAddresses','watchSoundOutput','watchNight','watchKeepAwake'].map(name=>[name,()=>invoked.push(name)]))};
   vm.runInNewContext([...startup,...timers].join('\n'),context);
   assert.deepEqual(invoked,background?[]:['watchForAddresses','watchSoundOutput','watchNight','watchKeepAwake']);
  }
 });
 test(`${file}: automatic network-power settings cannot run in background mode`,async()=>{
  for(const background of [true,false]){
   let writes=0;const context=vm.createContext({BACKGROUND_ONLY:background,enablingNow:new Set(),POWER_FILE:'fixture',
    wantsNetworkPower:()=>true,readPowerBook:()=>({'fixture-host':{}}),enableNetworkPower:async()=>{writes++;}});
   await vm.runInContext(fn('maybeEnableNetworkPower')+'\nmaybeEnableNetworkPower("fixture-host")',context);
   assert.equal(writes,background?0:1);
  }
 });
 test(`${file}: sound-route event also returns before accessing player repair in background mode`,async()=>{
  // No player or TV dependencies are supplied: reaching any repair code must fail this test.
  await vm.runInNewContext(fn('handleSoundMove')+'\nhandleSoundMove("fixture-host", "old", "new", "test")',{BACKGROUND_ONLY:true});
 });
}
