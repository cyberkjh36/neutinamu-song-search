import test from 'node:test';
import assert from 'node:assert/strict';
import { safariLinks, safariArrival } from '../wk/safari-handoff.mjs';
import { readHandoff } from '../wk/chrome-handoff.mjs';
import { SAFARI_TEXT } from '../wk/safari-text.mjs';
import { LANGUAGES } from '../wk/labels.mjs';

test('Safari handoff keeps the existing QR room, locale and Unicode draft, with no pairing data in HTTP query', () => {
  for (const {code} of LANGUAGES) {
    const fields = {room:'78303808',language:code,query:'เพลง & 노래 # https://example.com/?x=1'};
    const links = safariLinks(fields), url = new URL(links.page);
    assert.equal(url.origin,'https://cyberkjh36.github.io');
    assert.equal(url.pathname,'/neutinamu-song-search/wk/');
    assert.equal(url.search,'?v=2.6&safariHandoff=1');
    assert.deepEqual(readHandoff(url.hash),fields);
    assert.equal(links.safari.replace(/^x-safari-https:/,'https:'),links.page);
    assert.equal(url.searchParams.has('room'),false);
    assert.equal(url.searchParams.has('query'),false);
  }
  assert.equal(readHandoff(new URL(safariLinks(readHandoff('#12345678')).page).hash).room,'12345678');
});

test('malformed handoff input cannot choose another destination, execute a scheme or pass an invalid room', () => {
  const links=safariLinks({page:'https://evil.example/',room:'123;bad',language:'bad',query:'javascript:alert(1)\n'+ '가'.repeat(400)});
  const page=new URL(links.page), state=readHandoff(page.hash);
  assert.equal(page.origin,'https://cyberkjh36.github.io');
  assert.equal(state.room,'');assert.equal(state.language,'');
  assert.equal(state.query.length,300);assert.equal(state.query.includes('\n'),false);
  assert.equal(new URL(links.safari).protocol,'x-safari-https:');
});

test('arrival hint only recognizes the exact marker and does not require replacing existing QR links', () => {
  for (const search of ['', '?v=2.1','?safariHandoff=0','?safariHandoff=evil']) assert.equal(safariArrival(search),false);
  assert.equal(safariArrival('?v=2.6&safariHandoff=1'),true);
});

test('all eleven languages include Safari opening, continuation and failed-copy recovery', () => {
  assert.deepEqual(Object.keys(SAFARI_TEXT).sort(),LANGUAGES.map(l=>l.code).sort());
  const keys=Object.keys(SAFARI_TEXT['ko-KR']).sort();
  for (const {code} of LANGUAGES) {
    const words=SAFARI_TEXT[code];
    assert.deepEqual(Object.keys(words).sort(),keys,code);
    for(const word of Object.values(words)) assert.ok(typeof word==='string'&&word.trim(),code);
  }
});
