// Real DOM/click tests; iOS UAs emulate presentation only. Native OS app launch,
// microphones and the PC relay are not available here and are not claimed tested.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {LANGUAGES} from '../wk/labels.mjs';
import {SAFARI_TEXT} from '../wk/safari-text.mjs';
import {readHandoff} from '../wk/chrome-handoff.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright-core');
const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.WK_TEST_OUTPUT||path.join(root,'../safari-handoff-validation');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try {
    const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+u.pathname+(u.pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root))throw Error('path');
    res.writeHead(200,{'Content-Type':{'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'application/octet-stream'}).end(await readFile(file));
  } catch {res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.WK_CHROMIUM,args:['--no-sandbox']});
const cases=[];
const pass=name=>{cases.push(name);console.log('PASS',name);};
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
async function setup({ua=iphone,arrival=false,clipboard='success',width=390}={}) {
  const context=await browser.newContext({viewport:{width,height:844},userAgent:ua,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const sent=[],errors=[];
  await context.route('https://world-karaoke-connect.almondjoy11.chatgpt.site/**',async route=>{
    if(route.request().method()==='POST')sent.push(route.request().postDataJSON());
    await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json'},body:JSON.stringify({ok:true,server:'TEST-PC',pending:false,result:true})});
  });
  await context.addInitScript(({clipboard})=>{
    window.__launches=[];window.__copied=[];
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{
      if(clipboard==='denied')throw new DOMException('Denied','NotAllowedError');
      window.__copied.push(text);
    }}});
    if(clipboard==='denied')document.execCommand=()=>false;
    // Let app click handlers run, then intercept the external scheme because this
    // Linux browser cannot launch iOS Safari. This does not simulate OS success.
    document.addEventListener('click',event=>{
      const link=event.target.closest?.('#safari-open');
      if(link){window.__launches.push({href:link.href,blocked:event.defaultPrevented,trusted:event.isTrusted});event.preventDefault();}
    });
    window.webkitSpeechRecognition=class{constructor(){window.__speech=this;}start(){}abort(){this.onend?.();}stop(){this.onend?.();}};
  },{clipboard});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/wk/?v=2.6'+(arrival?'&safariHandoff=1':'')+'#room=12345678&language=ko-KR');
  await page.waitForFunction(()=>document.querySelector('#countries').children.length===11);
  return {page,context,sent,errors};
}
try {
  {
    const f=await setup(),{page}=f;
    assert.equal(await page.locator('#safari-handoff').isVisible(),true);
    assert.equal(await page.locator('#safari-open').isVisible(),true);
    assert.equal(await page.locator('#chrome-handoff').isVisible(),false);
    assert.equal(f.sent.length,0);assert.deepEqual(await page.evaluate(()=>window.__launches),[]);
    await page.screenshot({path:path.join(output,'iphone-safari-entry.png'),fullPage:true});
    pass('iPhone QR entry shows Safari action without automatic navigation, relay calls or microphone startup');
    for(const {code} of LANGUAGES){
      await page.locator('#country-picker').evaluate(el=>el.open=true);
      await page.locator('.country[lang="'+code+'"]').click();
      await page.fill('#code','87654321');await page.fill('#query','เพลง & 노래 https://example.com');
      const href=await page.getAttribute('#safari-open','href');
      const state=readHandoff(new URL(href.replace(/^x-safari-https:/,'https:')).hash);
      assert.deepEqual(state,{room:'87654321',language:code,query:'เพลง & 노래 https://example.com'});
      assert.equal(await page.textContent('#safari-open-label'),SAFARI_TEXT[code].open);
      await page.setViewportSize({width:320,height:760});
      await page.locator('#safari-help').evaluate(el=>el.open=true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,code);
    }
    pass('11 languages retain edited room/draft in Safari target and fit a 320px screen with recovery expanded');
    await page.click('#connect');await page.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('TEST-PC'));
    await page.click('#safari-open');
    const launch=await page.evaluate(()=>window.__launches.at(-1));assert.ok(launch.trusted&&!launch.blocked);
    assert.match(launch.href,/^x-safari-https:\/\/cyberkjh36.github.io\/neutinamu-song-search\/wk\//);
    assert.equal(f.sent.filter(x=>x.op==='leave').length,0);
    assert.equal(await page.isDisabled('#send'),false);
    await page.click('#safari-copy');
    const copied=await page.evaluate(()=>window.__copied.at(-1));
    assert.ok(copied.startsWith('https://'));assert.equal(readHandoff(new URL(copied).hash).room,'87654321');
    assert.equal(await page.textContent('#safari-copy-feedback'),SAFARI_TEXT['ja-JP'].copied);
    pass('trusted Safari tap uses current fields; blocked native launch keeps PC session; copy preserves the same URL');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));});
    await page.waitForFunction(()=>!document.querySelector('#connect').disabled);
    assert.equal(f.sent.filter(x=>x.op==='leave').length,1);assert.deepEqual(f.errors,[]);
    pass('actual page background after a handoff attempt releases the previous relay slot');await f.context.close();
  }
  {
    const f=await setup({clipboard:'denied'}),{page}=f;
    await page.locator('#safari-help').evaluate(el=>el.open=true);await page.click('#safari-copy');
    assert.equal(await page.textContent('#safari-copy-feedback'),SAFARI_TEXT['ko-KR'].select);
    assert.equal(await page.evaluate(()=>{const e=document.querySelector('#safari-url');return e.selectionStart===0&&e.selectionEnd===e.value.length;}),true);
    assert.equal(await page.isVisible('#safari-url'),true);assert.equal(f.sent.length,0);
    await page.screenshot({path:path.join(output,'iphone-copy-fallback.png'),fullPage:true});
    await page.click('#safari-continue');assert.equal(await page.locator('#safari-handoff').evaluate(e=>e.open),false);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'connect');assert.deepEqual(f.errors,[]);
    pass('denied clipboard leaves selected complete URL and clear manual copy guidance; Continue restores PC-connect focus');await f.context.close();
  }
  {
    const f=await setup({arrival:true}),{page}=f;
    assert.equal(await page.locator('#safari-handoff').evaluate(e=>e.open),false);
    assert.equal(await page.inputValue('#code'),'12345678');assert.equal(f.sent.length,0);
    assert.deepEqual(await page.evaluate(()=>window.__launches),[]);
    await page.click('#connect');await page.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('TEST-PC'));
    await page.click('#voice');
    // Even a programmatic activation of the background link must be blocked.
    await page.evaluate(()=>document.querySelector('#safari-open').click());
    assert.equal(await page.evaluate(()=>window.__launches.at(-1).blocked),true);
    await page.evaluate(()=>{const r=[{transcript:'Safari 새 노래'}];r.isFinal=true;window.__speech.onresult({resultIndex:0,results:[r]});window.__speech.onend();});
    assert.equal(await page.inputValue('#query'),'Safari 새 노래');assert.equal(f.sent.filter(x=>x.op==='search').length,0);
    await page.click('#send');await page.waitForFunction(()=>document.querySelector('#send').textContent==='다음 곡 검색');
    assert.equal(f.sent.filter(x=>x.op==='search').length,1);
    await page.click('#send');assert.equal(await page.inputValue('#query'),'');assert.equal(await page.inputValue('#code'),'12345678');
    assert.deepEqual(f.errors,[]);pass('handoff arrival avoids repeated prompts, connects explicitly, blocks switching during speech and preserves next-song search');await f.context.close();
  }
  for(const ua of [
    'Mozilla/5.0 (Linux; Android 10) Chrome/126.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 10) SamsungBrowser/28.0 Chrome/126.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36'
  ]) {
    const f=await setup({ua});assert.equal(await f.page.isVisible('#safari-handoff'),false);
    assert.equal(await f.page.isVisible('#chrome-handoff'),ua.includes('SamsungBrowser'));
    assert.equal(f.sent.length,0);assert.deepEqual(f.errors,[]);await f.context.close();
  }
  pass('Android Chrome, Samsung Internet and desktop retain existing behavior without Safari links');
  await writeFile(path.join(output,'safari-results.json'),JSON.stringify({passed:cases.length,cases,scope:'Chromium DOM/click/clipboard tests with iPhone UAs. Relay and speech mocked. Native iOS Safari app switching and physical microphones require device confirmation.'},null,2));
} finally {await browser.close();await new Promise(r=>server.close(r));}
