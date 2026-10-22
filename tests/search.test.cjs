// Run with node --test tests/search.test.cjs. Uses the actual bundled catalog.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function app(){
 const elements=new Map();
 function element(){const classes=new Set();return {open:false,setAttribute(n,v){if(n==='open')this.open=true},removeAttribute(n){if(n==='open')this.open=false},showModal(){this.open=true},close(){this.open=false},value:'',textContent:'',innerHTML:'',style:{},children:[],disabled:false,clientWidth:320,className:'',classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(){}},replaceChildren(){this.children=[]},append(x){this.children.push(x)},querySelector(){return element()},scrollIntoView(){},focus(){this.focused=true},addEventListener(){}}}
 const c={Element:function(){},console,URL,Blob,setTimeout,navigator:{},location:{protocol:'https:'},document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element,createRange(){return {selectNodeContents(){},getBoundingClientRect(){return {width:250}}}},addEventListener(){}},innerHeight:800,addEventListener(){}};
 c.window=c;vm.createContext(c);
 vm.runInContext(Array.from(fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)).pop()[1],c);
 c.csv=fs.readFileSync(path.join(root,'catalog-20261018.csv'),'utf8');
 vm.runInContext(`cachedSongs=csvParse(csv.replace(/^\\uFEFF/,''),',').slice(1).map(([code,title,artist])=>({code,title,artist,titleN:normalize(title),artistN:normalize(artist),hay:normalize(title+' '+artist)}));`,c);
 return {c,el:id=>c.document.getElementById(id),run:s=>vm.runInContext(s,c)};
}
test('catalog and short-title matching, including subtitle versions',()=>{
 const {run}=app();assert.equal(run('cachedSongs.length'),76435);
 for(const q of ['꿈','정','꽃','늪','님','길']){
  const songs=run(`findSongs(cachedSongs,${JSON.stringify(q)})`);
  assert.ok(songs.length>0,q);assert.ok(songs.every(x=>x.n>=980),q);
 }
 assert.ok(run(`findSongs(cachedSongs,'정').some(x=>x.s.code==='3340')`));
 assert.ok(run(`findSongs(cachedSongs,'님').some(x=>x.s.code==='145')`));
 for(const q of ['조용필 꿈','꿈 조용필','조용필꿈'])assert.equal(run(`findSongs(cachedSongs,${JSON.stringify(q)})[0].s.code`),'693');
 assert.equal(run(`findSongs(cachedSongs,'693')[0].s.code`),'693');
 assert.ok(run(`findSongs(cachedSongs,'조용필').length`)>20);
 assert.ok(run(`findSongs(cachedSongs,'가로수 그늘 아래 서면').some(x=>x.s.code==='3')`));
 assert.equal(run(`findSongs(cachedSongs,'!!!').length`),0);
});
test('one-character matches are not truncated at 20',async()=>{
 const {c,el}=app();el('query').value='꿈';await c.search();assert.ok(el('results').children.length>20);
});
for(const api of ['SpeechRecognition','webkitSpeechRecognition'])test(`${api}: clears previous text/results before listening, uses alternative match`,async()=>{
 const {c,el}=app();let rec;
 c[api]=class{constructor(){rec=this}start(){assert.equal(el('query').value,'');assert.equal(el('results').children.length,0);assert.equal(el('hero').classList.contains('show'),false)}};
 el('query').value='이전 검색어';el('results').append({});el('hero').classList.add('show');c.startVoice();
 assert.equal(rec.lang,'ko-KR');assert.equal(rec.maxAlternatives,5);
 await c.useSpeechAlternatives(['없는곡이름abcdefgh','늪'],1);
 assert.equal(el('query').value,'늪');assert.equal(el('heroTitle').textContent,'늪');
 rec.onend();assert.equal(el('voiceBtn').disabled,false);
});
test('unsupported browser and failed microphone preserve retry and dictation fallback',()=>{
 const {c,el}=app();el('query').value='이전';c.startVoice();assert.equal(el('query').value,'');assert.equal(el('voiceDialog').open,true);c.cancelVoice();
 c.SpeechRecognition=class{start(){throw Error('unavailable')}};
 c.startVoice();assert.equal(el('voiceBtn').disabled,false);assert.match(el('voiceBtn').innerHTML,/노래제목으로 번호검색/);
});
test('late recognition cannot overwrite a newer search',async()=>{
 const {c,el}=app();el('query').value='새 검색';await c.useSpeechAlternatives(['꿈'],-1);assert.equal(el('query').value,'새 검색');
});

for(const api of ['SpeechRecognition','webkitSpeechRecognition'])test(`${api}: dialog lifecycle and cancel ignore late callbacks`,()=>{
 const {c,el}=app();const sessions=[];
 c[api]=class{constructor(){sessions.push(this)}start(){}abort(){this.aborted=true}};
 c.startVoice();const first=sessions[0];assert.equal(el('voiceDialog').open,true);
 first.onaudiostart();assert.match(el('voiceDialogStatus').textContent,/듣고/);
 el('voiceCancelBtn').onclick();assert.equal(el('voiceDialog').open,false);assert.equal(first.aborted,true);
 assert.equal(el('voiceBtn').disabled,false);
 c.startVoice();first.onend();first.onresult({results:[[{transcript:'오래된 결과'}]]});
 assert.equal(el('voiceDialog').open,true);assert.equal(el('query').value,'');
 sessions[1].onerror({error:'not-allowed'});assert.equal(el('voiceDialog').open,true);assert.match(el('voiceDialogStatus').textContent,/권한/);
 assert.match(el('message').textContent,/권한/);c.cancelVoice();
 c.startVoice();sessions[2].onend();assert.equal(el('voiceDialog').open,true);c.cancelVoice();
 c.startVoice();sessions[3].onresult({results:[[{transcript:'꿈'}]]});assert.equal(el('voiceDialog').open,false);
});

test('older browser shows fallback microphone overlay',()=>{const {c,el}=app();el('voiceDialog').showModal=undefined;c.startVoice();assert.equal(el('voiceDialog').open,true);assert.ok(el('voiceDialog').classList.contains('fallback-open'));c.cancelVoice();assert.equal(el('voiceDialog').open,false)});

test('older IndexedDB without getAll loads songs using a cursor',async()=>{
 const {run}=app();
 run(`cachedSongs=null;db={transaction(){return {objectStore(){return {openCursor(){const request={};let i=0;const values=[{code:'693',title:'꿈',artist:'조용필'},{code:'3',title:'가로수 그늘 아래 서면',artist:'이문세'}];function next(){setTimeout(()=>{request.result=i<values.length?{value:values[i++],continue:next}:null;request.onsuccess()},0)}next();return request}}}}}};`);
 const songs=await run('allSongs()');assert.equal(songs.length,2);assert.equal(songs[0].code,'693');
});
