import test from 'node:test';
import assert from 'node:assert/strict';
import {KaraokeConnection} from '../wk/relay-client.mjs?v=2.1';
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));

test('browser receiver binding covers join, search, result, ping and leave',async()=>{
 const calls=[];const original=globalThis.fetch;
 globalThis.fetch=async function(url,options){
  // Browser Fetch validates its owning global receiver before it sends anything.
  if(this!==globalThis)throw new TypeError('Illegal invocation');
  calls.push(JSON.parse(options.body).op);
  return Response.json({ok:true,server:'PC',pending:false,result:true});
 };
 const c=new KaraokeConnection(null,()=>{},{pingMs:5});
 try{
  const wrong={fetch:globalThis.fetch};await assert.rejects(wrong.fetch('unused',{}),/Illegal invocation/);
  await c.connect('12345678','iPhone');assert.equal(c.state,'ready');
  assert.equal((await c.search('태국 เพลง','th-TH')).ok,true);
  await new Promise(resolve=>setTimeout(resolve,15));await c.disconnect();await tick();
  for(const op of ['join','search','result','ping','leave'])assert.ok(calls.includes(op),op);
 }finally{await c.disconnect();globalThis.fetch=original;}
});
test('connection timeout resets the button state and reports a timeout code',async()=>{
 const c=new KaraokeConnection(null,()=>{},{requestMs:5,fetch:(u,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))});
 await assert.rejects(c.connect('12345678','Android'),e=>e.code==='networkTimeout');assert.equal(c.state,'error');await c.disconnect();
});
test('HTML access error is reported as an invalid server response',async()=>{
 const c=new KaraokeConnection(null,()=>{},{fetch:async()=>new Response('<html>Forbidden</html>',{status:403})});
 await assert.rejects(c.connect('12345678','Android'),e=>e.code==='response');assert.equal(c.state,'error');await c.disconnect();
});
test('failed join can be retried and leave failures never block reconnect',async()=>{
 let fail=true;
 const c=new KaraokeConnection(null,()=>{},{fetch:(u,o)=>{const b=JSON.parse(o.body);if(b.op==='leave')throw new TypeError('Network unavailable');if(fail)return Promise.reject(new TypeError('Offline'));return Promise.resolve(Response.json({ok:true,server:'PC'}));}});
 await assert.rejects(c.connect('12345678','Android'),e=>e.code==='connect');fail=false;
 await c.connect('12345678','Android');assert.equal(c.state,'ready');await c.disconnect();await tick();
});
test('disconnect invalidates a late join response',async()=>{
 let release;const c=new KaraokeConnection(null,()=>{},{fetch:(u,o)=>JSON.parse(o.body).op==='join'?new Promise(r=>release=r):Promise.resolve(Response.json({ok:true}))});
 const joining=c.connect('12345678','iPhone');await tick();await c.disconnect();release(Response.json({ok:true,server:'PC'}));
 await assert.rejects(joining,e=>e.code==='disconnected');assert.equal(c.state,'idle');
});
