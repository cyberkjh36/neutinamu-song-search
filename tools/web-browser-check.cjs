const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),prefix='/neutinamu-song-search/';
const output=path.join(root,'browser-report');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
 const relative=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html';
 const file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 const ext=path.extname(file),types={'.html':'text/html;charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.csv':'text/csv;charset=utf-8'};
 try{res.setHeader('Content-Type',types[ext]||'text/plain');res.setHeader('Cache-Control','no-cache');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
async function check(name,type,ua){
 const browser=await type.launch(name==='android-chromium'?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome'}:{});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,userAgent:ua});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port+prefix;
 const ready=()=>page.waitForFunction(()=>document.getElementById('dbCount').textContent.includes('76,617')&&!document.getElementById('searchBtn').disabled,{},{timeout:60000});
 try{
  await page.goto(url);await ready();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  assert.equal(await page.locator('#installCTA').isVisible(),true);
  assert.equal(await page.locator('#query').isVisible(),true);
  assert.ok((await page.locator('#query').boundingBox()).y<750,'Search is reachable on the first screen');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  const manifest=await (await context.request.get(url+'manifest.webmanifest')).json();
  assert.equal(manifest.start_url,'./');assert.equal(manifest.display,'standalone');assert.equal(manifest.id,'./');
  for(const icon of manifest.icons)assert.equal((await context.request.get(url+icon.src)).status(),200);
  await page.screenshot({path:path.join(output,name+'-home.png')});
  await page.locator('#installBtn').click();
  assert.equal(await page.locator('#installHelp').isVisible(),true);
  const guide=await page.locator('#installHelp').textContent();
  assert.match(guide,/홈 화면에 추가/);
  if(name==='iphone-webkit'){assert.match(guide,/Safari/);assert.match(guide,/공유/);assert.match(guide,/동작 편집/);assert.equal(await page.locator('#browserButtons').isVisible(),false);}
  else assert.match(guide,/크롬/);
  await page.locator('#installHelp').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,name+'-add-icon.png')});
  await page.locator('#query').fill('ㅈㅇㅍ 꿈');
  await page.locator('#query').dispatchEvent('keydown',{key:'Enter',isComposing:true});
  assert.equal(await page.locator('#hero').isVisible(),false,'Typing or confirming an IME character does not search');
  await page.locator('#searchBtn').click();
  await page.waitForFunction(()=>document.getElementById('heroNumber').textContent==='693');
  assert.equal(await page.locator('#heroTitle').textContent(),'꿈');
  assert.equal(await page.locator('#heroArtist').textContent(),'조용필');
  assert.equal(await page.locator('#p2Reserve').isVisible(),false,'No unusable reservation button without a bridge');
  await page.locator('#hero').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,name+'-result.png')});
  // Exercise the browser voice UI with a deterministic recognition result, not live audio.
  await page.evaluate(()=>{window.SpeechRecognition=class{start(){window.testRecognition=this;}abort(){}};});
  await page.locator('#voiceBtn').click();
  await page.evaluate(()=>testRecognition.onaudiostart());
  assert.match(await page.locator('#voiceDialogStatus').textContent(),/듣고/);
  await page.evaluate(()=>testRecognition.onresult({resultIndex:0,results:[[{transcript:'꿈 조용필'}]]}));
  await page.waitForFunction(()=>document.getElementById('heroNumber').textContent==='693'&&!document.getElementById('voiceDialog').open);
  await page.locator('#voiceBtn').click();await page.locator('#voiceCancelBtn').click();
  assert.equal(await page.locator('#voiceBtn').isEnabled(),true);
  // The real service worker and stored catalog must work with all networking disabled.
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await page.reload();await ready();
  await page.locator('#query').fill('ㄱㄹㅅㄱㄴㅇㄹㅅㅁ');await page.locator('#searchBtn').click();
  await page.waitForFunction(()=>document.getElementById('heroTitle').textContent==='가로수 그늘 아래 서면');
  await context.setOffline(false);
  await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true}));
  await page.goto(url);await ready();assert.equal(await page.locator('#installCTA').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS '+name+': initials, IME, voice result/cancel, icon guide, manifest/icons, offline catalog, standalone launch, no overflow.');
 }finally{await context.close();await browser.close();}
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await check('android-chromium',chromium,'Mozilla/5.0 (Linux; Android 10; SM-N960N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36');
  await check('iphone-webkit',webkit,'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
