const assert = require('node:assert/strict');

module.exports = async function verifyPause(page) {
  const actions = [], results = new Map();
  let paused = false, rejectNext = false, playing = 4985;
  const queue=[101,102,103,104];
  async function commands(route) {
    const request = route.request().postDataJSON();
    if (request.op === 'command') {
      actions.push(request.command);
      const rejected = rejectNext;
      rejectNext = false;
      if (!rejected && request.command.action === 'pause') paused = !paused;
      if (request.command.action === 'next') { paused = false; playing=queue.shift(); }
      results.set(request.id, rejected ? 'failed' : 'confirmed');
      await route.fulfill({json:{ok:true,id:request.id}});
    } else if (request.op === 'result' && results.has(request.id)) {
      await route.fulfill({json:{ok:true,status:results.get(request.id),message:'반주기 응답'}});
    } else if (['join','status'].includes(request.op)) {
      await route.fulfill({json:{ok:true,online:true,name:'모의 반주기',session:'2'.repeat(32),
        state:{connected:true,busy:false,queue:{valid:true,songs:queue,version:String(queue.length).repeat(64)},
          playback:{known:true,number:playing,paused}}}});
    } else {
      await route.fallback();
    }
  }
  await page.route('**/api/p2wifi', commands);
  try {
    const button=page.locator('#nativeStop');
    const ready=label=>page.waitForFunction(label=>{
      const b=document.getElementById('nativeStop');
      return b && !b.disabled && b.textContent===label;
    },label);
    await ready('일시정지');
    rejectNext=true;await button.click();await ready('일시정지');
    await button.click();await ready('다시 시작');
    assert.equal(await page.locator('[data-wifi="pause"]').textContent(),'다시 시작');
    await page.reload();await ready('다시 시작');
    await button.click();await ready('일시정지');
    assert.equal(await page.locator('[data-wifi="pause"]').textContent(),'일시정지');
    await button.click();await ready('다시 시작');
    await page.locator('#nativeStart').click();await ready('일시정지');
    assert.equal(await page.locator('#nativeNowNumber').textContent(),'4985');
    await page.locator('#nativeQueueNav').click();
    await page.locator('#nativeQueueNext').click();await ready('일시정지');
    await page.waitForFunction(()=>document.getElementById('nativeNowNumber').textContent==='101' && document.querySelector('.queue-count').textContent==='3');
    await page.locator('#nativeQueueClose').click();
    await page.locator('#nativeNext').click();await ready('일시정지');
    await page.waitForFunction(()=>document.getElementById('nativeNowNumber').textContent==='102');
    assert.deepEqual(queue,[103,104]);
    assert.deepEqual(actions.map(c=>c.action),['pause','pause','pause','pause','pause','next','next']);
  } finally {
    await page.unroute('**/api/p2wifi', commands);
  }
};
