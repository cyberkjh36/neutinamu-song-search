// Controlled real browser checks. Speech/relay are test doubles, not device microphone tests.
// NODE_MODULES path may be supplied through CODEX_PRIMARY_RUNTIME_NODE_MODULES.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import {LANGUAGES} from '../wk/labels.mjs';
const require=createRequire(import.meta.url);
const {webkit,chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright-core' : 'playwright-core');
const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.WK_TEST_OUTPUT || path.join(root,'../iphone-browser-validation');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'), isBaseline=url.pathname.startsWith('/baseline/');
    const base=isBaseline?process.env.WK_BASELINE:root;
    if(!base){res.writeHead(404).end();return;}
    const part=decodeURIComponent(url.pathname.replace(/^\/baseline/,''));
    const file=path.resolve(base,'.'+(part.endsWith('/')?part+'index.html':part));
    if(!file.startsWith(path.resolve(base)+path.sep)){res.writeHead(403).end();return;}
    const body=await readFile(file),ext=path.extname(file);
    res.writeHead(200,{'Content-Type':{'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[ext]||'text/plain','Cache-Control':'no-store'}).end(body);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,cases=[];
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1';
const android='Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36';
function pass(engine,name){cases.push({engine,name});console.log('PASS',engine,name);}
async function pageFor(browser,{oldDialog=false,mode='normal',apple=true,baseline=false,width=390}={}){
  const context=await browser.newContext({viewport:{width,height:844},userAgent:apple?iphone:android,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const requests=[],errors=[];
  await context.route('https://world-karaoke-connect.almondjoy11.chatgpt.site/**',async route=>{
    const request=route.request();if(request.method()==='POST')requests.push(request.postDataJSON());
    await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json'},body:JSON.stringify({ok:true,server:'TEST-PC',pending:false,result:true})});
  });
  await context.addInitScript(({oldDialog,mode})=>{
    window.__speechMode=mode;window.__speech=[];window.__tap=false;
    // A browser may run a microtask checkpoint between event listeners. Keep the
    // marker until the click task ends; unit tests separately verify sync start.
    document.addEventListener('click',event=>{window.__tap=event.isTrusted;setTimeout(()=>window.__tap=false,0);},true);
    class Speech {
      constructor(){if(window.__speechMode==='constructor')throw Error('Speech service unavailable');window.__speech.push(this);}
      start(){this.inTap=window.__tap;if(window.__speechMode==='throw')throw new DOMException('Permission denied','NotAllowedError');this.started=true;}
      stop(){this.stopped=true;this.onend?.();}
      abort(){this.aborted=true;this.onend?.();}
    }
    Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:undefined});
    Object.defineProperty(window,'webkitSpeechRecognition',{configurable:true,value:mode==='missing'?undefined:Speech});
    if(oldDialog&&window.HTMLDialogElement){HTMLDialogElement.prototype.showModal=undefined;HTMLDialogElement.prototype.close=undefined;}
    window.__result=(text,final=true)=>{const r=[{transcript:text}];r.isFinal=final;window.__speech.at(-1).onresult?.({resultIndex:0,results:[r]});};
  },{oldDialog,mode});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.goto(base+(baseline?'/baseline':'')+'/wk/?v=2.3#room=12345678&language=ko-KR');
  await page.waitForFunction(()=>document.querySelector('#countries').children.length===11);
  return {context,page,requests,errors};
}
async function finish(page,text='새 노래',final=true){await page.evaluate(({text,final})=>{window.__result(text,final);window.__speech.at(-1).onend?.();},{text,final});}
try{
 for(const engine of (process.env.WK_ENGINES || 'webkit,chromium').split(',')){
  const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'&&process.env.WK_CHROMIUM?{headless:true,executablePath:process.env.WK_CHROMIUM,args:['--no-sandbox']}:{headless:true});
  try{
   if(process.env.WK_BASELINE){const f=await pageFor(browser,{oldDialog:true,baseline:true});await f.page.click('#voice');assert.ok(f.errors.some(e=>/showModal/.test(e)));assert.equal(await f.page.evaluate(()=>Boolean(window.__speech[0]?.started)),false);pass(engine,'Baseline reproduced: missing showModal prevents recognition.start');await f.context.close();}
   {
    const f=await pageFor(browser,{oldDialog:true});const {page}=f;
    await page.click('#connect');await page.waitForFunction(()=>document.querySelector('#connect').disabled&&document.querySelector('#connection-state').textContent.includes('TEST-PC'));
    await page.click('#voice');assert.equal(await page.evaluate(()=>window.__speech[0].started&&window.__speech[0].inTap),true);
    assert.equal(await page.locator('#listening').isVisible(),true);assert.equal(await page.locator('#listening').evaluate(el=>el.classList.contains('fallback-modal')),true);
    await page.screenshot({path:path.join(output,engine+'-legacy-dialog.png'),fullPage:true});
    await finish(page);assert.equal(await page.inputValue('#query'),'새 노래');assert.equal(f.requests.filter(r=>r.op==='search').length,0);
    await page.click('#send');await page.waitForFunction(()=>document.querySelector('#send').textContent==='다음 곡 검색');
    assert.equal(f.requests.filter(r=>r.op==='search').length,1);assert.equal(f.requests.find(r=>r.op==='search').text,'새 노래');
    await page.click('#send');assert.equal(await page.inputValue('#query'),'');assert.equal(await page.inputValue('#code'),'12345678');
    assert.deepEqual(f.errors,[]);pass(engine,'Older dialog fallback starts during real tap, fills draft and sends only on Search; next search preserves connection');await f.context.close();
   }
   {
    const f=await pageFor(browser);const {page}=f;await page.click('#voice');await page.clock.runFor(12001);
    assert.equal(await page.locator('#voice-retry').isVisible(),true);assert.match(await page.textContent('#voice-status'),/응답이 없습니다/);
    assert.equal(await page.locator('#voice').isEnabled(),true);assert.equal(await page.evaluate(()=>window.__speech[0].aborted),true);
    await page.screenshot({path:path.join(output,engine+'-timeout.png'),fullPage:true});
    await page.click('#voice-retry');assert.equal(await page.evaluate(()=>window.__speech.at(-1).inTap),true);await finish(page,'다시 부를 노래');
    assert.equal(await page.inputValue('#query'),'다시 부를 노래');assert.deepEqual(f.errors,[]);pass(engine,'Silent API times out visibly; direct-tap retry succeeds with no stale handlers');await f.context.close();
   }
   for(const mode of ['missing','constructor','throw']){
    const f=await pageFor(browser,{mode});await f.page.fill('#query','직접 입력한 노래');await f.page.click('#voice');
    assert.equal(await f.page.locator('#voice-keyboard').isVisible(),true);await f.page.click('#voice-keyboard');
    assert.equal(await f.page.locator('#listening').isVisible(),false);assert.equal(await f.page.evaluate(()=>document.activeElement.id),'query');
    assert.equal(await f.page.inputValue('#query'),'직접 입력한 노래');assert.equal(await f.page.inputValue('#code'),'12345678');assert.deepEqual(f.errors,[]);
    pass(engine,mode+' failure keeps recovery visible, focuses input in a tap and preserves draft/room');await f.context.close();
   }
   {
    const f=await pageFor(browser,{apple:false});const {page}=f;
    for(const {code} of LANGUAGES){
      await page.locator('#country-picker').evaluate(el=>el.open=true);await page.locator('.country[lang="'+code+'"]').click();
      await page.click('#voice');assert.equal(await page.evaluate(()=>window.__speech.at(-1).lang),code);await finish(page,'Title '+code);
      assert.equal(await page.inputValue('#query'),'Title '+code);assert.equal(await page.locator('#listening').isVisible(),false);
    }
    assert.deepEqual(f.errors,[]);assert.equal(f.requests.length,0);pass(engine,'All eleven language selections and Android-style native dialog dictation remain functional without auto search');await f.context.close();
   }
   {
    const f=await pageFor(browser,{oldDialog:true,width:320});const {page}=f;
    for(const {code} of LANGUAGES){
      await page.locator('#country-picker').evaluate(el=>el.open=true);await page.locator('.country[lang="'+code+'"]').click();
      await page.click('#voice');await page.evaluate(()=>window.__speech.at(-1).onerror({error:'not-allowed'}));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,code+' overflow');
      await page.locator('#voice-keyboard').scrollIntoViewIfNeeded();assert.equal(await page.locator('#voice-keyboard').isVisible(),true);
      await page.click('#voice-keyboard');assert.equal(await page.evaluate(()=>document.activeElement.id),'query');
    }
    assert.deepEqual(f.errors,[]);pass(engine,'All eleven recovery translations fit a 320px viewport; scrollable legacy overlay keeps keyboard action usable');await f.context.close();
   }
   {
    const f=await pageFor(browser);await f.page.click('#voice');await finish(f.page,'확인할 임시 결과',false);
    assert.equal(await f.page.inputValue('#query'),'확인할 임시 결과');assert.equal(f.requests.length,0);
    await f.page.click('#voice');await f.page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await f.page.locator('#listening').isVisible(),false);
    assert.equal(await f.page.evaluate(()=>window.__speech.at(-1).aborted),true);assert.deepEqual(f.errors,[]);pass(engine,'Interim-only Safari result remains a draft; pagehide aborts microphone and clears UI');await f.context.close();
   }
  }finally{await browser.close();}
 }
 await writeFile(path.join(output,'results.json'),JSON.stringify({passed:cases.length,engines:[...new Set(cases.map(c=>c.engine))],cases,scope:'Selected Linux browsers with simulated speech service/relay, real DOM/clicks. Old dialog APIs deliberately removed. Not physical iPhone 11/iPhone 18 microphone validation.'},null,2));
}finally{await new Promise(resolve=>server.close(resolve));}
