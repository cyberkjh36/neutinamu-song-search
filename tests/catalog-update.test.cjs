const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');
const root=path.join(__dirname,'..');
const source=Array.from(fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)).pop()[1];
const key='tj-p2-catalog-update-20261104';
function app(){
 const elements=new Map(),storage=new Map(),requests=[];let onReady;
 const element=()=>({disabled:false,textContent:'',innerHTML:'',value:'',style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},replaceChildren(){},append(){},querySelector:()=>element()});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const c={Element:function(){},console,URL,Blob,setTimeout,indexedDB:new IDBFactory(),navigator:{},location:{protocol:'https:'},addEventListener(){},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  document:{getElementById:get,addEventListener:(name,callback)=>{if(name==='DOMContentLoaded')onReady=callback}},
  fetch:async url=>{requests.push(url);return {ok:true,text:async()=>fs.readFileSync(path.join(root,url),'utf8')}}};
 c.window=c;c.Chosung=require('../chosung.js');vm.createContext(c);vm.runInContext(source,c);
 return {c,storage,requests,get,run:code=>vm.runInContext(code,c),start:()=>onReady()};
}

test('fresh installation loads both catalogs exactly once and restores an evicted database',async()=>{
 const a=app();await a.start();
 assert.equal(await a.run('countSongs()'),76617);
 assert.equal(a.get('searchBtn').disabled,false);assert.equal(a.storage.get(key),'done');
 assert.deepEqual(a.requests,['./catalog-20261018.csv','./catalog-update-20261104.csv']);
 a.requests.length=0;await a.run('updateBundledCatalog()');assert.equal(a.requests.length,0);
 await a.run(`new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})`);
 await a.run('updateBundledCatalog()');assert.equal(await a.run('countSongs()'),76617);
 assert.equal(a.requests.length,2);await a.run('db.close()');
});

test('previous installation keeps custom songs, retries a failed update and supports offline searching',async()=>{
 const a=app(),onlineFetch=a.c.fetch;
 await a.run('openDB()');
 a.c.base=fs.readFileSync(path.join(root,'catalog-20261018.csv'),'utf8');
 await a.run('importCSVText(base,76435)');a.storage.set('tj-p2-catalog-76435','done');
 await a.run(`importCSVText(${JSON.stringify('곡번호,곡제목,가수\n99999999,매장추가곡,직접등록\n')})`);
 a.c.fetch=async()=>{throw Error('offline')};await a.start();
 assert.equal(await a.run('countSongs()'),76436);
 assert.equal(a.get('searchBtn').disabled,false);
 assert.match(a.get('message').textContent,/새 곡 목록을 받지 못했습니다/);
 assert.equal(a.storage.has(key),false);
 assert.equal(a.run(`findSongs(cachedSongs,'조용필 꿈')[0].s.code`),'693');
 a.c.fetch=onlineFetch;await a.start();
 assert.equal(await a.run('countSongs()'),76618);
 assert.deepEqual(a.requests,['./catalog-update-20261104.csv']);
 assert.equal(a.run(`findSongs(cachedSongs,'매장추가곡')[0].s.code`),'99999999');
 assert.equal(a.run(`findSongs(cachedSongs,'풀카운트')[0].s.code`),'71403');
 a.c.fetch=async()=>{throw Error('offline')};await a.start();
 assert.equal(a.get('searchBtn').disabled,false);
 assert.equal(a.run(`findSongs(cachedSongs,'허각 나를 사랑하지 말아요')[0].s.code`),'71423');
 await a.run('db.close()');
});

test('duplicate and truncated updates are rejected before writing and stay retryable',async()=>{
 const a=app();await a.run('openDB()');
 await a.run(`importCSVText(${JSON.stringify('곡번호,곡제목,가수\n693,꿈,조용필\n')})`);
 a.storage.set('tj-p2-catalog-76435','done');
 for(const body of ['곡번호,곡제목,가수\n'+Array(182).fill('99999998,잘못된곡,테스트').join('\n'),'곡번호,곡제목,가수\n71403,풀카운트,볼빨간사춘기\n']){
  a.c.fetch=async()=>({ok:true,text:async()=>body});
  await assert.rejects(a.run('updateBundledCatalog()'),/곡 데이터 수/);
  assert.equal(await a.run('countSongs()'),1);assert.equal(a.storage.has(key),false);
 }
 await a.run('db.close()');
});
