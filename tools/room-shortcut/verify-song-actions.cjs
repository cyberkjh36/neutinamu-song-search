const assert = require('node:assert/strict');
module.exports=async function verifySongActions(page,base){
 const calls=[],queue=[693],session='f'.repeat(32);let playing=0;const results=new Map();
 async function route(r){
  const b=r.request().postDataJSON();let json={ok:true};
  if(b.op==='command'){
   const c=b.command;calls.push(c);
   if(c.action==='reserve')queue.push(c.number);
   if(c.action==='next'){
    if(queue.length)playing=queue.shift();
    else results.set(b.id,{status:'failed',message:'다음 예약곡이 없습니다. 노래를 먼저 예약해 주세요.'});
   }
   if(c.action==='queueCancel' || c.action==='queueMove'){
    assert.equal(c.version,'b'.repeat(64));assert.equal(queue[c.index],c.number);
    const [song]=queue.splice(c.index,1);if(c.action==='queueMove')queue.splice(c.to,0,song);
    results.set(b.id,{status:'confirmed',message:'반주기 확인',session,queueReceipt:true,queue:{valid:true,songs:queue.slice(),version:'b'.repeat(64)}});
    await new Promise(resolve=>setTimeout(resolve,180));
   }
   if(c.action==='queuePlay'){assert.equal(queue[c.index],c.number);playing=queue.splice(c.index,1)[0];}
  }else if(b.op==='result')Object.assign(json,results.get(b.id)||{status:'confirmed',message:'입력을 확인했습니다.'});
  else Object.assign(json,{name:'곡별 버튼 시험',online:true,session,events:[],state:{connected:true,busy:false,queue:{valid:true,songs:queue,version:'b'.repeat(64)},playback:{known:true,number:playing}}});
  await r.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});
 }
 await page.route('**/api/p2wifi',route);
 try{
  await page.goto(base+'p2wifi/index.html#room=10000007');
  await page.waitForFunction(()=>!document.getElementById('nativeStart')?.disabled&&document.getElementById('nativeState')?.textContent.includes('곡별 버튼 시험 연결됨'));
  assert.deepEqual(await page.locator('#nativePlayback button').allTextContents(),['실행','일시정지','다음곡']);
  async function checkPlaybackPosition(){
   const layout=await page.evaluate(()=>{
    const shortcuts=document.getElementById('favoriteShortcuts'),bar=document.getElementById('nativePlayback');
    const first=bar.querySelector('button'),voice=document.getElementById('voiceBtn');
    const buttons=[...bar.querySelectorAll('button')].map(b=>b.getBoundingClientRect());
    return shortcuts.nextElementSibling===bar && bar.nextElementSibling===voice &&
     first.getBoundingClientRect().top>=shortcuts.getBoundingClientRect().bottom-1 &&
     bar.getBoundingClientRect().bottom<=voice.getBoundingClientRect().top+1 &&
     buttons.every(b=>b.height>=44 && b.left>=0 && b.right<=innerWidth+1 && Math.abs(b.top-buttons[0].top)<1);
   });
   assert(layout,'playback controls stay together between favorites and voice search');
  }
  await checkPlaybackPosition();
  const ready=()=>page.waitForFunction(()=>!document.getElementById('nativeStart').disabled);
  await page.locator('#nativeStart').click();await ready();assert.equal(playing,693);
  await page.waitForFunction(()=>!document.getElementById('searchBtn').disabled);
  await page.locator('#query').fill('조용필');await page.locator('#searchBtn').click();
  const rows=page.locator('.result-row');await rows.nth(2).waitFor();
  await checkPlaybackPosition();
  const first=rows.nth(1),second=rows.nth(2);
  const n1=Number(await first.locator('.num').textContent()),n2=Number(await second.locator('.num').textContent());
  assert.notEqual(n1,n2);
  await first.locator('.result-reserve').click();await ready();
  assert(await rows.evaluateAll(all=>all.every(row=>{
   const actions=row.querySelectorAll('.result-actions button');
   return actions.length===1 && actions[0].textContent==='예약';
  })));
  assert.equal(await page.locator('#hero').getByRole('button',{name:'실행',exact:true}).count(),0);
  await second.locator('.result-reserve').click();await ready();
  assert.equal(playing,693);assert.deepEqual(queue,[n1,n2]);assert.deepEqual(calls.map(c=>c.action),['next','reserve','reserve']);
  await page.locator('#nativeQueueNav').click();
  await page.locator('#nativeQueueList .queue-play').nth(1).click();await ready();
  await page.locator('#nativeQueueClose').click();
  assert.equal(playing,n2);assert.deepEqual(queue,[n1]);assert.deepEqual(calls.map(c=>c.action),['next','reserve','reserve','queuePlay']);
  await page.waitForFunction(number=>document.querySelector('#nativeNowNumber')?.textContent===String(number),n2);
  await page.locator('#nativeStart').click();await ready();assert.equal(playing,n1);
  assert.deepEqual(queue,[]);assert.equal(calls.at(-1).action,'next');assert.equal(calls.length,5);
  await page.locator('#nativeStart').click();await ready();assert.equal(playing,n1);
  await page.waitForFunction(()=>document.getElementById('nativePlaybackStatus').textContent.includes('다음 예약곡이 없습니다'));
  assert.equal(calls.length,6);
  await page.setViewportSize({width:320,height:700});
  await checkPlaybackPosition();
  assert(await second.evaluate(el=>{const b=el.getBoundingClientRect();return b.right<=innerWidth&&b.left>=0&&[...el.querySelectorAll('.result-actions button')].every(x=>x.offsetHeight>=44);}));
  await first.locator('.result-reserve').click();await ready();
  await second.locator('.result-reserve').click();await ready();
  await page.locator('#nativeQueueNav').click();
  const entries=page.locator('#nativeQueueList > li');await entries.nth(1).waitFor();
  const startCalls=calls.length;
  await entries.nth(1).getByRole('button',{name:/위로/}).click();await ready();
  await page.waitForFunction(n=>document.querySelector('.queue-song > span')?.textContent.startsWith(n+' ·'),n2);
  await entries.first().locator('.queue-cancel').click();
  assert.equal(await entries.first().locator('.queue-cancel').textContent(),'예약 취소 중…');
  await page.waitForFunction(()=>document.querySelectorAll('#nativeQueueList > li').length===1);
  assert.equal(await entries.first().locator('.queue-song > span').textContent().then(s=>s.split(' · ')[0]),String(n1));
  assert.deepEqual(calls.slice(startCalls).map(c=>c.action),['queueMove','queueCancel']);assert.deepEqual(queue,[n1]);
  console.log('Verified immediate row feedback, real queue revisions, and single cancellation.');
  console.log('Verified reserve-only search results, manual playback from the queue, and narrow-screen controls.');
 }finally{await page.unroute('**/api/p2wifi',route);}
};
