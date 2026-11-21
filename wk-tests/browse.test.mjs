import test from 'node:test';import assert from 'node:assert/strict';
import {browseCommand,readCatalog} from '../wk/browse-protocol.mjs';import {BROWSE_TEXT} from '../wk/browse-text.mjs';import {LANGUAGES} from '../wk/labels.mjs';import {KaraokeConnection} from '../wk/relay-client.mjs';
const nonce='a'.repeat(32),catalog={v:1,items:[{id:'abcdefghijk',title:'ไทย 日本語 한국어',channel:'Singer',duration:'3:00'}],error:null};
test('eleven languages share complete nonempty search/reservation guidance',()=>{for(const l of LANGUAGES){assert.deepEqual(Object.keys(BROWSE_TEXT[l.code]),Object.keys(BROWSE_TEXT['ko-KR']));for(const t of Object.values(BROWSE_TEXT[l.code]))assert.ok(t.trim());assert.ok(browseCommand('เพลง:한글',nonce,l.code).includes(l.code));}});
test('search query encoding retains colons and unicode, rejects controls and overlength',()=>{assert.equal(browseCommand('한국:ไทย',nonce,'ko-KR'),`WKF1:${nonce}:ko-KR:한국:ไทย`);for(const q of ['','x'.repeat(201),'a\nb'])assert.throws(()=>browseCommand(q,nonce,'ko-KR'));assert.throws(()=>browseCommand('test',nonce,'bad'));});
test('catalog bounds and result validation reject malformed relay data',()=>{assert.deepEqual(readCatalog(catalog),catalog);for(const bad of [null,{...catalog,v:2},{...catalog,items:[{...catalog.items[0],id:'../evil'}]},{...catalog,items:[catalog.items[0],catalog.items[0]]},{...catalog,error:'blocked'}])assert.throws(()=>readCatalog(bad));assert.deepEqual(readCatalog({v:1,items:[],error:'blocked'}).error,'blocked');});
test('old queue-enabled PC cannot receive in-app search, and keeps legacy search',async()=>{const calls=[],c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{calls.push(JSON.parse(o.body));return Response.json({ok:true,server:'WKQ1 PC',pending:false,result:true});}});try{await c.connect('12345678','Phone');await assert.rejects(c.browse('song','ko-KR'),e=>e.code==='upgrade');assert.equal(calls.length,1);assert.equal((await c.search('song','ko-KR')).ok,true);}finally{await c.disconnect();}});
test('new PC search returns catalog to phone and reservation carries only chosen video',async()=>{const calls=[],c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{calls.push(JSON.parse(o.body));return Response.json({ok:true,server:'WKQ1 WKS1 PC',pending:false,result:true,catalog});}});try{await c.connect('12345678','iPhone');assert.deepEqual(await c.browse('เพลง','th-TH'),catalog);assert.match(calls[1].text,/^WKF1:[a-f0-9]{32}:th-TH:เพลง$/);await c.addVideo(catalog.items[0].id,nonce,'th-TH');assert.equal(calls.filter(x=>x.op==='search').at(-1).text,`WKQ1:${nonce}:abcdefghijk`);}finally{await c.disconnect();}});
test('missing catalog is never reported as successful phone search',async()=>{const c=new KaraokeConnection(null,()=>{},{fetch:async()=>Response.json({ok:true,server:'WKQ1 WKS1 PC',pending:false,result:true})});try{await c.connect('12345678','Phone');await assert.rejects(c.browse('song','ko-KR'),e=>e.code==='response');}finally{await c.disconnect();}});
test('disconnect during rate wait cancels command, cannot send to new connection',async()=>{const calls=[],c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{calls.push(JSON.parse(o.body));return Response.json({ok:true,server:'WKQ1 WKS1 PC',pending:false,result:true,catalog});}});try{await c.connect('12345678','Phone');c.nextSend=Date.now()+80;const job=c.browse('song','ko-KR');await c.disconnect();await assert.rejects(job,e=>e.code==='disconnected');assert.equal(calls.filter(x=>x.op==='search').length,0);}finally{await c.disconnect();}});

test('recover a failed host lookup using the same confirmed phone query and locale without adding a reservation',async()=>{
 const calls=[];let primaryError='unavailable';
 const c=new KaraokeConnection(null,()=>{},{fetch:async(_,options)=>{
  const b=JSON.parse(options.body);calls.push(b);
  if(b.op==='join')return Response.json({ok:true,videoSearch:1,server:'WKQ1 WKS1 PC'});
  if(b.op==='videoCatalog')return Response.json({ok:true,catalog});
  return Response.json({ok:true,pending:false,result:true,catalog:{v:1,items:[],error:primaryError}});
 }});
 try{
  await c.connect('12345678','phone');
  assert.deepEqual(await c.browse('손흥민','ko-KR'),catalog);
  const recovery=calls.filter(b=>b.op==='videoCatalog');assert.equal(recovery.length,1);
  assert.equal(recovery[0].query,'손흥민');assert.equal(recovery[0].language,'ko-KR');assert.equal(c.state,'ready');
  assert.equal(calls.filter(b=>b.op==='search').length,1);
  primaryError='blocked';c.nextSend=0;assert.equal((await c.browse('다른 곡','ko-KR')).error,'blocked');
  assert.equal(calls.filter(b=>b.op==='videoCatalog').length,1);
 }finally{await c.disconnect();}
});
