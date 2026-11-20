const assert = require('node:assert/strict');

module.exports = async function verifyPause(page) {
  const actions = [];
  const pending = new Set();
  async function commands(route) {
    const request = route.request().postDataJSON();
    if (request.op === 'command') {
      actions.push(request.command);
      pending.add(request.id);
      await route.fulfill({json:{ok:true,id:request.id}});
    } else if (request.op === 'result' && pending.has(request.id)) {
      await route.fulfill({json:{ok:true,status:'confirmed',message:'반주기가 버튼 입력을 확인했습니다.'}});
    } else {
      await route.fallback();
    }
  }
  await page.route('**/api/p2wifi', commands);
  try {
    const button = page.getByRole('button', {name:'일시정지',exact:true});
    await button.click();
    await page.waitForFunction(() => !document.getElementById('nativeStop').disabled);
    await button.click();
    await page.waitForFunction(() => !document.getElementById('nativeStop').disabled);
    await page.locator('#nativeNext').click();
    await page.waitForFunction(() => !document.getElementById('nativeNext').disabled);
    assert.deepEqual(actions, [{action:'pause'},{action:'pause'},{action:'next'}]);
    console.log('Verified two independent pause toggles and the separate next-song button.');
  } finally {
    await page.unroute('**/api/p2wifi', commands);
  }
};
