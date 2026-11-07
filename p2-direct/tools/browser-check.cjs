const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
(async()=>{
 const path=require('node:path'),http=require('node:http'),root=path.resolve(__dirname,'../..');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname.replace(/^\/search\//,'/');
  const file=path.join(root,pathname==='/'?'index.html':pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html':/\.(m?js)$/.test(file)?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/plain');
   res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'");res.end(fs.readFileSync(file));}catch(e){res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
 try{
  const page=await browser.newPage({viewport:{width:360,height:740},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.commands=[];window.saved=[];window.NeutiP2={command(raw){window.commands.push(JSON.parse(raw));},saveCsv(name,text){window.saved.push({name,length:text.length,bytes:new TextEncoder().encode(text).length,header:text.slice(0,30)});}};});
  await page.goto(process.env.SEARCH_URL||'http://127.0.0.1:'+server.address().port+'/search/index.html');
  await page.waitForFunction(()=>document.getElementById('dbCount').textContent.includes('76,617')&&!document.getElementById('searchBtn').disabled);
  assert.equal(await page.locator('#p2Room').count(),0,'Native app must not ask for PC relay code');
  assert.equal(await page.locator('#nativeConnect').isVisible(),true);
  assert.match(await page.locator('#voiceBtn').textContent(),/음성으로 노래 찾기/);
  assert.match(await page.locator('main').textContent(),/ㅅㄹ → 사랑/);
  assert.equal(await page.locator('#installCTA').isVisible(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const dir=process.env.CHECK_OUTPUT||path.join(root,'p2-direct/app/build/reports/p2-ui');fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:dir+'/search-home.png'});
  await page.locator('#query').fill('ㄱㄹㅅㄱㄴㅇㄹㅅㅁ');await page.locator('#searchBtn').click();
  await page.waitForFunction(()=>document.getElementById('heroTitle').textContent==='가로수 그늘 아래 서면');
  assert.equal(await page.evaluate(()=>commands.some(x=>x.command==='play')),false);
  await page.locator('.result').filter({has:page.getByText('3',{exact:true})}).click();
  assert.equal(await page.locator('#heroNumber').textContent(),'3');assert.equal(await page.evaluate(()=>commands.some(x=>x.command==='play')),false);
  await page.locator('#nativePlay').click();await page.evaluate(()=>document.getElementById('nativePlay').click());
  assert.equal(await page.evaluate(()=>commands.filter(x=>x.command==='play').length),1);
  assert.equal(await page.evaluate(()=>commands.find(x=>x.command==='play').number),'3');
  await page.evaluate(()=>onP2NativeState({label:'● P2 연결됨',message:'시작 요청에 대한 응답을 확인했습니다.',busy:false}));
  await page.screenshot({path:dir+'/search-result.png',fullPage:true});
  await page.locator('#nativeNew').click();assert.equal(await page.locator('#query').inputValue(),'');
  assert.equal(await page.locator('#hero').isVisible(),false);assert.equal(await page.evaluate(()=>commands.filter(x=>x.command==='cancel').length),0);
  await page.locator('#nativeStop').click();assert.equal(await page.evaluate(()=>commands.filter(x=>x.command==='cancel').length),1);
  await page.locator('#voiceBtn').click();assert.equal(await page.evaluate(()=>commands.at(-1).command),'voice');
  await page.evaluate(()=>onP2NativeVoice(['no such song zzz','조용필 꿈'],''));
  await page.waitForFunction(()=>document.getElementById('heroNumber').textContent==='693');
  await page.locator('#voiceBtn').click();await page.locator('#query').fill('새 검색어');
  await page.evaluate(()=>onP2NativeVoice(['오래된 결과'],''));assert.equal(await page.locator('#query').inputValue(),'새 검색어');
  assert.equal(await page.locator('#voiceBtn').isEnabled(),true);
  await page.locator('#voiceBtn').click();await page.evaluate(()=>onP2NativeVoice([],'음성 검색을 취소했습니다.'));
  assert.equal(await page.locator('#voiceBtn').isEnabled(),true);assert.match(await page.locator('#message').textContent(),/취소/);
  await page.locator('#exportBtn').click();await page.waitForFunction(()=>saved.length===1);assert.ok(await page.evaluate(()=>saved[0].bytes>3000000));
  await page.locator('#fileInput').dispatchEvent('click');assert.equal(await page.evaluate(()=>commands.at(-1).command),'import');
  await page.evaluate(()=>onP2NativeImport('곡번호,곡제목,가수\n777777,한글테스트,가수\n777778,<img src=x onerror=alert(1)>,가수',''));
  await page.locator('#query').fill('ㅎㄱㅌㅅㅌ');await page.locator('#searchBtn').click();
  await page.waitForFunction(()=>document.getElementById('heroNumber').textContent==='777777');
  await page.locator('#query').fill('777778');await page.locator('#searchBtn').click();
  await page.waitForFunction(()=>document.getElementById('heroNumber').textContent==='777778');assert.equal(await page.locator('#heroTitle img').count(),0);
  assert.equal(await page.evaluate(()=>commands.filter(x=>x.command==='play').length),1);
  assert.deepEqual(errors,[]);
  console.log('PASS: bundled catalog, initials, voice alternatives/cancel/stale results, selection/play/cancel, duplicate tap guard, CSV import/export, literal titles, compact layout.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
