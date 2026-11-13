import test from 'node:test';import assert from 'node:assert/strict';
import {controlCommand,favoritesCommand} from '../wk/remote-protocol.mjs';import {REMOTE_TEXT} from '../wk/ui-text.mjs';import {LANGUAGES} from '../wk/ui-text.mjs';import {KaraokeConnection} from '../wk/relay-client.mjs';import {createRemoteUi} from '../wk/remote-ui.mjs';
const nonce='a'.repeat(32),video={id:'abcdefghijk',title:'ไทย 한국어 <script>',channel:'12',duration:''},catalog={v:1,items:[video],error:null};
test('strict playback commands accept only play pause next',()=>{for(const a of ['play','pause','next'])assert.equal(controlCommand(a,nonce),`WKC1:${nonce}:${a}`);for(const a of ['stop','delete','pause\n','PLAY',null])assert.throws(()=>controlCommand(a,nonce));assert.throws(()=>controlCommand('next','x'));});
test('favorite request keeps Unicode and explicit pagination in relay limits',()=>{for(const l of LANGUAGES){assert.equal(favoritesCommand('',0,nonce,l.code),`WKV1:${nonce}:${l.code}:0:`);assert.ok(favoritesCommand('歌'.repeat(160),99999,nonce,l.code).length<300);}for(const [q,p,l] of [['x\ny',0,'ko-KR'],['a'.repeat(161),0,'ko-KR'],['',-1,'ko-KR'],['',1.1,'ko-KR'],['',100000,'ko-KR'],['',0,'en-US']])assert.throws(()=>favoritesCommand(q,p,nonce,l));});
test('all eleven countries include every remote and favorites label',()=>{for(const l of LANGUAGES){assert.deepEqual(Object.keys(REMOTE_TEXT[l.code]),Object.keys(REMOTE_TEXT['ko-KR']));for(const v of Object.values(REMOTE_TEXT[l.code]))assert.ok(typeof v==='string'&&v.trim());}});
test('capability gates prevent control commands being searched on old PCs',async()=>{for(const server of ['PC','WKQ1 PC','WKQ1 WKS1 PC','WKQ1 WKS1 WKT1 PC']){const calls=[],c=new KaraokeConnection(null,()=>{},{fetch:async(u,o)=>{calls.push(JSON.parse(o.body));return Response.json({ok:true,server});}});try{await c.connect('12345678','Phone');await assert.rejects(c.control('next',nonce,'ko-KR'),e=>e.code==='upgrade');await assert.rejects(c.favorites('',0,'ko-KR'),e=>e.code==='upgrade');assert.equal(calls.length,1);}finally{await c.disconnect();}}});
test('new PC advertises clean name and receives control/favorites through existing authenticated requests',async()=>{let name;const calls=[],c=new KaraokeConnection(null,(s,d)=>{if(d&&s==='ready')name=d;},{fetch:async(u,o)=>{calls.push(JSON.parse(o.body));return Response.json({ok:true,server:'WKQ1 WKS1 WKT1 WKC1 WKV1 MY-PC',pending:false,result:true,catalog});}});try{await c.connect('12345678','iPhone');assert.equal(name,'MY-PC');assert.ok(c.controlSupported&&c.favoritesSupported);assert.equal((await c.control('pause',nonce,'th-TH')).ok,true);c.nextSend=0;assert.deepEqual(await c.favorites('เพลง',1,'th-TH'),catalog);assert.equal(calls.find(x=>x.op==='search').text,controlCommand('pause',nonce));assert.match(calls.filter(x=>x.op==='search')[1].text,/^WKV1:[a-f0-9]{32}:th-TH:1:เพลง$/);assert.ok(calls.filter(x=>x.op==='search').every(x=>x.room==='12345678'&&/^[a-f0-9]{64}$/.test(x.key)));}finally{await c.disconnect();assert.equal(c.controlSupported,false);assert.equal(c.favoritesSupported,false);}});
class Element{constructor(){this.hidden=false;this.disabled=false;this.value='';this.children=[];this.events={};this.dataset={};this.attrs={};this.classList={toggle(){}};}addEventListener(n,f){this.events[n]=f;}fire(n,e={}){return this.events[n]?.(e);}append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}setAttribute(k,v){this.attrs[k]=v;}}
const tick=()=>new Promise(r=>setTimeout(r,0));
function harness(){const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};$('favorites-panel').hidden=true;let lang='ko-KR',busy=false;const calls=[],connection={state:'ready',generation:1,controlSupported:true,favoritesSupported:true,async control(...a){calls.push(['control',...a]);return{ok:true};},async favorites(...a){calls.push(['favorites',...a]);return catalog;},async addVideo(...a){calls.push(['add',...a]);return{ok:true};}};const ui=createRemoteUi({connection,getLanguage:()=>lang,blocked:()=>busy,$,doc:{createElement:()=>new Element()}});ui.render();return{$,ui,connection,calls,setLanguage(l){lang=l;ui.changeLanguage();ui.render();},setBusy(x){busy=x;ui.render();}};}
for(const language of LANGUAGES)test(`phone controls and favorite tap in ${language.code}`,async()=>{const h=harness();h.setLanguage(language.code);const w=REMOTE_TEXT[language.code];assert.equal(h.$('remote-pause-label').textContent,w.pause);assert.equal(h.$('favorites-open').textContent,w.favorites);assert.equal(h.calls.length,0);await h.$('remote-play').fire('click');assert.equal(h.calls[0][1],'play');assert.equal(h.$('remote-feedback').textContent,w.done);h.$('favorites-open').fire('click');await tick();assert.equal(h.calls[1][0],'favorites');assert.deepEqual(h.calls[1].slice(1),['',0,language.code]);const button=h.$('favorites-list').children[0];assert.equal(button.children[1].children[0].textContent,video.title);assert.equal(button.children[1].children[1].textContent,'12 '+w.plays);await button.fire('click');assert.equal(h.calls[2][0],'add');assert.equal(h.calls[2][1],video.id);assert.deepEqual(h.calls[2].slice(3),[language.code,video.title]);assert.ok(button.disabled);assert.equal(h.$('favorites-feedback').textContent,w.added);});
test('typing favorites does not query; explicit search applies normalized draft and paging keeps applied query',async()=>{const h=harness();h.connection.favorites=async(...a)=>{h.calls.push(a);return{v:1,items:Array.from({length:20},(_,i)=>({...video,id:String(i).padStart(11,'0')})),error:null};};h.$('favorites-open').fire('click');await tick();h.$('favorites-query').value='노래';h.$('favorites-query').fire('input');assert.equal(h.calls.length,1);h.$('favorites-search').fire('click');await tick();assert.deepEqual(h.calls[1],['노래',0,'ko-KR']);h.$('favorites-query').value='입력중';h.$('favorites-more').fire('click');await tick();assert.deepEqual(h.calls[2],['노래',1,'ko-KR']);h.$('favorites-previous').fire('click');await tick();assert.deepEqual(h.calls[3],['노래',0,'ko-KR']);});
test('pending next blocks double tap; uncertain retry keeps exact nonce until acknowledged',async()=>{const h=harness();let resolve;h.connection.control=(...a)=>{h.calls.push(a);return new Promise(r=>resolve=r);};const first=h.$('remote-next').fire('click');assert.ok(h.$('remote-next').disabled);await h.$('remote-next').fire('click');assert.equal(h.calls.length,1);resolve({ok:true});await first;assert.equal(h.$('remote-next').disabled,false);let fail=true;h.connection.control=async(...a)=>{h.calls.push(a);if(fail)throw Error('network');return{ok:true};};await h.$('remote-next').fire('click');const request=h.calls.at(-1)[1];assert.equal(h.$('remote-feedback').textContent,REMOTE_TEXT['ko-KR'].uncertain);fail=false;await h.$('remote-next').fire('click');assert.equal(h.calls.at(-1)[1],request);await h.$('remote-next').fire('click');assert.notEqual(h.calls.at(-1)[1],request);});
test('disconnected or old PC shows guidance and disables actions',()=>{const h=harness();h.connection.controlSupported=false;h.connection.favoritesSupported=false;h.ui.render();assert.ok(h.$('remote-play').disabled&&h.$('favorites-open').disabled);assert.equal(h.$('remote-feedback').textContent,REMOTE_TEXT['ko-KR'].upgrade);h.connection.state='idle';h.connection.generation++;h.ui.render();assert.equal(h.$('remote-feedback').textContent,REMOTE_TEXT['ko-KR'].connect);assert.equal(h.$('favorites-list').children.length,0);});
test('late favorite response from a previous room is discarded',async()=>{const h=harness();let resolve;h.connection.favorites=()=>new Promise(r=>resolve=r);h.$('favorites-open').fire('click');h.connection.generation++;h.connection.state='idle';h.ui.render();resolve(catalog);await tick();assert.equal(h.$('favorites-list').children.length,0);});
test('favorite retry reuses reservation nonce and title; only successful PC ACK marks added',async()=>{const h=harness();let ok=false;h.connection.addVideo=async(...a)=>{h.calls.push(a);return{ok};};h.$('favorites-open').fire('click');await tick();const button=h.$('favorites-list').children[0];await button.fire('click');assert.equal(button.disabled,false);const first=h.calls.at(-1);ok=true;await button.fire('click');assert.deepEqual(h.calls.at(-1),first);assert.equal(button.disabled,true);});

test('TV input uses the paired room and a dedicated operation, never a YouTube search',async()=>{
 const calls=[];
 const c=new KaraokeConnection(null,()=>{},{fetch:async(_,options)=>{
  const b=JSON.parse(options.body);calls.push(b);
  if(b.op==='join')return Response.json({ok:true,server:'Room PC',capabilities:{p2HdmiInput:1}});
  return Response.json({ok:true,request:b.request,input:b.input,status:'sent'});
 }});
 try{
  await c.connect('23456789','Phone');
  assert.equal(await c.setTvInput(nonce),'sent');
  assert.deepEqual(calls.map(x=>x.op),['join','setTvInput']);
  assert.equal(calls[1].request,nonce);assert.equal(calls[1].input,'HDMI_INPUT');
  assert.equal(calls[1].room,calls[0].room);assert.equal(calls[1].key,calls[0].key);
 }finally{await c.disconnect();}
 assert.equal(c.tvInputSupported,false);
});

test('legacy launchers and a PC name that looks like a feature cannot receive HDMI requests',async()=>{
 const c=new KaraokeConnection(null,()=>{},{fetch:async()=>Response.json({ok:true,server:'WKQ1 WKS1 WKT1 WKC1 WKTV1 HDMI_INPUT'})});
 try{
  await c.connect('23456789','Phone');
  assert.equal(c.tvInputSupported,false);
  await assert.rejects(c.setTvInput(nonce),e=>e.code==='upgrade');
 }finally{await c.disconnect();}
});

test('generic success, wrong acknowledgements and stale rooms cannot confirm a TV switch',async()=>{
 let reply,delayed=false,release,requested;
 const started=new Promise(r=>requested=r);
 const c=new KaraokeConnection(null,()=>{},{fetch:async(_,options)=>{
  const b=JSON.parse(options.body);
  if(b.op==='join')return Response.json({ok:true,server:'PC',capabilities:{p2HdmiInput:1}});
  if(b.op==='setTvInput'&&delayed){requested();await new Promise(r=>release=r);}
  return Response.json({ok:true,...reply});
 }});
 try{
  await c.connect('23456789','Phone');
  for(const r of [{},{request:'bad',input:'HDMI_INPUT',status:'confirmed'},{request:nonce,input:'TV',status:'confirmed'}]){
   reply=r;await assert.rejects(c.setTvInput(nonce),e=>e.code==='response');
  }
  delayed=true;reply={request:nonce,input:'HDMI_INPUT',status:'confirmed'};
  const task=c.setTvInput(nonce);await started;
  await c.disconnect();await c.connect('34567890','Phone');release();
  await assert.rejects(task,e=>e.code==='disconnected');assert.equal(c.room,'34567890');
 }finally{await c.disconnect();}
});

test('TV remains visible on old rooms, ignores double taps and keeps retries distinct from confirmation',async()=>{
 const h=harness(),b=h.$('remote-tv'),msg=h.$('remote-feedback');
 assert.ok(!b.hidden&&!b.disabled);
 assert.equal(h.$('tv-availability').textContent,REMOTE_TEXT['ko-KR'].tvRoomWait);
 h.connection.tvInputSupported=true;h.ui.render();assert.ok(!b.hidden&&!b.disabled);
 let release;const requests=[];
 h.connection.setTvInput=r=>{requests.push(r);return new Promise(resolve=>release=resolve);};
 const first=b.fire('click');await b.fire('click');assert.equal(requests.length,1);
 release('sent');await first;assert.equal(msg.textContent,REMOTE_TEXT['ko-KR'].tvSent);
 h.connection.setTvInput=async r=>{requests.push(r);throw Error('timeout');};
 await b.fire('click');assert.equal(msg.textContent,REMOTE_TEXT['ko-KR'].tvUnknown);
 h.connection.setTvInput=async r=>{requests.push(r);return 'confirmed';};
 await b.fire('click');assert.equal(requests[1],requests[2]);assert.equal(msg.textContent,REMOTE_TEXT['ko-KR'].tvConfirmed);
});

test('queued HDMI requests are polled read-only and an uncertain manual retry only asks for the result',async()=>{
 const calls=[];
 const c=new KaraokeConnection(null,()=>{},{fetch:async(_,options)=>{
  const b=JSON.parse(options.body);calls.push(b.op);
  if(b.op==='join')return Response.json({ok:true,server:'PC',capabilities:{p2HdmiInput:1}});
  const status=b.op==='setTvInput'?'queued':'sent';
  return Response.json({ok:true,request:b.request,input:'HDMI_INPUT',status});
 }});
 try{
  await c.connect('23456789','Phone');
  assert.equal(await c.setTvInput(nonce),'sent');
  assert.equal(await c.setTvInput(nonce,true),'sent');
  assert.deepEqual(calls,['join','setTvInput','tvInputResult','tvInputResult']);
 }finally{await c.disconnect();}
});

test('TV control is present in QR HTML before JS; old room, loss of readiness and disconnect keep its label visible',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../wk/index.html',import.meta.url),'utf8');
 const tag=html.match(/<button id="remote-tv"[^>]*>/)[0];
 assert.ok(!/\bhidden\b/.test(tag));assert.match(tag,/aria-describedby="tv-availability"/);
 const h=harness(),button=h.$('remote-tv'),status=h.$('tv-availability');
 h.connection.state='idle';h.ui.render();assert.ok(!button.hidden&&button.disabled);assert.equal(status.textContent,REMOTE_TEXT['ko-KR'].connect);
 await button.fire('click');assert.equal(h.calls.length,0);
 h.connection.state='ready';h.ui.render();assert.equal(status.textContent,REMOTE_TEXT['ko-KR'].tvRoomWait);
 h.connection.tvInputSupported=h.connection.tvMenuSupported=true;h.ui.render();assert.ok(!button.hidden&&!button.disabled);assert.ok(status.hidden);
 h.connection.tvMenuSupported=h.connection.tvInputSupported=false;h.ui.render();assert.ok(!button.hidden&&!button.disabled&&!status.hidden);
 assert.ok(h.$('tv-menu').hidden);
});

test('each QR language refreshes a late P2 host on tap and sends the four menu keys once',async t=>{
 for(const {code} of LANGUAGES)await t.test(code,async()=>{
  const h=harness(),c=h.connection,seen=[];
  h.setLanguage(code);
  c.refreshTvStatus=async()=>{seen.push('ping');c.tvInputSupported=c.tvMenuSupported=true;return true;};
  c.setTvInput=async(id,readOnly,key)=>{assert.match(id,/^[a-f0-9]{32}$/);assert.equal(readOnly,false);seen.push(key);return 'sent';};
  for(const id of ['remote-tv','tv-left','tv-right','tv-select'])await h.$(id).fire('click');
  assert.deepEqual(seen,['ping','VIDEO','LEFT','RIGHT','SELECT']);
  assert.equal(h.$('remote-tv-label').textContent,REMOTE_TEXT[code].tv);
  assert.equal(h.$('tv-select').textContent,REMOTE_TEXT[code].tvSelect);
  assert.equal(h.$('remote-feedback').textContent,REMOTE_TEXT[code].tvKeySent);
 });
});
test('no P2 host means a status check only, even for repeated taps',async()=>{
 const h=harness();let resolve,reads=0;
 h.connection.refreshTvStatus=()=>{reads++;return new Promise(r=>resolve=r);};
 const done=h.$('remote-tv').fire('click');await h.$('remote-tv').fire('click');resolve(false);await done;
 assert.equal(reads,1);assert.deepEqual(h.calls,[]);assert.ok(h.$('tv-menu').hidden);
 assert.equal(h.$('remote-feedback').textContent,REMOTE_TEXT['ko-KR'].tvRoomWait);
});
test('a transient heartbeat failure recovers the same phone session',async()=>{
 const calls=[];let pings=0;const c=new KaraokeConnection(null,()=>{},{pingMs:8,fetch:async(_,o)=>{
  const b=JSON.parse(o.body);calls.push(b);
  if(b.op==='ping'&&++pings===1)throw new TypeError('temporary network loss');
  return Response.json({ok:true,server:'PC',...(b.op==='ping'?{capabilities:{p2TvMenu:1}}:{})});
 }});
 try{await c.connect('23456789','ไทย');
  const end=Date.now()+1000;while(!c.tvMenuSupported&&Date.now()<end)await new Promise(r=>setTimeout(r,8));
  assert.ok(c.tvMenuSupported);assert.equal(c.state,'ready');assert.ok(pings>=2);
  assert.equal(calls.filter(x=>x.op==='join').length,1);assert.equal(calls.filter(x=>x.op==='leave').length,0);
  assert.equal(new Set(calls.map(x=>x.key)).size,1);
 }finally{await c.disconnect();}
});
