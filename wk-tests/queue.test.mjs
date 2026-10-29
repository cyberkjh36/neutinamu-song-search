import test from 'node:test';import assert from 'node:assert/strict';
import {videoIdFromUrl,queueCommand,requestId} from '../wk/queue-protocol.mjs';
import {KaraokeConnection} from '../wk/relay-client.mjs';
import {QUEUE_TEXT} from '../wk/queue-text.mjs';import {LANGUAGES} from '../wk/labels.mjs';
const id='AbCdEf_12-3',nonce='a'.repeat(32);
test('supported YouTube sharing URLs produce only the video id',()=>{
 for(const url of [`https://youtu.be/${id}?si=x`,`https://www.youtube.com/watch?v=${id}&list=abc&t=30`,`https://m.youtube.com/watch?v=${id}`,`https://youtube.com/shorts/${id}`,`https://youtube.com/live/${id}`,`https://music.youtube.com/watch?v=${id}`,`http://www.youtube.com/embed/${id}`])assert.equal(videoIdFromUrl(url),id,url);
});
test('reject channels, playlists, spoofed hosts, credentials, arbitrary schemes and invalid IDs',()=>{
 for(const url of [null,'',id,'javascript:alert(1)',`https://youtube.com.evil.test/watch?v=${id}`,`https://youtube.com@evil.test/watch?v=${id}`,`https://user@youtube.com/watch?v=${id}`,`https://youtube.com:8080/watch?v=${id}`,'https://youtube.com/playlist?list=abc','https://youtube.com/@channel',`https://youtube.com/watch?v=${id}&v=${id}`,'https://youtu.be/short',`https://youtu.be/${id}/extra`])assert.equal(videoIdFromUrl(url),null,String(url));
});
test('queue envelope is short, strict, unique and contains no URL query or tracking parameters',()=>{
 assert.equal(queueCommand(id,nonce),`WKQ1:${nonce}:${id}`);assert.equal(queueCommand(id,nonce).length,49);
 assert.throws(()=>queueCommand('bad',nonce));assert.throws(()=>queueCommand(id,'BAD'));assert.notEqual(requestId(),requestId());
});
test('all eleven languages have complete queue guidance',()=>{const keys=Object.keys(QUEUE_TEXT['ko-KR']);for(const l of LANGUAGES){assert.deepEqual(Object.keys(QUEUE_TEXT[l.code]),keys);for(const s of Object.values(QUEUE_TEXT[l.code]))assert.ok(s.trim());}});
test('old PC continues searching but cannot accidentally receive a queue command',async()=>{
 let calls=[];const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{calls.push(JSON.parse(o.body));return Response.json({ok:true,server:'OLD-PC',pending:false,result:true});}});
 try{await c.connect('12345678','phone');assert.equal(c.queueSupported,false);await assert.rejects(c.addVideo(id,nonce,'ko-KR'),e=>e.code==='upgrade');assert.equal(calls.length,1);assert.equal((await c.search('song','ko-KR')).ok,true);}finally{await c.disconnect();}
});
test('new PC advertises capability, user sends one video and waits for PC acknowledgement',async()=>{
 let calls=[],display='';const c=new KaraokeConnection(null,(s,d)=>{if(d)display=d;},{waitMs:1,fetch:async(u,o)=>{const b=JSON.parse(o.body);calls.push(b);return Response.json({ok:true,server:'WKQ1 TEST-PC',pending:false,result:true});}});
 try{await c.connect('12345678','phone');assert.equal(display,'TEST-PC');assert.equal(c.queueSupported,true);assert.equal((await c.addVideo(id,nonce,'th-TH')).ok,true);assert.equal(calls[1].text,queueCommand(id,nonce));assert.equal(calls[1].language,'th-TH');assert.equal(calls[2].op,'result');await c.disconnect();assert.equal(c.queueSupported,false);}finally{await c.disconnect();}
});
test('PC rejection is not reported as a successful reservation',async()=>{
 const c=new KaraokeConnection(null,()=>{},{fetch:async()=>Response.json({ok:true,server:'WKQ1 PC',pending:false,result:false})});try{await c.connect('12345678','phone');assert.equal((await c.addVideo(id,nonce,'ko-KR')).ok,false);}finally{await c.disconnect();}
});
test('lost acknowledgement retry retains the command identity',async()=>{
 const calls=[];let fail=true;const c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{const b=JSON.parse(o.body);calls.push(b);if(b.op==='result'&&fail)throw Error('offline');return Response.json({ok:true,server:'WKQ1 PC',pending:false,result:true});}});
 try{await c.connect('12345678','phone');await assert.rejects(c.addVideo(id,nonce,'ko-KR'));fail=false;assert.equal((await c.addVideo(id,nonce,'ko-KR')).ok,true);const jobs=calls.filter(x=>x.op==='search');assert.equal(jobs.length,2);assert.equal(jobs[0].id,jobs[1].id);assert.equal(jobs[0].text,jobs[1].text);}finally{await c.disconnect();}
});
