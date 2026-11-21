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

test('negotiated quick results and manual queue buttons confirm one PC job; passive reads keep their own pace',async()=>{
 const calls=[],waits=[];let checks=0;
 const c=new KaraokeConnection(null,()=>{},{fetch:async(_,opt)=>{
  assert.match(opt.headers['Content-Type'],/^text\/plain/);
  const b=JSON.parse(opt.body);calls.push(b);
  if(b.op==='search'){checks=0;assert(b.fastControls);}
  return Response.json({ok:true,server:'WKQ1 WKS1 WKT1 WKC1 WKV1 WKL1 PC',timing:{fastControls:1,sendIntervalMs:130},
   ...(b.op==='result'?{pending:checks++<1,result:true,catalog:{v:1,kind:'queue',total:0,page:0,items:[]}}:{})});
 }});
 c.wait=async ms=>{waits.push(ms);};
 try{
  await c.connect('12345678','Phone');assert(calls[0].fastControls);assert.equal(c.sendMs,130);
  for(const manual of [true,false]){c.nextSend=0;waits.length=0;await c.playlist(0,'ko-KR',manual);assert.equal(waits.at(-1),manual?65:700);}
  assert.equal(calls.filter(b=>b.op==='search').length,2);assert(calls.filter(b=>b.op==='result').every(b=>b.fastControls));
 }finally{await c.disconnect();}
});

test('one foreground submission can return a PC acknowledgement without another HTTP request',async()=>{
 const ops=[];
 const c=new KaraokeConnection(null,()=>{},{fetch:async(_,opt)=>{
  const b=JSON.parse(opt.body);ops.push(b.op);
  if(b.op==='search'){assert(b.waitForAck);return Response.json({ok:true,id:b.id,ack:{ok:true,pending:false,result:true}});}
  return Response.json({ok:true,server:'WKQ1 WKS1 WKT1 WKC1 PC',timing:{fastControls:1,sendIntervalMs:130}});
 }});
 try{
  await c.connect('12345678','Phone');
  assert((await c.control('next','a'.repeat(32),'ko-KR')).ok);
  assert.deepEqual(ops,['join','search']);
 }finally{await c.disconnect();}
});
