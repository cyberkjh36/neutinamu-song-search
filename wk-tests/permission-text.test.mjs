import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSION_TEXT } from '../wk/permission-text.mjs';
import { LANGUAGES } from '../wk/labels.mjs';
test('all eleven languages explain iPhone consent, both menu styles and recovery',()=>{
  assert.deepEqual(Object.keys(PERMISSION_TEXT).sort(),LANGUAGES.map(l=>l.code).sort());
  const keys=Object.keys(PERMISSION_TEXT['ko-KR']).sort();
  for(const words of Object.values(PERMISSION_TEXT)){
    assert.deepEqual(Object.keys(words).sort(),keys);
    for(const text of Object.values(words))assert.ok(typeof text==='string'&&text.trim());
    assert.match(words.step1,/Safari/);assert.match(words.step1,/aA/);
    assert.match(words.step2,/⋯/);assert.match(words.missing,/Safari/);
  }
});
