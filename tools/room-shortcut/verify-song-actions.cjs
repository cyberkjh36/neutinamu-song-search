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
  const ready=()=>page.waitForFunction(()=>!document.getElementById('nativeStart').disabled);
  await page.locator('#nativeStart').click();await ready();assert.equal(playing,693);
  await page.waitForFunction(()=>!document.getElementById('searchBtn').disabled);
  await page.locator('#query').fill('조용필');await page.locator('#searchBtn').click();
  const rows=page.locator('.result-row');await rows.nth(2).waitFor();
  const first=rows.nth(1),second=rows.nth(2);
  const n1=Number(await first.locator('.num').textContent()),n2=Number(await second.locator('.num').textContent());
  assert.notEqual(n1,n2);
  await first.locator('.result-reserve').click();await ready();
  await second.locator('.result-play').click();await ready();
  assert.equal(playing,n2);assert.deepEqual(queue,[n1]);assert.deepEqual(calls.map(c=>c.action),['next','reserve','reserve','queuePlay']);
  await page.waitForFunction(number=>document.querySelector('#nativeNowNumber')?.textContent===String(number),n2);
  await page.locator('#nativeStart').click();await ready();assert.equal(playing,n1);
  assert.deepEqual(queue,[]);assert.equal(calls.at(-1).action,'next');assert.equal(calls.length,5);
  await page.locator('#nativeStart').click();await ready();assert.equal(playing,n1);
  await page.waitForFunction(()=>document.getElementById('nativePlaybackStatus').textContent.includes('다음 예약곡이 없습니다'));
  assert.equal(calls.length,6);
  await page.setViewportSize({width:320,height:700});
  assert(await second.evaluate(el=>{const b=el.getBoundingClientRect();return b.right<=innerWidth&&b.left>=0&&[...el.querySelectorAll('.result-actions button')].every(x=>x.offsetHeight>=44);}));
  console.log('Verified reserved start without search and independent per-song controls on a narrow phone.');
 }finally{await page.unroute('**/api/p2wifi',route);}
};
