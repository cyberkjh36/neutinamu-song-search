import test from 'node:test';
import assert from 'node:assert/strict';
import { needsChrome, readHandoff, chromeLinks } from '../wk/chrome-handoff.mjs?v=2.3';
import { CHROME_TEXT } from '../wk/chrome-text.mjs?v=2.2';
import { LANGUAGES } from '../wk/labels.mjs?v=2.1';

test('Samsung and other Android browsers offer Chrome; Chrome, iPhone and desktop do not', () => {
  const cases = [
    ['Mozilla/5.0 (Linux; Android 10; SM-N960N) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',true],
    ['Mozilla/5.0 (Linux; Android 16; SM-A166B) SamsungBrowser/29.0 Chrome/132.0.0.0 Mobile Safari/537.36',true],
    ['Mozilla/5.0 (Linux; Android 10; SM-N960N) Chrome/130.0.0.0 Mobile Safari/537.36',false],
    ['Mozilla/5.0 (Linux; Android 10; SM-N960N; wv) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36',true],
    ['Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',true],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0 Mobile EdgA/130.0.0.0',true],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1',false],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0.0.0 Mobile Safari/604.1',false],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36',false],
    ['',false]
  ];
  for (const [userAgent, expected] of cases) assert.equal(needsChrome({userAgent}), expected, userAgent);
  assert.equal(needsChrome({userAgentData:{platform:'Android',brands:[{brand:'Google Chrome'}]}}),false);
});

test('Chrome intent targets this app and preserves room, language and Unicode draft privately', () => {
  const input={room:'78303808',language:'th-TH',query:'เพลงไทย & 노래 #Intent;package=unwanted;end'};
  const links=chromeLinks(input);
  assert.match(links.intent,/#Intent;scheme=https;package=com\.android\.chrome;S\.browser_fallback_url=/);
  // Android Intent.parseUri locates the last # delimiter, leaving the data fragment intact.
  const data=links.intent.slice(0,links.intent.lastIndexOf('#Intent;')).replace(/^intent:/,'https:');
  const url=new URL(data);
  assert.equal(url.origin,'https://cyberkjh36.github.io');
  assert.equal(url.pathname,'/neutinamu-song-search/wk/');
  assert.equal(url.search,'?v=2.3');
  assert.deepEqual(readHandoff(url.hash),input);
  const fallback=new URL(decodeURIComponent(links.intent.match(/S\.browser_fallback_url=([^;]+)/)[1]));
  assert.equal(fallback.origin,url.origin);assert.equal(fallback.searchParams.get('chromeFallback'),'1');
  assert.deepEqual(readHandoff(fallback.hash),input);
});

test('old QR links still work; malformed state cannot select another app or invalid language', () => {
  assert.deepEqual(readHandoff('#12345678'),{room:'12345678',language:'',query:''});
  const bad=chromeLinks({room:'123;package=evil',language:'unknown',query:'a\n'+ '가'.repeat(400)});
  assert.deepEqual(readHandoff(new URL(bad.page).hash),{room:'',language:'',query:'a'+'가'.repeat(299)});
  assert.equal(bad.intent.split('package=').length,2);
  assert.equal(readHandoff('#room=123&language=bad').room,'');
});

test('all eleven languages have complete Chrome guidance and survive browser handoff', () => {
  assert.deepEqual(Object.keys(CHROME_TEXT).sort(),LANGUAGES.map(x=>x.code).sort());
  for (const {code} of LANGUAGES) {
    assert.equal(CHROME_TEXT[code].length,6);
    for (const text of CHROME_TEXT[code]) assert.ok(typeof text==='string' && text.trim());
    assert.equal(readHandoff(new URL(chromeLinks({language:code}).page).hash).language,code);
  }
});
