import test from 'node:test';
import assert from 'node:assert/strict';
import {KaraokeConnection} from '../wk/relay-client.mjs';
const request='c'.repeat(32),server='WKQ1 WKS1 WKT1 WKC1 WKV1 TEST-PC';
const reply=extra=>Response.json({ok:true,server,pending:false,result:true,...extra});
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));

test('lost next acknowledgement automatically retries same command and relay job',async()=>{
 const calls=[],commands=new Set();let lost=true,advances=0;
 const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{
  const b=JSON.parse(o.body);calls.push(b);
  if(b.op==='search'&&!commands.has(b.text)){commands.add(b.text);advances++;}
  if(b.op==='result'&&lost){lost=false;throw new TypeError('temporary network loss');}
  return reply();
 }});
 try{
  await c.connect('12345678','Android');assert.equal((await c.control('next',request,'ko-KR')).ok,true);
  const jobs=calls.filter(x=>x.op==='search');assert.equal(jobs.length,2);assert.equal(jobs[0].id,jobs[1].id);assert.equal(jobs[0].text,jobs[1].text);assert.equal(advances,1);
 }finally{await c.disconnect();}
});
test('temporary server busy retries with same command nonce after pacing delay',async()=>{
 const jobs=[];let first=true;
 const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{const b=JSON.parse(o.body);if(b.op==='search'){jobs.push({...b,at:Date.now()});if(first){first=false;return Response.json({ok:false,code:'busy'},{status:429});}}return reply();}});
 try{await c.connect('12345678','iPhone');assert.equal((await c.control('next',request,'th-TH')).ok,true);assert.equal(jobs.length,2);assert.equal(jobs[0].text,jobs[1].text);assert.ok(jobs[1].at-jobs[0].at>=1500);}finally{await c.disconnect();}
});
test('retry stays sending and disconnect cancels delayed next without replay into new room',async()=>{
 const calls=[];let fail=true;
 const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{const b=JSON.parse(o.body);calls.push(b);if(b.op==='result'&&fail)throw new TypeError('offline');return reply();}});
 try{
  await c.connect('12345678','phone');const pending=c.control('next',request,'ko-KR');const rejected=assert.rejects(pending,e=>e.code==='disconnected');
  await tick();assert.equal(c.state,'sending');await assert.rejects(c.search('another song','ko-KR'),e=>e.code==='disconnected');
  await c.disconnect();fail=false;await c.connect('87654321','phone');await rejected;
  assert.equal(calls.filter(x=>x.op==='search').length,1);assert.equal(c.room,'87654321');assert.equal(c.state,'ready');
 }finally{await c.disconnect();}
});
test('PC failure acknowledgement and permission errors are never retried',async()=>{
 for(const mode of ['pc-failed','permission']){
  let searches=0;
  const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{const b=JSON.parse(o.body);if(b.op==='search')searches++;if(b.op==='result')return mode==='pc-failed'?reply({result:false}):Response.json({ok:false,code:'permission'},{status:403});return reply();}});
  try{await c.connect('12345678','phone');if(mode==='pc-failed')assert.equal((await c.control('next',request,'ko-KR')).ok,false);else await assert.rejects(c.control('next',request,'ko-KR'),e=>e.code==='permission');assert.equal(searches,1);}finally{await c.disconnect();}
 }
});
test('temporary command request timeout recovers without a new nonce',async()=>{
 let failed=false;const jobs=[];
 const c=new KaraokeConnection(null,()=>{},{requestMs:20,fetch:async(u,o)=>{const b=JSON.parse(o.body);if(b.op==='search'){jobs.push(b);if(!failed){failed=true;return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));}}return reply();}});
 try{await c.connect('12345678','phone');assert.equal((await c.control('next',request,'ko-KR')).ok,true);assert.equal(jobs.length,2);assert.equal(jobs[0].id,jobs[1].id);assert.equal(jobs[0].text,jobs[1].text);}finally{await c.disconnect();}
});
test('persistent transient failure stops after three attempts and keeps retry identity',async()=>{
 const jobs=[];
 const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{const b=JSON.parse(o.body);if(b.op==='search'){jobs.push(b);throw new TypeError('offline');}return reply();}});
 try{await c.connect('12345678','phone');await assert.rejects(c.control('next',request,'ko-KR'),e=>e.code==='connect');assert.equal(jobs.length,3);assert.equal(new Set(jobs.map(x=>x.id)).size,1);assert.equal(new Set(jobs.map(x=>x.text)).size,1);assert.equal(c.state,'ready');}finally{await c.disconnect();}
});
