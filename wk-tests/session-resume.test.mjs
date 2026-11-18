import test from 'node:test';
import assert from 'node:assert/strict';
import {KaraokeConnection} from '../wk/relay-client.mjs';
import {bindPhoneLifecycle} from '../wk/phone-lifecycle.mjs';
const server='WKQ1 WKS1 WKT1 WKC1 WKV1 WKL1 Room 5';
const flush=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
const advance=async(t,ms)=>{t.mock.timers.tick(ms);await flush();};
const storage=()=>{const values=new Map();return {values,getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
function harness(options={}){
 const calls=[],sessions=new Map(),saved=storage();let network=true,online=true,full=false;
 const fetch=async(_,request)=>{
  const b=JSON.parse(request.body);calls.push({...b,at:Date.now()});
  if(!network)throw new TypeError('connection interrupted');
  const ok=extra=>Response.json({ok:true,...extra});const fail=code=>Response.json({ok:false,code},{status:400});
  if(b.op==='join'){
   if(full&&!sessions.has(b.key))return fail('full');
   sessions.set(b.key,Date.now());return ok({server,timing:{sendIntervalMs:300},capabilities:{p2TvMenu:1}});
  }
  if(b.op==='leave'){sessions.delete(b.key);return ok();}
  if(!sessions.has(b.key)||Date.now()-sessions.get(b.key)>60000)return fail('disconnected');
  sessions.set(b.key,Date.now());
  if(b.op==='ping')return ok({capabilities:{p2TvMenu:1}});
  if(b.op==='search')return ok();
  return ok({pending:false,result:true});
 };
 const connection=new KaraokeConnection(null,()=>{},{storage:saved,isOnline:()=>online,fetch,...options});
 return{connection,calls,sessions,saved,fetch,setNetwork:v=>network=v,setOnline:v=>online=v,setFull:v=>full=v};
}
function events(){const listeners=new Map();return {hidden:false,addEventListener(name,fn){const handlers=listeners.get(name)||[];handlers.push(fn);listeners.set(name,handlers);},fire(name){for(const fn of listeners.get(name)||[])fn();}};}

test('return after a long call reclaims the same identity without Leave or command replay',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const h=harness(),c=h.connection;
 try{await c.connect('12345678','ไทย');const key=c.key,g=c.generation;c.suspend();await advance(t,180000);
  assert.equal(c.state,'reconnecting');assert.equal(h.calls.length,1);assert.equal(await c.resume(),true);
  assert.equal(c.state,'ready');assert.equal(c.key,key);assert.equal(c.generation,g);assert.ok(c.tvMenuSupported&&c.playlistSupported);
  assert.deepEqual(h.calls.map(b=>b.op),['join','ping','join']);assert.equal(new Set(h.calls.map(b=>b.key)).size,1);assert.equal(h.sessions.size,1);
 }finally{await c.disconnect();}
});
test('overlapping Android/iPhone lifecycle events recover once and stop the microphone',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const h=harness(),c=h.connection,doc=events(),win=events();let micStops=0;
 bindPhoneLifecycle({connection:c,doc,win,onSuspend:()=>micStops++});
 try{await c.connect('12345678','Phone');doc.hidden=true;doc.fire('visibilitychange');win.fire('pagehide');doc.fire('freeze');await advance(t,180000);
  assert.equal(h.calls.length,1);assert.equal(micStops,3);doc.hidden=false;doc.fire('visibilitychange');win.fire('pageshow');win.fire('focus');win.fire('online');doc.fire('resume');await flush();
  assert.equal(c.state,'ready');assert.deepEqual(h.calls.map(b=>b.op),['join','ping','join']);
 }finally{await c.disconnect();}
});
test('short app switch keeps the existing server session',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const h=harness(),c=h.connection;
 try{await c.connect('12345678','Phone');c.suspend();await advance(t,15000);await c.resume();assert.equal(c.state,'ready');assert.deepEqual(h.calls.map(b=>b.op),['join','ping']);}
 finally{await c.disconnect();}
});
test('offline phone retains credentials and restores on the online event',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const h=harness(),c=h.connection,doc=events(),win=events();bindPhoneLifecycle({connection:c,doc,win});
 try{await c.connect('12345678','Phone');const key=c.key;h.setOnline(false);h.setNetwork(false);win.fire('offline');win.fire('focus');await advance(t,120000);
  assert.equal(h.calls.length,1);assert.equal(c.key,key);assert.equal(c.state,'reconnecting');h.setOnline(true);h.setNetwork(true);win.fire('online');await flush();assert.equal(c.state,'ready');assert.equal(c.key,key);
 }finally{await c.disconnect();}
});
test('sustained network failures never erase the room or send Leave',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const h=harness(),c=h.connection;
 try{await c.connect('12345678','Phone');const key=c.key;h.setNetwork(false);for(const ms of [10000,2000,2000,2000,4000])await advance(t,ms);
  assert.equal(c.state,'reconnecting');assert.equal(c.key,key);assert.equal(c.room,'12345678');assert.equal(h.calls.some(b=>b.op==='leave'),false);
  h.setNetwork(true);await advance(t,8000);assert.equal(c.state,'ready');assert.equal(c.key,key);
 }finally{await c.disconnect();}
});
test('an occupied room backs off and later restores without stealing another phone slot',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const h=harness(),c=h.connection;
 try{await c.connect('12345678','Phone');const key=c.key;c.suspend();h.sessions.clear();h.setFull(true);await advance(t,120000);await c.resume();
  assert.equal(c.state,'reconnecting');const count=h.calls.length;await advance(t,59999);assert.equal(h.calls.length,count);
  h.setFull(false);await advance(t,1);assert.equal(c.state,'ready');assert.equal(c.key,key);assert.equal(h.sessions.size,1);
 }finally{await c.disconnect();}
});
test('browser reload restores the tab session, capabilities and room without replaying work',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const h=harness(),old=h.connection;let restored;
 try{await old.connect('12345678','ไทย');const key=old.key;await old.control('next','a'.repeat(32),'th-TH');old.suspend();await advance(t,180000);
  const before=h.calls.length;restored=new KaraokeConnection(null,()=>{},{storage:h.saved,fetch:h.fetch});assert.equal(restored.restore('12345678'),true);await flush();
  assert.equal(restored.state,'ready');assert.equal(restored.key,key);assert.ok(restored.controlSupported&&restored.tvMenuSupported);assert.deepEqual(h.calls.slice(before).map(b=>b.op),['join']);
 }finally{await old.disconnect();await restored?.disconnect();}
});
test('a different QR room never restores an old room',async()=>{
 const h=harness(),c=h.connection;try{await c.connect('12345678','Phone');c.suspend();const other=new KaraokeConnection(null,()=>{},{storage:h.saved,fetch:h.fetch});assert.equal(other.restore('87654321'),false);assert.equal(other.state,'idle');assert.equal(h.saved.values.size,0);assert.equal(h.calls.length,1);}finally{await c.disconnect();}
});
test('invalid or expired tab records are discarded, and blocked storage remains usable',async()=>{
 const saved=storage();for(const value of ['{','null',JSON.stringify({v:1,room:'12345678',key:'a'.repeat(64),name:'Phone',at:Date.now()-13*3600000}),JSON.stringify({v:1,room:'wrong',key:'a'.repeat(64),name:'Phone',at:Date.now()})]){saved.setItem('wk-phone-session-v1',value);const c=new KaraokeConnection(null,()=>{},{storage:saved});assert.equal(c.restore(),false);assert.equal(saved.values.size,0);}
 const blocked={getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}};const h=harness({storage:blocked});try{assert.equal(h.connection.restore(),false);await h.connection.connect('12345678','Phone');h.connection.suspend();await h.connection.resume();assert.equal(h.connection.state,'ready');}finally{await h.connection.disconnect();}
});
test('explicit Disconnect clears recovery and saved credentials permanently',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const h=harness(),c=h.connection;
 await c.connect('12345678','Phone');h.setNetwork(false);c.suspend();await c.resume();assert.equal(c.state,'reconnecting');await c.disconnect();await flush();const count=h.calls.length;
 h.setNetwork(true);await advance(t,120000);await c.resume();assert.equal(c.restore(),false);assert.equal(c.state,'idle');assert.equal(h.saved.values.size,0);assert.equal(h.calls.length,count);
});
test('late recovery cannot overwrite a new room after explicit disconnect',async()=>{
 let resolve;const calls=[];let block=false;const c=new KaraokeConnection(null,()=>{},{fetch:async(_,o)=>{const b=JSON.parse(o.body);calls.push(b);if(block&&b.op==='ping')return new Promise(r=>resolve=r);return Response.json({ok:true,server});}});
 try{await c.connect('12345678','Phone');block=true;c.suspend();const recovering=c.resume();await flush();await c.disconnect();await c.connect('87654321','Phone');resolve(Response.json({ok:false,code:'disconnected'},{status:400}));await recovering;
  assert.equal(c.room,'87654321');assert.equal(c.state,'ready');assert.equal(calls.filter(b=>b.op==='join'&&b.room==='12345678').length,1);
 }finally{await c.disconnect();}
});
test('permission refusal terminates recovery instead of joining again',async()=>{
 let deny=false;const calls=[];const c=new KaraokeConnection(null,()=>{},{fetch:async(_,o)=>{const b=JSON.parse(o.body);calls.push(b);return deny?Response.json({ok:false,code:'permission'},{status:403}):Response.json({ok:true,server});}});
 try{await c.connect('12345678','Phone');deny=true;c.suspend();await c.resume();assert.equal(c.state,'error');assert.equal(c.key,null);assert.equal(calls.filter(b=>b.op==='join').length,1);}finally{await c.disconnect();}
});
test('an in-flight reservation remains locked during recovery and is submitted only once',async()=>{
 let finish;const calls=[];const c=new KaraokeConnection(null,()=>{},{fetch:async(_,o)=>{const b=JSON.parse(o.body);calls.push(b);if(b.op==='result')return new Promise(r=>finish=r);return Response.json({ok:true,server});}});
 try{await c.connect('12345678','Phone');const reserving=c.addVideo('abcdefghijk','b'.repeat(32),'th-TH','เพลง');await flush();c.suspend();await c.resume();assert.equal(c.state,'sending');await assert.rejects(c.search('second','ko-KR'),e=>e.code==='disconnected');
  finish(Response.json({ok:true,pending:false,result:true}));assert.equal((await reserving).ok,true);assert.equal(c.state,'ready');assert.equal(calls.filter(b=>b.op==='search').length,1);
 }finally{await c.disconnect();}
});
test('an interrupted Next retry is not replayed when returning after a long call',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const calls=[];let lost=true;
 const c=new KaraokeConnection(null,()=>{},{fetch:async(_,o)=>{const b=JSON.parse(o.body);calls.push(b);if(b.op==='result'&&lost)throw new TypeError('lost response');return Response.json({ok:true,server,pending:false,result:true});}});
 try{await c.connect('12345678','Phone');const action=c.control('next','c'.repeat(32),'th-TH');const rejected=assert.rejects(action,e=>e.code==='disconnected');await flush();c.suspend();await advance(t,180000);await rejected;lost=false;await c.resume();assert.equal(c.state,'ready');assert.equal(calls.filter(b=>b.op==='search').length,1);}
 finally{await c.disconnect();}
});
