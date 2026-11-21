import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RoomConnection} from '../../p2wifi/room-connection.mjs';
import {WifiClient} from '../../p2wifi/wifi-client.mjs';

const room='10000005', qr={label:'5',ticket:'a'.repeat(64)};
const success=(online=true,connected=true)=>({ok:true,online,name:'모의 P2',session:'b'.repeat(32),state:{connected}});
const fail=code=>({ok:false,code});
function fixture(reply) {
 const calls=[], saved=new Map();
 const storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const client=new WifiClient({storage,delay:async()=>{},fetcher:async(_,options)=>{
  const request=JSON.parse(options.body);
  calls.push(request);
  return Response.json(await reply(request));
 }});
 const recovery=new RoomConnection(client,()=>{},()=>true);
 let scheduled=null;
 recovery.schedule=ms=>{scheduled=recovery.target&&!recovery.suspended?ms:null;};
 return {client,recovery,calls,scheduled:()=>scheduled};
}
test('failed first manual join retries in the same room with the same phone key; rate limits back off',async()=>{
 const responses=[fail('offline'),fail('full'),fail('slow'),success()];
 const {client,recovery,calls,scheduled}=fixture(()=>responses.shift());
 recovery.start({room});
 for(const min of [2000,15000,60000]){
  await recovery.check();
  assert(!recovery.ready && scheduled()>=min);
  await assert.rejects(client.send({action:'reserve',number:1}));
 }
 await recovery.check();
 assert(recovery.ready);
 assert.deepEqual(calls.map(x=>x.op),Array(4).fill('join'));
 assert.equal(new Set(calls.map(x=>x.key)).size,1);
 assert(calls.every(x=>x.room===room));
});
test('P2-only outage and return use the existing phone membership',async()=>{
 const states=[success(),success(true,false),success()];
 const {recovery,calls}=fixture(b=>b.op==='resolvePrintRoom'?{ok:true,room}:states.shift());
 recovery.start(qr);await recovery.check();await recovery.check();
 assert(!recovery.ready);await recovery.check();assert(recovery.ready);
 assert.deepEqual(calls.map(x=>x.op),['resolvePrintRoom','join','status','status']);
});
test('printed QR re-resolves its original label after a PC replacement; stale keys do not move rooms',async()=>{
 const newer='20000005';
 let code=room;
 const {recovery,calls}=fixture(b=>{
  if(b.op==='resolvePrintRoom')return {ok:true,room:code};
  if(b.op==='status')return success(false,false);
  return success();
 });
 recovery.start(qr);await recovery.check();await recovery.check();assert(!recovery.ready);
 code=newer;await recovery.check();assert(recovery.ready);
 const lookups=calls.filter(x=>x.op==='resolvePrintRoom');
 assert.equal(lookups.length,2);assert(lookups.every(x=>x.label===qr.label&&x.ticket===qr.ticket));
 const joins=calls.filter(x=>x.op==='join');
 assert.deepEqual(joins.map(x=>x.room),[room,newer]);assert.notEqual(joins[0].key,joins[1].key);
});
test('suspension ignores late status; shared wake-up reclaims expired membership once',async()=>{
 let release,blocked=true;
 const {client,recovery,calls}=fixture(b=>{
  if(b.op!=='status')return success();
  if(blocked)return new Promise(r=>release=r);
  return fail('disconnected');
 });
 recovery.start({room});await recovery.check();
 const check=recovery.check();await recovery.check();recovery.suspend();
 await assert.rejects(client.send({action:'play',number:1}));
 recovery.wake();recovery.wake();release(success());await check;
 assert(!recovery.ready);blocked=false;await recovery.check();assert(recovery.ready);
 assert.deepEqual(calls.map(x=>x.op),['join','status','status','join']);
 assert.equal(calls[0].key,calls[3].key);
});
test('manual cancellation or invalid ticket stops all subsequent recovery attempts',async()=>{
 let release;
 const {recovery,calls}=fixture(()=>new Promise(r=>release=r));
 recovery.start(qr);const lookup=recovery.check();recovery.stop();release({ok:true,room});await lookup;
 recovery.wake();await recovery.check();assert.equal(calls.length,1);
 const invalid=fixture(()=>fail('bad_ticket'));invalid.recovery.start(qr);
 await invalid.recovery.check();invalid.recovery.wake();await invalid.recovery.check();
 assert.equal(invalid.calls.length,1);assert.equal(invalid.recovery.target,null);
});
test('a lost reservation response is recovered by reading that one job, even after phone reconnect',async()=>{
 let release;
 const {client,recovery,calls}=fixture(b=>{
  if(b.op==='command')throw TypeError('network lost after acceptance');
  if(b.op==='result')return new Promise(r=>release=r);
  return success();
 });
 recovery.start({room});await recovery.check();
 const sending=client.send({action:'reserve',number:123});
 await new Promise(setImmediate);
 assert(!recovery.ready);await recovery.check();assert(recovery.ready);
 await assert.rejects(client.send({action:'reserve',number:123}));
 release({ok:true,status:'confirmed'});assert.equal((await sending).status,'confirmed');
 assert.deepEqual(calls.map(x=>x.op),['join','command','result','status']);
 assert.equal(calls[1].id,calls[2].id);assert.equal(calls[1].session,calls[2].session);
});

test('exact search uses the matched row and aborts when the room changes after reservation',async()=>{
 const {playSearchResult}=await import('../../p2wifi/wifi-client.mjs');
 const number=914, session='a'.repeat(32), calls=[];
 let songs=[693,number], disconnect=false, altered=false;
 const client={data:{session,online:true},room,revision:1,delay:async()=>{},
  async call(){return {online:true,session,state:{connected:true,queue:{valid:true,version:'1'.repeat(64),songs:[...songs]}}};},
  async send(c){calls.push(c);if(c.action==='reserve'){songs.push(c.number);if(disconnect)this.revision++;if(altered)songs.unshift(999);}return {status:'confirmed'};}
 };
 await playSearchResult(client,number);
 assert.deepEqual(calls.map(c=>[c.action,c.number,c.index]),[['queuePlay',number,1]]);
 calls.length=0;songs=[693];
 await playSearchResult(client,number);
 assert.deepEqual(calls.map(c=>[c.action,c.number,c.index]),[['reserve',number,undefined],['queuePlay',number,1]]);
 calls.length=0;songs=[693];altered=true;
 await assert.rejects(playSearchResult(client,number),/예약은 확인/);
 assert.deepEqual(calls.map(c=>c.action),['reserve']);
 calls.length=0;songs=[];disconnect=true;
 await assert.rejects(playSearchResult(client,number),/연결/);
 assert.deepEqual(calls.map(c=>c.action),['reserve']);
});

test('reservation checks promptly, then backs off while awaiting the same confirmed job',async()=>{
 const statuses=['pending','claimed','claimed','confirmed'], delays=[];
 const {client,calls}=fixture(b=>b.op==='result'?{ok:true,status:statuses.shift()}:success());
 await client.join(room);client.delay=async ms=>{delays.push(ms);};
 assert.equal((await client.send({action:'reserve',number:123})).status,'confirmed');
 assert.deepEqual(delays,[150,300,600,1000]);
 const submissions=calls.filter(b=>b.op==='command'), reads=calls.filter(b=>b.op==='result');
 assert.equal(submissions.length,1);
 assert(reads.every(b=>b.id===submissions[0].id&&b.session===submissions[0].session));
});
test('reservation backs off on a read error without sending another command',async()=>{
 const delays=[];let reads=0;
 const {client,calls}=fixture(b=>{
  if(b.op==='result')return ++reads===1?fail('slow'):{ok:true,status:'confirmed'};
  return success();
 });
 await client.join(room);client.delay=async ms=>{delays.push(ms);};
 assert.equal((await client.send({action:'reserve',number:123})).status,'confirmed');
 assert.deepEqual(delays,[150,1000]);assert.equal(calls.filter(b=>b.op==='command').length,1);
});

test('playback buttons check one job promptly and keep late results and failed inputs distinct',async()=>{
 for(const action of ['pause','next','play','queuePlay']){
  const delays=[],statuses=['pending','claimed','claimed',action==='pause'?'failed':'confirmed'];
  const {client,calls}=fixture(b=>b.op==='result'?{ok:true,status:statuses.shift()}:success());
  await client.join(room);client.delay=async ms=>{delays.push(ms);};
  const sending=client.send({action});await assert.rejects(client.send({action}));
  assert.equal((await sending).status,action==='pause'?'failed':'confirmed');
  assert.deepEqual(delays,[120,240,400,400]);
  const sent=calls.filter(b=>b.op==='command');assert.equal(sent.length,1);
  assert(calls.filter(b=>b.op==='result').every(b=>b.id===sent[0].id));
 }
});

test('pause uses the confirmed room state from its own session and ignores a foreign snapshot',async()=>{
 const p={known:true,number:10092,paused:true};
 let session;
 const {client,calls}=fixture(b=>b.op==='result'?{ok:true,status:'confirmed',session,playback:p}:success());
 await client.join(room);session=client.data.session;
 assert.equal((await client.send({action:'pause'})).playbackApplied,true);assert.deepEqual(client.data.state.playback,p);
 session='f'.repeat(32);
 assert.equal((await client.send({action:'pause'})).playbackApplied,false);
 assert(calls.filter(c=>c.op==='result').every(c=>c.readPlayback===true));
});
