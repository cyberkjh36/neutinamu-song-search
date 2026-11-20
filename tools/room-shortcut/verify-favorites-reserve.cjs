const assert = require('node:assert/strict');

module.exports = async function verifyFavoritesReserve(page,base) {
 const calls=[];
 let result={status:'confirmed',message:'P2 예약 확인'};
 const route=async request=>{
  const b=request.request().postDataJSON();
  if(b.op==='command')calls.push(b.command);
  const state={connected:true,busy:false,queue:{valid:false,songs:[]}};
  const json=b.op==='result'?{ok:true,...result}:{ok:true,name:'예약 시험 P2',online:true,session:'a'.repeat(32),state};
  await request.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});
 };
 await page.route('**/api/p2wifi',route);
 try {
  await page.goto(base+'p2wifi/index.html#room=10000005');
  await page.waitForFunction(()=>document.getElementById('nativeState')?.textContent.includes('연결됨')&&!document.getElementById('searchBtn').disabled,null,{timeout:60000});
  await page.locator('#query').fill('693');await page.locator('#searchBtn').click();
  await page.waitForFunction(()=>document.getElementById('heroNumber').textContent==='693');
  await page.locator('#favoriteShortcuts [data-category=trot]').click();
  const rows=page.locator('.favorite-song'),panel=page.locator('#favoritesPanel'),sheet=page.locator('.favorites-sheet');
  assert.equal(await rows.count(),50);
  const first=rows.nth(22);
  await first.evaluate(el=>el.scrollIntoView({block:'center'}));
  const scroll=()=>sheet.evaluate(el=>el.scrollTop);
  const start=await scroll();
  assert(start>500);
  const code=Number(await first.getAttribute('data-code'));
  await first.click();
  await first.evaluate(el=>el.click());
  await page.waitForFunction(()=>document.getElementById('favoritesFeedback').textContent.includes('예약되었습니다.'));
  assert(await panel.isVisible());
  assert(Math.abs(await scroll()-start)<=2,'reservation moved the song list');
  assert.equal(await page.locator('#favoritesTabs [aria-pressed=true]').getAttribute('data-category'),'trot');
  assert.equal(await page.locator('#query').inputValue(),'693');
  assert.equal(await page.locator('#heroNumber').textContent(),'693');
  assert.deepEqual(calls,[{action:'reserve',number:code}]);

  await page.locator('#favoritesFilter').fill('나훈아');
  const next=rows.first(),nextCode=Number(await next.getAttribute('data-code'));
  await next.click();
  await page.waitForFunction(()=>document.getElementById('favoritesFeedback').textContent.includes('예약되었습니다.'));
  assert.equal(await page.locator('#favoritesFilter').inputValue(),'나훈아');
  assert.deepEqual(calls[1],{action:'reserve',number:nextCode});
  result={status:'failed',message:'반주기에서 예약을 확인하지 못했습니다.'};
  await next.click();
  await page.waitForFunction(()=>document.getElementById('favoritesFeedback').textContent.includes('확인하지 못했습니다.'));
  assert(await panel.isVisible());
  assert.equal(await page.locator('#favoritesFilter').inputValue(),'나훈아');
  assert.equal(calls.length,3);
  await page.locator('#favoritesClose').click();
  assert(!(await panel.isVisible()));
  assert.equal(await page.locator('#heroNumber').textContent(),'693');
  console.log('Verified in-place favorite reservations, stable scroll, retained filter, double taps and failed reservations.');
 } finally {await page.unroute('**/api/p2wifi',route);}
};
