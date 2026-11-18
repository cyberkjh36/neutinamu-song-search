// Optional integration against the unchanged Sites relay checkout:
// node --test wk-tests/session-relay.integration.mjs
// Set WK_RELAY_CHECKOUT to its absolute path. No production traffic is sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {KaraokeConnection} from '../wk/relay-client.mjs';
const source=process.env.WK_RELAY_CHECKOUT;
test('expired identities restore against the real SQLite relay without extra slots or replay', {skip:!source},async()=>{
 const {fixture}=await import(pathToFileURL(source+'/tests/fixture.mjs'));
 const {handleRelay}=await import(pathToFileURL(source+'/lib/relay.mjs'));
 const f=fixture(),host='8'.repeat(64),room=(await f.call({op:'create',key:host,name:'WKQ1 WKS1 WKT1 WKC1 WKV1 WKL1 Room 5',persistent:true})).code;
 const phones=[],calls=[];
 const adapter=async(_,options)=>{calls.push(JSON.parse(options.body));return handleRelay(new Request('https://relay.test/api/relay',options),f.db,{now:f.now});};
 try{
  for(let i=0;i<5;i++){const c=new KaraokeConnection(null,()=>{},{fetch:adapter});phones.push(c);await c.connect(room,'Phone '+i);c.suspend();}
  assert.equal((await f.call({op:'poll',key:host,room})).phones.length,5);
  const keys=phones.map(c=>c.key);f.advance(180000);assert.equal((await f.call({op:'poll',key:host,room})).phones.length,0);
  for(const c of phones)assert.equal(await c.resume(),true);
  assert.equal((await f.call({op:'poll',key:host,room})).phones.length,5);assert.deepEqual(phones.map(c=>c.key),keys);assert.equal(calls.some(b=>['search','setTvInput','leave'].includes(b.op)),false);
  const extra=new KaraokeConnection(null,()=>{},{fetch:adapter});await assert.rejects(extra.connect(room,'Sixth'),e=>e.code==='full');await extra.disconnect();
  assert.equal(f.sql.prepare('SELECT count(*) n FROM phones').get().n,5);
  const c=phones[0];c.suspend();await f.call({op:'close',key:host,room});assert.equal(await c.resume(),false);assert.equal(c.state,'reconnecting');
  assert.equal((await f.call({op:'create',key:host,name:'WKQ1 WKS1 WKT1 WKC1 WKV1 WKL1 Room 5',persistent:true})).code,room);
  // Cross the admission rate window as would happen after a PC shutdown.
  f.advance(61000);await f.call({op:'poll',key:host,room});assert.equal(await c.resume(),true);assert.equal(c.key,keys[0]);assert.equal(c.state,'ready');
 }finally{for(const c of phones)await c.disconnect();}
});
