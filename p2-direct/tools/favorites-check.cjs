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
  await page.addInitScript(()=>{window.commands=[];window.NeutiP2={command(raw){
   const command=JSON.parse(raw);commands.push(command);
   if(command.command==='personalRemove')localStorage.setItem('personal-fixture',JSON.stringify(JSON.parse(localStorage.getItem('personal-fixture')||'[]').filter(row=>String(row.number)!==command.number)));
   if(['personalSongs','personalRemove'].includes(command.command))setTimeout(()=>window.onP2NativePersonalSongs({songs:JSON.parse(localStorage.getItem('personal-fixture')||'[]'),error:''}),0);
  }};});
  await page.goto('http://127.0.0.1:'+server.address().port+'/search/index.html');
  await page.waitForFunction(()=>!document.getElementById('searchBtn').disabled&&document.getElementById('dbCount').textContent.includes('76,617'));
  const dir=process.env.CHECK_OUTPUT||path.join(root,'p2-direct/app/build/reports/p2-ui');fs.mkdirSync(dir,{recursive:true});
  assert.equal(await page.locator('#favoriteShortcuts button').count(),4);
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
  // Disconnected requests stay in the list and do not send a command.
  await page.locator('#favoriteShortcuts [data-category=age5060]').click();
  assert.equal(await page.locator('.favorite-song-select').first().textContent(),'＋ 예약');
  await page.locator('.favorite-song[data-code="10092"]').click();
  await page.waitForFunction(()=>document.getElementById('favoritesCount').textContent.includes('먼저 P2에 연결'));
  assert.equal(await page.locator('#favoritesPanel').isVisible(),true);
  assert.equal(await page.locator('#heroArtist').textContent(),'김광석');
  assert.equal(await page.evaluate(()=>commands.length),initialCommands);
  await page.evaluate(()=>onP2NativeState({label:'● 8번방 연결됨',message:'연결됨',busy:false,connected:true}));
  // Double taps reserve the exact artist/version once; never play or stop.
  await page.evaluate(()=>{const b=document.querySelector('.favorite-song[data-code="10092"]');b.click();b.click();});
  await page.waitForFunction(()=>document.getElementById('favoritesPanel').hidden);
  assert.deepEqual(await page.evaluate(()=>commands.filter(x=>x.command==='reserve')),[{command:'reserve',number:'10092'}]);
  assert.equal(await page.evaluate(()=>commands.filter(x=>['play','cancel','next'].includes(x.command)).length),0);
  assert.ok((await page.locator('#nativeAction').textContent()).includes('예약 요청 중'));
  await page.locator('#favoriteShortcuts [data-category=age3040]').click();
  await page.locator('.favorite-song[data-code="14515"]').click();
  await page.waitForFunction(()=>document.getElementById('favoritesCount').textContent.includes('이전 요청'));
  assert.equal(await page.evaluate(()=>commands.filter(x=>x.command==='reserve').length),1);
  // A connection loss cannot dispatch another reservation.
  await page.evaluate(()=>onP2NativeState({label:'연결 끊김',message:'연결 끊김',busy:false,connected:false}));
  await page.locator('.favorite-song[data-code="14515"]').click();
  await page.waitForFunction(()=>document.getElementById('favoritesCount').textContent.includes('먼저 P2에 연결'));
  assert.equal(await page.evaluate(()=>commands.filter(x=>x.command==='reserve').length),1);
  await page.locator('#favoritesClose').click();
  await page.evaluate(()=>onP2NativeState({label:'● 8번방 연결됨',message:'예약됨',busy:false,connected:true}));
  // Closing while song data is being read cancels the pending tap.
  await page.locator('#favoriteShortcuts [data-category=age3040]').click();
  await page.evaluate(()=>{window.originalFavoriteSearch=search;window.search=async()=>{await new Promise(resolve=>window.releaseFavoriteSearch=resolve);await originalFavoriteSearch();};document.querySelector('.favorite-song[data-code="14515"]').click();});
  await page.locator('#favoritesClose').click();
  await page.evaluate(async()=>{releaseFavoriteSearch();await new Promise(resolve=>setTimeout(resolve,100));window.search=originalFavoriteSearch;});
  assert.equal(await page.evaluate(()=>commands.filter(x=>x.command==='reserve').length),1);
  assert.ok((await page.evaluate(()=>P2Remote.reserveSelected('914'))).includes('곡 정보를'));
  // A pending speech result cannot overwrite a newer favorite reservation.
  await page.locator('#voiceBtn').click();
  await page.locator('#favoriteShortcuts [data-category=age3040]').click();
  await page.locator('.favorite-song[data-code="14515"]').click();
  await page.waitForFunction(()=>document.getElementById('favoritesPanel').hidden);
  await page.evaluate(()=>onP2NativeVoice(['조용필 꿈'],''));
  assert.equal(await page.locator('#heroNumber').textContent(),'14515');
  assert.deepEqual(await page.evaluate(()=>commands.filter(x=>x.command==='reserve')),[{command:'reserve',number:'10092'},{command:'reserve',number:'14515'}]);
  assert.equal(await page.evaluate(()=>commands.filter(x=>x.command==='play').length),0);
  await page.evaluate(()=>onP2NativeState({label:'● 8번방 연결됨',message:'예약 완료',busy:false,connected:true}));
  await page.locator('#nativePlay').click();
  assert.deepEqual(await page.evaluate(()=>commands.filter(x=>x.command==='play')),[{command:'play',number:'14515'}]);
  await page.evaluate(()=>onP2NativeState({label:'● 8번방 연결됨',message:'요청 완료',busy:false,connected:true}));
  await page.locator('#nativeQueue').click();
  await page.evaluate(()=>{onP2NativeQueue({songs:[10092,14515],valid:true,message:'예약곡 2곡'});onP2NativeState({label:'● 8번방 연결됨',message:'목록 확인',busy:false,connected:true});});
  await page.waitForFunction(()=>document.querySelectorAll('#nativeQueueList li').length===2);
  assert.equal(await page.locator('#favoritesPanel').isVisible(),false);
  await page.locator('#nativeQueueClose').click();
  // Personal history is requested locally, works offline and does not run a song on open.
  await page.evaluate(()=>onP2NativeState({label:'연결 전',message:'',busy:false,connected:false}));
  await page.locator('#favoriteShortcuts [data-category=mine]').click();
  await page.waitForFunction(()=>document.getElementById('favoritesCount').textContent==='내 애창곡 0곡');
  assert.ok((await page.locator('#favoritesEmpty').textContent()).includes('아직 저장된 곡이 없습니다'));
  assert.equal(await page.locator('.favorites-source').isVisible(),false);
  assert.equal(await page.locator('#personalHint').isVisible(),true);
  await page.evaluate(()=>onP2NativePlayback({number:914,known:true}));
  assert.equal(await page.locator('.favorite-song').count(),0,'Another phone playback never creates personal history in the UI');
  await page.evaluate(()=>{const songs=[{number:914,lastPlayed:2000},{number:14515,lastPlayed:1000}];localStorage.setItem('personal-fixture',JSON.stringify(songs));onP2NativePersonalSongs({songs,error:''});});
  await page.waitForFunction(()=>document.querySelectorAll('.favorite-song').length===2);
  assert.equal(await page.locator('.favorite-song[data-code="914"] .favorite-song-artist').textContent(),'조용필');
  for(const width of [320,360,430]){await page.setViewportSize({width,height:800});await page.screenshot({path:dir+'/personal-favorites-'+width+'.png'});assert.ok(await page.locator('.favorites-sheet').evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
  await page.locator('#favoritesFilter').fill('ㅇㄱㅅ');assert.equal(await page.locator('.favorite-song').count(),1);
  await page.locator('.favorite-song[data-code="14515"]').click();
  await page.waitForFunction(()=>document.getElementById('favoritesCount').textContent.includes('먼저 P2에 연결'));
  const beforePersonalReserve=await page.evaluate(()=>commands.filter(c=>c.command==='reserve').length);
  await page.evaluate(()=>onP2NativeState({label:'연결됨',message:'',busy:false,connected:true}));
  await page.locator('.favorite-song[data-code="14515"]').click();await page.waitForFunction(()=>document.getElementById('favoritesPanel').hidden);
  assert.equal(await page.evaluate(()=>commands.filter(c=>c.command==='reserve').length),beforePersonalReserve+1);
  assert.equal(await page.evaluate(()=>commands.filter(c=>c.command==='reserve').at(-1).number),'14515');
  await page.evaluate(()=>onP2NativeState({label:'연결됨',message:'예약됨',busy:false,connected:true}));
  await page.locator('#favoriteShortcuts [data-category=mine]').click();await page.waitForFunction(()=>document.querySelectorAll('.favorite-song').length===2);
  const beforeDelete=await page.evaluate(()=>commands.filter(c=>['play','cancel','queueCancel','reserve','next'].includes(c.command)).length);
  page.once('dialog',dialog=>dialog.accept());await page.locator('.personal-remove').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.favorite-song').length===1);
  assert.equal(await page.evaluate(()=>commands.filter(c=>['play','cancel','queueCancel','reserve','next'].includes(c.command)).length),beforeDelete);
  assert.equal(await page.locator('.favorite-song').getAttribute('data-code'),'14515');
  await page.context().setOffline(false);await page.reload();await page.waitForFunction(()=>!document.getElementById('searchBtn').disabled);await page.context().setOffline(true);
  await page.locator('#favoriteShortcuts [data-category=mine]').click();await page.waitForFunction(()=>document.querySelectorAll('.favorite-song').length===1);
  assert.equal(await page.locator('.favorite-song').getAttribute('data-code'),'14515');
  const many=[...new Map(data.groups.flatMap(g=>g.songs).map(s=>[s.code,s])).values()].slice(0,60).map((s,i)=>({number:Number(s.code),lastPlayed:1000+i}));
  await page.evaluate(songs=>onP2NativePersonalSongs({songs,error:''}),many);await page.waitForFunction(()=>document.querySelectorAll('.favorite-song').length===50);
  await page.locator('#favoritesMore').click();assert.equal(await page.locator('.favorite-song').count(),60);
  assert.equal(await page.locator('#favoritesMore').isVisible(),false);
  await page.evaluate(()=>onP2NativePersonalSongs({songs:[],error:'저장된 내 애창곡을 읽지 못했습니다.'}));
  await page.waitForFunction(()=>document.getElementById('favoritesCount').textContent.includes('읽지 못했습니다'));
  assert.equal(await page.locator('.favorite-song').count(),60,'Read failure does not silently erase visible history');
  await page.locator('#favoritesClose').click();
  assert.deepEqual(errors,[]);
  console.log('PASS favorites: 150 catalog-backed entries, offline categories, title/artist/initial/number filtering, literal queries, one-tap exact-song reservation, duplicate/busy/disconnected/mismatched-song guards, close cancellation, stale voice protection and unchanged playback/reservation list, personal offline history, exact titles, delete isolation, reload, pagination and 320/360/430px layouts.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
