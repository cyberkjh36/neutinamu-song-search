const {chromium,webkit,devices}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const base=process.argv[2]||'http://127.0.0.1:8214/';
 for(const type of ['chromium','webkit']){
  const browser=await ({chromium,webkit}[type]).launch(type==='chromium'?{args:['--no-sandbox']}:{});
  try{
   const cx=await browser.newContext({...devices[type==='webkit'?'iPhone 13':'Pixel 7'],serviceWorkers:'block'});
   const tab=await cx.newPage(),errors=[],ops=[];
   const labels=['1','2','3','5','6','7','8'],codes=Object.fromEntries(labels.map(n=>[n,'1000000'+n]));
   let off=false,showSong=false;
   await cx.route('**/api/p2wifi',async route=>{
    const b=route.request().postDataJSON(); ops.push({op:b.op,room:b.room,label:b.label});
    const json=b.op==='resolvePrintRoom' ? off?{ok:false,code:'room_offline'}:{ok:true,room:codes[b.label]} :{ok:true,online:true,name:'모의 반주기',session:'2'.repeat(32),state:{connected:true,queue:{valid:showSong,songs:showSong?[693]:[],version:'sample'},playback:{known:showSong,number:showSong?693:0}}};
    await route.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});
   });
   tab.on('pageerror',e=>errors.push(e.message));
   for(const n of labels){
    const start=ops.length;
    await tab.goto(base+'p2-room.html?room='+n,{waitUntil:'domcontentloaded'});
    await tab.waitForURL('**/p2wifi/index.html?label='+n);
    await tab.waitForFunction(()=>document.body.textContent.includes('모의 반주기 연결됨'),{timeout:12000});
    const sequence=ops.slice(start);
    assert(sequence.some(x=>x.op==='resolvePrintRoom'&&x.label===n));
    assert(sequence.some(x=>x.op==='join'&&x.room===codes[n]));
    assert(!sequence.some(x=>x.op==='command'||x.op==='join'&&x.room!==codes[n]));
    assert(!(await tab.locator('#wifiConnection').evaluate(d=>d.open)));
   }
   off=true;const start=ops.length;
   await tab.goto(base+'p2-room.html?room=5');
   await tab.waitForFunction(()=>document.body.textContent.includes('방 PC와 반주기의 연결을 기다리고 있습니다.'));
   assert(!ops.slice(start).some(x=>x.op==='join'));off=false;
   await tab.goto(base+'p2wifi/index.html?display=pc&label=5#ticket='+'a'.repeat(64));
   await tab.waitForSelector('.desk-qr-picture svg');
   await tab.waitForFunction(()=>document.body.textContent.includes('모의 반주기 연결됨'));
   assert.equal(await tab.locator('.desk-qr h2').textContent(),'5번방 손님용 QR');
   await require('./verify-voice.cjs')(tab,base);
   showSong=true;
   await tab.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
   await tab.waitForFunction(()=>document.getElementById('nativeState')?.textContent.includes('모의 반주기 연결됨'));
   await require('./verify-song-text.cjs')(tab);
   const favoritesTab=await cx.newPage();
   favoritesTab.on('pageerror',e=>errors.push(e.message));
   try {
    await require('./verify-favorites-reserve.cjs')(favoritesTab,base);
    await require('./verify-personal.cjs')(favoritesTab,base);
   }
   finally {await favoritesTab.close();}
   await require('./verify-reconnect.cjs')(tab,base);
   assert.deepEqual(errors,[]);console.log(type,'verified seven scan routes, isolation, offline handling, desktop QR');
  } finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1);});
