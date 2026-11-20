const assert=require('node:assert/strict');
module.exports=async function checkRemote(browser,base,ua){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ua,serviceWorkers:'block'});
 try {
 const page=await context.newPage();let errors=[],log=[],q=[],version=0;
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/api/p2wifi',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
   const b=route.request().postDataJSON();log.push(b);
   const st={connected:true,busy:false,message:'반주기 연결됨',queue:{songs:q,valid:true,version:String(version).padStart(64,'0')},playback:{known:true,number:0}};
   let res={ok:true};
   if(['join','status'].includes(b.op))Object.assign(res,{session:'a'.repeat(32),online:true,name:'시험 P2',state:st,events:[]});
   if(b.op==='join'&&b.room!=='00001234')res={ok:false,code:'pairing'};
   if(b.op==='command'){if(b.command.action==='reserve'){q.push(b.command.number);version++;}if(b.command.action==='queueCancel'){q.splice(b.command.index,1);version++;}}
   if(b.op==='result')Object.assign(res,{status:'confirmed',message:'P2 확인'});
   await route.fulfill({json:res,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.goto(base+'p2wifi/print.html#room=00001234');
 await page.locator('#number').fill('5');await page.locator('button[type=submit]').click();
 assert.equal(await page.locator('#roomTitle').textContent(),'5번방');
 assert.ok(await page.locator('#qr svg path').count());
 await page.locator('#number').fill('3');assert.equal(await page.locator('#poster').isVisible(),false);
 await page.goto(base+'p2wifi/index.html#room=00001234&label=5');
 await page.waitForFunction(()=>document.getElementById('nativeState')?.textContent.includes('연결됨'));
 assert.equal(await page.locator('.native-connection .connection-caption').textContent(),'5번방');
 await page.waitForFunction(()=>document.getElementById('statusDot')?.classList.contains('ready'),{},{timeout:60000});
 await page.locator('#query').fill('가로수 그늘 아래 서면');await page.locator('#searchBtn').click();
 await page.locator('#nativeReserve').click();
 await page.waitForFunction(()=>document.getElementById('nativeAction').textContent.includes('P2 확인'));
 await page.locator('#nativeQueueNav').click();await page.waitForFunction(()=>document.querySelector('#nativeQueueList .queue-cancel:not(:disabled)'));
 await page.locator('.queue-cancel').first().click();
 await page.waitForFunction(()=>document.querySelector('#nativeQueueEmpty')?.textContent.includes('아직')&&!document.querySelector('#nativeQueueEmpty')?.hidden);
 assert.deepEqual(log.filter(x=>x.op==='command').map(x=>x.command.action),['reserve','queue','queueCancel']);
 assert.ok(log.filter(x=>x.op==='command').every(x=>x.room==='00001234'));
 await page.goto(base+'p2wifi/index.html?label=4');await page.locator('#wifiConnection[open]').waitFor();assert.equal(await page.locator('#wifiRoom').inputValue(),'');
 await page.goto(base+'p2-room.html?room=4');assert.equal(await page.locator('#webRemote').getAttribute('href'),'./p2wifi/index.html?label=4');
 await page.goto(base+'p2wifi/index.html#room=invalid');assert.equal(await page.locator('#wifiRoom').inputValue(),'');await page.locator('#wifiConnection[open]').waitFor();
 assert.deepEqual(errors,[]);console.log('QR print, scoped QR join, search, reserve, queue, cancel, legacy room, invalid/stale room checks passed');
 } finally {await context.close();}
};
