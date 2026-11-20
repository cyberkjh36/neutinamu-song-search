const assert = require('node:assert/strict');

module.exports = async function verifyVoice(page, base) {
  await page.goto(base + 'p2wifi/index.html?label=5#ticket=' + 'a'.repeat(64));
  await page.waitForFunction(() => typeof document.getElementById('voiceBtn')?.onclick === 'function'
    && !document.getElementById('voiceBtn').disabled, null, {timeout:60000});
  await page.evaluate(() => {
    class TestRecognition {
      start() { window.testRecognition = this; }
      abort() { this.aborted = true; }
    }
    Object.defineProperty(window, 'SpeechRecognition', {value:TestRecognition, configurable:true});
  });
  const mic = page.locator('#voiceBtn');
  const dialog = page.locator('#voiceDialog');
  const phase = () => dialog.getAttribute('data-phase');
  await mic.click();
  assert(await dialog.isVisible());
  assert.equal(await phase(), 'starting');
  assert((await dialog.locator('.voice-orb').boundingBox()).width >= 100);
  // The Android system sheet may temporarily cover the page before audio starts.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {value:true, configurable:true});
    try { document.dispatchEvent(new Event('visibilitychange')); }
    finally { delete document.hidden; }
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert(await dialog.isVisible());
  assert(!(await page.evaluate(() => window.testRecognition.aborted)));
  await page.evaluate(() => window.testRecognition.onaudiostart());
  assert.equal(await phase(), 'listening');
  await page.evaluate(() => window.testRecognition.onspeechstart());
  assert.equal(await phase(), 'hearing');
  await page.evaluate(() => window.testRecognition.onspeechend());
  assert.equal(await phase(), 'listening');
  await page.evaluate(() => window.testRecognition.onerror({error:'no-speech'}));
  assert.equal(await phase(), 'error');
  assert.equal(await page.locator('#voiceDialogStatus').textContent(), '인식하지 못했습니다. 다시 말씀해 주세요.');
  assert(await page.locator('#voiceTypeBtn').isVisible());
  await page.locator('#voiceRetryBtn').click();
  await page.evaluate(() => {
    const part = [{transcript:'조용필'}]; part.isFinal = false;
    window.testRecognition.onresult({results:[part]});
  });
  assert.equal(await phase(), 'hearing');
  assert.equal(await page.locator('#voicePreview').textContent(), '조용필');
  await page.evaluate(() => {
    const part = [{transcript:'조용필 꿈'}]; part.isFinal = true;
    window.testRecognition.onresult({results:[part]});
  });
  await page.waitForFunction(() => document.getElementById('query').value === '조용필 꿈' && document.querySelector('.result'));
  assert(!(await dialog.isVisible()));
  await mic.click();
  await page.evaluate(() => { window.lateResult = window.testRecognition.onresult; });
  await page.locator('#voiceCancelBtn').click();
  assert(await page.evaluate(() => window.testRecognition.aborted));
  await page.evaluate(() => {
    window.lateResult({results:[Object.assign([{transcript:'늦은 결과'}],{isFinal:true})]});
  });
  assert.equal(await page.locator('#query').inputValue(), '조용필 꿈');
  await mic.click();
  await page.evaluate(() => window.testRecognition.onerror({error:'not-allowed'}));
  await page.locator('#voiceTypeBtn').click();
  assert(await page.locator('#query').evaluate(el => el === document.activeElement));
  await mic.click();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert(!(await dialog.isVisible()));
  assert(await page.evaluate(() => window.testRecognition.aborted));
};
