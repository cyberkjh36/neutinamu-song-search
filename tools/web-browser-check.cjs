const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),prefix='/neutinamu-song-search/';
const output=path.join(root,'browser-report');fs.mkdirSync(output,{recursive:true});
let networkUnavailable=false;
const server=http.createServer((req,res)=>{
 if(networkUnavailable){req.socket.destroy();return;}
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
 const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>requests.push(req.url()));
 const url='http://127.0.0.1:'+server.address().port+prefix;
 const ready=()=>page.waitForFunction(()=>document.getElementById('dbCount').textContent.includes('76,617')&&!document.getElementById('searchBtn').disabled,{},{timeout:60000});
 try{
  await page.goto(url);await ready();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  assert.equal(await page.locator('#installCTA').isVisible(),true);
  assert.equal(await page.locator('#query').isVisible(),true);
  assert.equal(await page.locator('#p2Panel,#p2Room,#p2Join').count(),0,'No PC relay or eight-digit connection form');
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
  assert.equal(await page.locator('#p2Reserve,.p2-open').count(),0,'No misleading PC reservation/remote buttons');
  assert.equal(requests.some(url=>/\/p2-(ui|client)\.mjs(?:[?#]|$)/.test(url)),false,'Legacy PC relay code must not be loaded');
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
  // WebKit's automation offline toggle can fail navigation with an internal
  // error before the worker runs. Refuse every origin request instead, so its
  // real service worker still has to serve the cached page and assets.
  if(name==='iphone-webkit')networkUnavailable=true;else await context.setOffline(true);
  await page.reload();await ready();
  await page.locator('#query').fill('ㄱㄹㅅㄱㄴㅇㄹㅅㅁ');await page.locator('#searchBtn').click();
  await page.waitForFunction(()=>document.getElementById('heroTitle').textContent==='가로수 그늘 아래 서면');
  assert.equal(await page.locator('#p2Panel,#p2Room,#p2Reserve,.p2-open').count(),0,'PC relay stays absent offline');
  networkUnavailable=false;await context.setOffline(false);
  await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true}));
  await page.goto(url);await ready();assert.equal(await page.locator('#installCTA').isVisible(),false);
  for(const room of ['1','2','3','5','6','7','8']){
   await page.goto(url+'p2-room.html?room='+room);
   assert.equal(await page.locator('#roomTitle').textContent(),room+'번방 반주기 연결');
   assert.equal(await page.locator('#connectRoom').isVisible(),name==='android-chromium');
   if(name==='android-chromium')assert.match(await page.locator('#connectRoom').getAttribute('href'),new RegExp('^intent://connect\\?room='+room+'#Intent;'));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Room page does not overflow');
  }
  await page.screenshot({path:path.join(output,name+'-room-qr.png')});
  await page.goto(url+'p2-room.html?room=1&room=5');assert.equal(await page.locator('#connectRoom').isVisible(),false);
  // A room-page navigation must never replace the cached song-search index.
  await page.goto(url);await ready();
  if(name==='iphone-webkit')networkUnavailable=true;else await context.setOffline(true);
  await page.goto(url+'p2-room.html?room=5');assert.equal(await page.locator('#roomTitle').textContent(),'5번방 반주기 연결');
  await page.goto(url);await ready();assert.equal(await page.locator('#query').isVisible(),true);
  networkUnavailable=false;await context.setOffline(false);
  const shortcutContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ua});
  const shortcutPage=await shortcutContext.newPage();
  await shortcutPage.goto(url+'?shortcut=1');
  await shortcutPage.waitForFunction(()=>document.getElementById('dbCount').textContent.includes('76,617')&&!document.getElementById('searchBtn').disabled,{},{timeout:60000});
  assert.equal(await shortcutPage.locator('#appManifest').count(),0,'Shortcut does not request a WebAPK');
  assert.equal(await shortcutPage.locator('#installHelp').isVisible(),true);
  const shortcutGuide=await shortcutPage.locator('#installHelp').textContent();
  if(name==='iphone-webkit'){assert.match(shortcutGuide,/Safari/);assert.doesNotMatch(shortcutGuide,/크롬|삼성 인터넷/);}
  else assert.match(shortcutGuide,/바로가기/);
  await shortcutPage.locator('#query').fill('ㅈㅇㅍ 꿈');await shortcutPage.locator('#searchBtn').click();
  await shortcutPage.waitForFunction(()=>document.getElementById('heroNumber').textContent==='693');
  await shortcutContext.close();
  assert.deepEqual(errors,[]);
  console.log('PASS '+name+': initials, IME, voice result/cancel, icon guide, manifest/icons, offline catalog, standalone launch, no overflow.');
 }finally{networkUnavailable=false;await context.close();await browser.close();}
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await check('android-chromium',chromium,'Mozilla/5.0 (Linux; Android 10; SM-N960N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36');
  await check('iphone-webkit',webkit,'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
