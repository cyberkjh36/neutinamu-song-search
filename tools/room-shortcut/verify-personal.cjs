const assert=require('node:assert/strict');

module.exports=async function verifyPersonal(page,base){
 const room='10000008',at=Date.now()-30000,events=[{id:'1'.repeat(32),number:693,created:at}];
 const ops=[];let online=true;
 const handle=async route=>{
  const req=route.request().postDataJSON();ops.push(req.op);
  let json={ok:true,online,name:'애창곡 시험',session:'e'.repeat(32),events:[],state:{connected:online,busy:false,queue:{valid:false,songs:[]},playback:{known:false,number:0}}};
  if(req.op==='personalHistory')json={ok:true,events:events.slice(),serverTime:Date.now()};
  if(req.op==='result')json={ok:true,status:'confirmed',message:'3번 재생 확인 · 남은 예약곡은 원래 순서대로 진행합니다.'};
  await route.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});
 };
 await page.route('**/api/p2wifi',handle);
 try{
  await page.goto(base+'p2wifi/index.html#room='+room);
  await page.waitForFunction(()=>document.getElementById('nativeState')?.textContent.includes('애창곡 시험 연결됨')&&!document.getElementById('searchBtn').disabled,null,{timeout:60000});
  const mine=page.locator('#favoriteShortcuts [data-category=mine]'),close=page.locator('#favoritesClose');
  const row=n=>page.locator('#favoritesList .favorite-song[data-code="'+n+'"]');
  await mine.click();await row(693).waitFor();
  assert.match(await row(693).textContent(),/조용필/);
  page.once('dialog',d=>d.accept());await page.locator('#favoritesList .personal-remove').click();
  events.push({id:'2'.repeat(32),number:693,created:at+200});
  await close.click();await mine.click();await page.waitForFunction(()=>document.getElementById('favoritesEmpty')?.hidden===false);
  await close.click();
  await page.locator('#query').fill('71541');await page.locator('#searchBtn').click();
  await page.waitForFunction(()=>document.getElementById('heroNumber').textContent==='71541');
  await page.locator('#nativeNext').click();await page.waitForFunction(()=>document.getElementById('nativeAction').textContent.includes('3번 재생 확인'));
  await mine.click();await row(3).waitFor();assert.equal(await row(71541).count(),0);await close.click();
  const commands=ops.filter(x=>x==='command').length;
  await page.locator('#nativeSaveFavorite').click();await page.waitForFunction(()=>document.getElementById('favoriteSaveStatus').textContent.includes('저장했습니다'));
  online=false;await page.reload();await mine.click();
  await row(71541).waitFor();await row(3).waitFor();
  assert.equal(await row(693).count(),0);assert.equal(ops.filter(x=>x==='command').length,commands);
  console.log('Verified recent private history recovery, actual played number, deletion replay protection and offline manual favorites.');
 }finally{await page.unroute('**/api/p2wifi',handle);}
};
