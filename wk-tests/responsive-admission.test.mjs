import test from 'node:test';
import assert from 'node:assert/strict';
import {KaraokeConnection} from '../wk/relay-client.mjs';
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
test('new relay removes 1.25 seconds of back-to-back command cooldown',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});
 for(const interval of [undefined,300,0,NaN,20000]){
  const sent=[];let approved=false;
  const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{
   const b=JSON.parse(o.body);if(b.op==='search')sent.push(Date.now());
   return Response.json({ok:true,server:'WKQ1 WKS1 WKT1 PC',timing:{sendIntervalMs:interval},...(b.op==='result'?{pending:!approved,result:approved}:{})});
  }});
  try{
   await c.connect('12345678','Phone');approved=true;await c.addVideo('abcdefghijk','a'.repeat(32),'ko-KR','Song');
   approved=false;let done=false;const second=c.addVideo('bcdefghijkl','b'.repeat(32),'ko-KR','Next song').then(v=>{done=true;return v;});await flush();
   const expected=interval===300?300:1550;t.mock.timers.tick(expected-1);await flush();assert.equal(sent.length,1);
   t.mock.timers.tick(1);await flush();assert.equal(sent.length,2);assert.equal(sent[1]-sent[0],expected);assert.equal(done,false,'must not claim reservation before PC acknowledgement');
   approved=true;t.mock.timers.tick(250);await flush();assert.equal((await second).ok,true);
  }finally{await c.disconnect();}
 }
});
