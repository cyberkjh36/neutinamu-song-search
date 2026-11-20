const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('navigation uses latest HTML online and saved HTML offline; recovery page bypasses cache',async()=>{
 const handlers={},writes=[];let offline=false;const cached=new Response('old');
 const ctx={URL,Request,Error,Promise,self:{location:new URL('https://example.org/app/sw.js'),addEventListener:(n,f)=>handlers[n]=f},caches:{open:async()=>({match:async()=>cached,put:async(k,r)=>writes.push(await r.text())})},fetch:async()=>{if(offline)throw Error('offline');return new Response('new')}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),ctx);
 async function request(path){let response;handlers.fetch({request:{method:'GET',url:'https://example.org/'+path,mode:'navigate'},respondWith:p=>response=p});return (await response).text()}
 assert.equal(await request('app/'),'new');assert.deepEqual(writes,['new']);
 offline=true;assert.equal(await request('app/'),'old');
 offline=false;assert.equal(await request('app/refresh.html'),'new');assert.equal(writes.length,1);
});

test('a P2 remote upgrade reuses the two installed CSVs and downloads only the new dated catalog',async()=>{
 const handlers={},network=[],files=new Map(),scope='https://example.org/app/p2wifi/';
 const previous=['catalog-20261018.csv','catalog-update-20261104.csv'];
 const url=name=>new URL('../'+name,scope).href;
 const old=new Map(previous.map(name=>[url(name),name]));
 const caches={
  match:async key=>{const text=files.get(key)??old.get(key);return text?new Response(text):undefined;},
  open:async()=>({
   addAll:async requests=>assert(requests.every(req=>!req.url.endsWith('.csv'))),
   put:async(k,response)=>files.set(k,await response.text()),
   add:async k=>{network.push(k);files.set(k,'new songs');}
  })
 };
 const worker={registration:{scope},location:new URL(scope),skipWaiting(){},addEventListener:(n,f)=>handlers[n]=f};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../p2wifi/sw.js'),'utf8'),{self:worker,caches,URL,Request,Response,fetch(){throw Error('offline')}});
 let installed;handlers.install({waitUntil:p=>installed=p});await installed;
 assert.deepEqual(network,[url('catalog-update-20261120.csv')]);
 old.clear();
 for(const name of [...previous,'catalog-update-20261120.csv']){
  let response;handlers.fetch({request:new Request(url(name)),respondWith:p=>response=p});
  assert.equal(await (await response).text(),previous.includes(name)?name:'new songs');
 }
});
