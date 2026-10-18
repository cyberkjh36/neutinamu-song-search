const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('navigation uses latest HTML online and saved HTML offline; recovery page bypasses cache',async()=>{
 const handlers={},writes=[];let offline=false;const cached=new Response('old');
 const ctx={URL,Request,Error,Promise,self:{location:{origin:'https://example.org'},addEventListener:(n,f)=>handlers[n]=f},caches:{open:async()=>({match:async()=>cached,put:async(k,r)=>writes.push(await r.text())})},fetch:async()=>{if(offline)throw Error('offline');return new Response('new')}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),ctx);
 async function request(path){let response;handlers.fetch({request:{method:'GET',url:'https://example.org/'+path,mode:'navigate'},respondWith:p=>response=p});return (await response).text()}
 assert.equal(await request('app/'),'new');assert.deepEqual(writes,['new']);
 offline=true;assert.equal(await request('app/'),'old');
 offline=false;assert.equal(await request('app/refresh.html'),'new');assert.equal(writes.length,1);
});
