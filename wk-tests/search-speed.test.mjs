import test from 'node:test';
import assert from 'node:assert/strict';
import {KaraokeConnection} from '../wk/relay-client.mjs';

const server='WKQ1 WKS1 WKT1 WKC1 WKV1 WKL1 TEST-PC';
const queue={v:1,kind:'queue',page:0,total:0,items:[]};
const searchCatalog={v:1,error:null,items:[{id:'abcdefghijk',title:'Search result',channel:'Singer',duration:'3:00'}]};
const reply=extra=>Response.json({ok:true,server,pending:false,result:true,...extra});
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const startClock=t=>t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});
const advance=async(t,ms)=>{t.mock.timers.tick(ms);await flush();};

test('ready search result is picked up sooner without shortening the PC timeout',async t=>{
 startClock(t);
 async function run(waitMs){
  const started=Date.now();let done=false,finished;
  const c=new KaraokeConnection(null,()=>{},{...(waitMs?{waitMs}:{}),fetch:async(u,o)=>{
   const b=JSON.parse(o.body);return b.op==='result'?reply(Date.now()-started<5000?{pending:true}:{catalog:searchCatalog}):reply();
  }});
  try{
   await c.connect('12345678','Phone');assert.equal(c.searchMs,45000);
   const pending=c.browse('song','ko-KR').then(value=>{finished=Date.now()-started;done=true;return value;});await flush();
   for(let i=0;i<140&&!done;i++)await advance(t,50);
   assert.ok(done);assert.equal((await pending).items[0].title,'Search result');return finished;
  }finally{await c.disconnect();}
 }
 const former=await run(700),current=await run();
 assert.equal(former,5600);assert.equal(current,5000);
});

test('a search takes the next send slot from an unsent queue refresh',async t=>{
 startClock(t);const sent=[];
 const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{const b=JSON.parse(o.body);if(b.op==='search')sent.push({...b,at:Date.now()});return reply({catalog:searchCatalog});}});
 try{
  await c.connect('12345678','Phone');c.nextSend=Date.now()+1550;
  const read=c.playlist(0,'ko-KR');const deferred=assert.rejects(read,e=>e.code==='deferred');await flush();
  await advance(t,100);const searching=c.browse('new song','ko-KR');await flush();await deferred;
  assert.equal(c.state,'sending');assert.equal(sent.length,0);
  await advance(t,1449);assert.equal(sent.length,0);
  await advance(t,1);assert.equal((await searching).items.length,1);
  assert.equal(sent.length,1);assert.match(sent[0].text,/^WKF1:/);assert.equal(sent[0].at,101550);
 }finally{await c.disconnect();}
});

test('foreground command wakes the pending read but never overlaps PC jobs',async t=>{
 startClock(t);let readId,readDone=false,pendingReadChecks=0;const sent=[];
 const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{
  const b=JSON.parse(o.body);
  if(b.op==='search'){sent.push({...b,at:Date.now()});if(b.text.startsWith('WKL1:'))readId=b.id;else assert.ok(readDone,'the first PC job must finish before a second is submitted');}
  if(b.op==='result'&&b.id===readId){pendingReadChecks++;if(pendingReadChecks<3)return reply({pending:true});readDone=true;return reply({catalog:queue});}
  return reply();
 }});
 try{
  await c.connect('12345678','Phone');const read=c.playlist(0,'ko-KR');await flush();assert.equal(pendingReadChecks,1);
  await advance(t,1700);assert.equal(pendingReadChecks,2);
  const next=c.control('next','a'.repeat(32),'ko-KR');await flush();
  assert.equal(pendingReadChecks,3);assert.deepEqual(await read,queue);assert.ok((await next).ok);
  assert.equal(sent.length,2);assert.equal(sent[1].at,101700);assert.equal(c.state,'ready');
 }finally{await c.disconnect();}
});

test('idle background reads retain the 700ms interval',async t=>{
 startClock(t);let checks=0;
 const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{const b=JSON.parse(o.body);if(b.op==='result'){checks++;return reply(checks<2?{pending:true}:{catalog:queue});}return reply();}});
 try{
  await c.connect('12345678','Phone');const read=c.playlist(0,'ko-KR');await flush();
  await advance(t,699);assert.equal(checks,1);await advance(t,1);assert.equal(checks,2);await read;
 }finally{await c.disconnect();}
});

test('slow searches return to the 700ms interval after eight seconds',async t=>{
 startClock(t);const checks=[];
 const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{if(JSON.parse(o.body).op==='result'){checks.push(Date.now());return reply({pending:true});}return reply();}});
 try{
  await c.connect('12345678','Phone');const searching=c.search('song','ko-KR');const disconnected=assert.rejects(searching,e=>e.code==='disconnected');await flush();
  for(let i=0;i<32;i++)await advance(t,250);
  assert.equal(checks.length,33);await advance(t,699);assert.equal(checks.length,33);await advance(t,1);assert.equal(checks.length,34);
  await c.disconnect();await advance(t,700);await disconnected;
 }finally{await c.disconnect();}
});

test('disconnect wakes a deferred queue read and cannot submit the old search into a new room',async t=>{
 startClock(t);const sent=[];
 const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{const b=JSON.parse(o.body);if(b.op==='search')sent.push(b);return reply({catalog:queue});}});
 try{
  await c.connect('12345678','Phone');c.nextSend=Date.now()+1550;
  const read=c.playlist(0,'ko-KR');const rejectedRead=assert.rejects(read,e=>['deferred','disconnected'].includes(e.code));
  const searching=c.search('old song','ko-KR');const rejectedSearch=assert.rejects(searching,e=>e.code==='disconnected');await flush();
  await c.disconnect();await c.connect('87654321','Phone');await advance(t,2000);await rejectedRead;await rejectedSearch;
  assert.equal(sent.length,0);assert.equal(c.state,'ready');assert.equal(c.room,'87654321');
 }finally{await c.disconnect();}
});
