import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {chromium, webkit} from 'playwright';
import {LANGUAGES,REMOTE_TEXT} from '../wk/ui-text.mjs';

const root=resolve('wk');
const favorites=JSON.parse(await readFile(resolve('data/favorites/all.json'),'utf8'));
const productionRelay='https://world-karaoke-connect.almondjoy11.chatgpt.site/api/relay';
let room, actions, ready, latest, expired, requests;
const api=createServer(async(req,res)=>{
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json'};
  if(req.method==='OPTIONS'){res.writeHead(204,headers).end();return;}
  let reply={ok:true};
  if(req.method==='POST'&&req.url==='/api/relay'){
    let raw='';for await(const chunk of req)raw+=chunk;
    const b=JSON.parse(raw);assert.equal(b.room,room);requests.push(b);
    if(b.op==='join'){reply.server='WKQ1 WKS1 WKT1 WKC1 WKV1 WKL1 Test';ready=true;expired=false;}
    if(b.op==='ping'&&ready)reply=expired?{ok:false,code:'disconnected'}:{ok:true,capabilities:{p2TvMenu:1}};
    if(b.op==='setTvInput'){
      assert.ok(ready);assert.match(b.request,/^[a-f0-9]{32}$/);actions.push(b.input);latest=b;
      reply={ok:true,request:b.request,input:b.input,status:'queued'};
    }
    if(b.op==='tvInputResult'){
      assert.equal(b.request,latest.request);reply={ok:true,request:b.request,input:latest.input,status:'sent'};
    }
  }
  res.writeHead(200,headers).end(JSON.stringify(reply));
});
await new Promise(r=>api.listen(0,'127.0.0.1',r));
const testRelay='http://127.0.0.1:'+api.address().port+'/api/relay';
const server=createServer(async(req,res)=>{
  if (new URL(req.url,'http://localhost').pathname==='/data/favorites/all.json') {
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(favorites));
    return;
  }
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root+sep)){res.writeHead(404).end();return;}
  try{
    let body=await readFile(path);
    // WebKit sends real CORS preflight requests. Use an isolated HTTP responder
    // on a second port so that both engines check CORS and no live room is used.
    if(path.endsWith('/index.html')){
      // Point the test copy's existing connect-src entry at the same test origin.
      const originalOrigin=new URL(productionRelay).origin;
      assert.ok(body.includes("connect-src 'self' "+originalOrigin));
      body=body.toString().replace("connect-src 'self' "+originalOrigin,"connect-src 'self' "+new URL(testRelay).origin);
    }
    if(path.endsWith('/relay-client.mjs')){
      assert.ok(body.includes(productionRelay));body=body.toString().replace(productionRelay,testRelay);
    }
    res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'})[extname(path)]||'application/octet-stream');
    res.end(body);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/';
try{
 for(const engine of [webkit,chromium]){
  const browser=await engine.launch();
  try{for(const lang of LANGUAGES){
    room='01234567';actions=[];ready=false;latest=null;expired=false;requests=[];
    const errors=[],httpErrors=[];
    const ctx=await browser.newContext({locale:lang.code,hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
    await ctx.route('https://raw.githubusercontent.com/**/data/favorites/all.json', route=>
      route.fulfill({json:favorites,headers:{'Access-Control-Allow-Origin':'*'}}));
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',req=>httpErrors.push([req.method(),new URL(req.url()).pathname,req.failure()?.errorText]));
    page.on('console',msg=>{if(msg.type()==='error')httpErrors.push(msg.text().slice(0,180));});
    try{
      await page.goto(url+'#language='+lang.code);
      await page.waitForFunction(code=>document.documentElement.lang===code,lang.code);
      if (lang.code==='ko-KR') {
        const saved=page.locator('#favorites-storage');
        await saved.filter({hasText:'휴대폰에 저장된 애창곡'}).waitFor();
        assert.ok((await saved.textContent()).includes(String(favorites.rows.length)));
        assert.equal(requests.length,0,'a first visit saves all countries without joining a room');
        const first=favorites.rows.find(row=>row.country==='ko');
        const unavailable=route=>route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':'*'},body:''});
        await ctx.route('**/all.json',unavailable);
        await page.reload();
        await saved.filter({hasText:'휴대폰에 저장된 애창곡'}).waitFor();
        await page.locator('#favorites-open').tap();
        await page.locator('#favorites-query').fill(first.title.slice(0,20));
        await page.locator('#favorites-search').tap();
        await page.locator('#favorites-list strong').first().waitFor();
        assert.ok((await page.locator('#favorites-list strong').allTextContents()).some(title=>title.includes(first.title.slice(0,20))));
        assert.equal(await page.locator('#favorites-list button').first().isDisabled(),true);
        assert.equal(requests.length,0,'a returning unpaired phone can browse its stored list');
        await page.locator('#favorites-open').tap();
        await ctx.unroute('**/all.json',unavailable);
      }
      const zero={'th-TH':0xe50,'ne-NP':0x966,'lo-LA':0xed0,'my-MM':0x1040,'mn-MN':0x1810,'zh-CN':0xff10}[lang.code];
      await page.locator('#code').fill(zero?room.replace(/\d/g,n=>String.fromCharCode(zero+Number(n))):room);
      assert.equal(await page.locator('#code').inputValue(),room);
      await page.locator('#code').blur();
      await page.locator('#connect').tap();
      await page.waitForFunction(()=>!document.querySelector('#remote-tv').disabled);
      assert.equal(await page.locator('#remote-tv-label').textContent(),REMOTE_TEXT[lang.code].tv);
      for(const id of ['remote-tv','tv-left','tv-right','tv-select']){
        await page.locator('#'+id).tap();
        await page.waitForFunction(expected=>document.querySelector('#remote-feedback').textContent===expected&&!document.querySelector('#tv-select').disabled,REMOTE_TEXT[lang.code].tvKeySent);
      }
      assert.deepEqual(actions,['VIDEO','LEFT','RIGHT','SELECT']);
      assert.equal(await page.locator('#tv-select').textContent(),REMOTE_TEXT[lang.code].tvSelect);
      const firstKey=requests.find(b=>b.op==='join').key;
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
      assert.equal(await page.locator('#connect').isDisabled(),true);
      assert.equal(requests.some(b=>b.op==='leave'),false);
      expired=true;
      await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new Event('focus'));});
      await page.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('Test'));
      assert.equal(requests.filter(b=>b.op==='join').length,2);
      assert.equal(requests.filter(b=>b.op==='join').at(-1).key,firstKey);
      // Real sessionStorage and actual module startup must restore on reload.
      await page.reload();
      await page.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('Test'));
      assert.equal(await page.locator('#code').inputValue(),room);
      assert.equal(requests.filter(b=>b.op==='join').at(-1).key,firstKey);
      assert.deepEqual(actions,['VIDEO','LEFT','RIGHT','SELECT'],'recovery never replays TV commands');
      await ctx.setOffline(true);
      await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
      assert.equal(await page.locator('#connect').isDisabled(),true);
      assert.equal(await page.locator('#send').isDisabled(),true);
      await ctx.setOffline(false);
      await page.evaluate(()=>window.dispatchEvent(new Event('online')));
      await page.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('Test'));
      await page.locator('#disconnect').tap();
      await page.waitForFunction(()=>!document.querySelector('#connect').disabled);
      const joins=requests.filter(b=>b.op==='join').length;
      await page.reload();
      await page.waitForFunction(()=>document.querySelector('#connect')&&!document.querySelector('#connect').disabled);
      assert.equal(requests.filter(b=>b.op==='join').length,joins,'explicit disconnect disables automatic restore');
      assert.deepEqual(errors,[]);console.log(engine.name(),lang.code,actions.join(' '));
    }catch(error){
      console.log(engine.name(),lang.code,{actions,errors,httpErrors,state:await page.locator('#connection-state').textContent(),help:await page.locator('#tv-availability').textContent()});
      throw error;
    }finally{await ctx.close();}
  }}finally{await browser.close();}
 }
}finally{server.close();api.close();}

