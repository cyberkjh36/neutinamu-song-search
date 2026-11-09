const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const root=path.resolve(__dirname,'../..'),data=require(path.join(root,'favorites-data.js'));
(async()=>{
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
  const page=await browser.newPage({viewport:{width:360,height:800},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.commands=[];window.NeutiP2={command(raw){commands.push(JSON.parse(raw));}};});
  await page.goto('http://127.0.0.1:'+server.address().port+'/search/index.html');
  await page.waitForFunction(()=>!document.getElementById('searchBtn').disabled&&document.getElementById('dbCount').textContent.includes('76,617'));
  const dir=process.env.CHECK_OUTPUT||path.join(root,'p2-direct/app/build/reports/p2-ui');fs.mkdirSync(dir,{recursive:true});
  assert.equal(await page.locator('#favoriteShortcuts button').count(),3);
  const initialCommands=await page.evaluate(()=>commands.length);
  // These bundled categories do not require a working internet connection or a P2 connection.
  await page.context().setOffline(true);
  for(const group of data.groups){
   await page.locator('#favoriteShortcuts [data-category='+group.id+']').click();
   assert.equal(await page.locator('#favoritesTitle').textContent(),group.label);
   assert.equal(await page.locator('.favorite-song').count(),50);
   assert.deepEqual(await page.locator('.favorite-song').evaluateAll(rows=>rows.map(row=>row.dataset.code)),group.songs.map(s=>s.code));
   assert.equal(await page.evaluate(()=>commands.length),initialCommands,'Opening or browsing cannot send controls');
   await page.locator('#favoritesClose').click();
   assert.equal(await page.locator('#favoritesPanel').isVisible(),false);
  }
  await page.locator('#favoriteShortcuts [data-category=age3040]').click();
  for(const q of ['응급실','izi','ㅇㄱㅅ','14515']){
   await page.locator('#favoritesFilter').fill(q);
   assert.equal(await page.locator('.favorite-song[data-code="14515"]').count(),1,q);
  }
  await page.locator('#favoritesFilter').fill('노래없음zzz');
  assert.equal(await page.locator('.favorite-song').count(),0);assert.equal(await page.locator('#favoritesEmpty').isVisible(),true);
  await page.locator('#favoritesClear').click();assert.equal(await page.locator('.favorite-song').count(),50);
  await page.locator('#favoritesFilter').fill('<img src=x onerror=alert(1)>');assert.equal(await page.locator('#favoritesPanel img').count(),0);
  await page.locator('#favoritesTabs [data-category=age5060]').click();
  assert.equal(await page.locator('#favoritesFilter').inputValue(),'');assert.equal(await page.locator('.favorite-song').count(),50);
  await page.locator('#favoritesTabs [data-category=trot]').click();
  for(const width of [320,360,430]){
   await page.setViewportSize({width,height:800});
   assert.ok(await page.locator('.favorites-sheet').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   for(const selector of ['.favorite-song-title','.favorite-song-artist','.favorite-song-code']){
    assert.ok(await page.locator(selector).first().evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   }
   await page.screenshot({path:dir+'/favorites-trot-'+width+'.png'});
  }
  await page.keyboard.press('Escape');assert.equal(await page.locator('#favoritesPanel').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.querySelector('main').inert),false);
  for(const width of [320,360,430]){
   await page.setViewportSize({width,height:800});await page.evaluate(()=>scrollTo(0,0));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:dir+'/favorites-home-'+width+'.png'});
  }
  // Selecting a curated song uses its exact version/artist, without playback or reservation.
  await page.locator('#favoriteShortcuts [data-category=age5060]').click();
  await page.locator('.favorite-song[data-code="10092"]').click();
  await page.waitForFunction(()=>document.getElementById('heroNumber').textContent==='10092');
  assert.equal(await page.locator('#heroArtist').textContent(),'김광석');
  assert.equal(await page.evaluate(()=>commands.length),initialCommands);
  await page.evaluate(()=>onP2NativeState({label:'● 8번방 연결됨',message:'연결됨',busy:false,connected:true}));
  await page.locator('#nativeReserve').click();await page.evaluate(()=>document.getElementById('nativeReserve').click());
  assert.deepEqual(await page.evaluate(()=>commands.filter(x=>x.command==='reserve')),[{command:'reserve',number:'10092'}]);
  await page.evaluate(()=>onP2NativeState({label:'● 8번방 연결됨',message:'예약됨',busy:false,connected:true}));
  // A pending speech result cannot overwrite a newer selection.
  await page.locator('#voiceBtn').click();
  await page.locator('#favoriteShortcuts [data-category=age3040]').click();
  await page.locator('.favorite-song[data-code="14515"]').click();
  await page.waitForFunction(()=>document.getElementById('heroNumber').textContent==='14515');
  await page.evaluate(()=>onP2NativeVoice(['조용필 꿈'],''));
  assert.equal(await page.locator('#heroNumber').textContent(),'14515');
  await page.locator('#nativePlay').click();
  assert.deepEqual(await page.evaluate(()=>commands.filter(x=>x.command==='play')),[{command:'play',number:'14515'}]);
  await page.evaluate(()=>onP2NativeState({label:'● 8번방 연결됨',message:'요청 완료',busy:false,connected:true}));
  await page.locator('#nativeQueue').click();
  await page.evaluate(()=>{onP2NativeQueue({songs:[10092,14515],valid:true,message:'예약곡 2곡'});onP2NativeState({label:'● 8번방 연결됨',message:'목록 확인',busy:false,connected:true});});
  await page.waitForFunction(()=>document.querySelectorAll('#nativeQueueList li').length===2);
  assert.equal(await page.locator('#favoritesPanel').isVisible(),false);
  await page.locator('#nativeQueueClose').click();
  assert.deepEqual(errors,[]);
  console.log('PASS favorites: 150 catalog-backed entries, offline categories, title/artist/initial/number filtering, literal queries, exact version selection, stale voice protection, explicit play/reserve and unchanged reservation list, 320/360/430px layouts.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
