import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeKeyboard} from '../wk/keyboard/native-ui.mjs';
import {KEYBOARD_TEXT, NATIVE_KEYBOARD_HELP} from '../wk/ui-text.mjs';
import {LANGUAGES} from '../wk/ui-text.mjs';

function harness() {
  const doc = {activeElement: null}, elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', readOnly: true, disabled: false, hidden: false, events: new Map(), attrs: {},
      selectionStart: 0, selectionEnd: 0, focuses: 0, blurs: 0,
      setAttribute(k,v) { this.attrs[k] = v; },
      addEventListener(k,f) { this.events.set(k,f); },
      focus() { doc.activeElement=this;this.focuses++;this.events.get('focus')?.(); },
      blur() { doc.activeElement=null;this.blurs++; },
      setSelectionRange(a,b) { this.selectionStart=a;this.selectionEnd=b; },
      click() { if (!this.disabled) this.events.get('click')?.(); }
    });
    return elements.get(id);
  };
  let language='ko-KR', blocked=false;
  const ui=createNativeKeyboard({getLanguage:()=>language,blocked:()=>blocked,$,doc});
  return {$,doc,ui,choose(code){language=code;ui.refresh();},block(value){blocked=value;ui.refresh();}};
}

test('both icons synchronously focus editable native fields and preserve selection',()=>{
  const {$,doc}=harness();
  for (const [field,button] of [['query','query-keyboard'],['favorites-query','favorites-keyboard']]) {
    const input=$(field);input.value='เพลงรัก 사랑';input.setSelectionRange(2,6);
    $(button).click();
    assert.equal(doc.activeElement,input); // Checked before any microtask/timer can run.
    assert.equal(input.readOnly,false);assert.equal(input.attrs.inputmode,'text');
    assert.equal(input.value,'เพลงรัก 사랑');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,6);
  }
});

test('a second tap refocuses after Android Back dismissed the keyboard without blurring',()=>{
  const {$,doc}=harness();$('query-keyboard').click();
  assert.equal(doc.activeElement,$('query'));
  $('query-keyboard').click();
  assert.equal($('query').blurs,1);assert.equal($('query').focuses,2);assert.equal(doc.activeElement,$('query'));
});

test('eleven language changes set language hints without taking focus or rewriting drafts',()=>{
  const h=harness(),{$,doc}=h;
  $('query').value='เพลง 사랑';$('favorites-query').value='愛';
  for (const {code} of LANGUAGES) {
    h.choose(code);
    for (const [field,button,help] of [['query','query-keyboard','query-keyboard-help'],['favorites-query','favorites-keyboard','favorites-keyboard-help']]) {
      assert.equal($(field).lang,code);assert.equal($(field).readOnly,false);
      assert.equal($(button).attrs['aria-label'],KEYBOARD_TEXT[code].native);
      assert.equal($(help).textContent,NATIVE_KEYBOARD_HELP[code]);assert.ok($(help).textContent.trim());
    }
    assert.equal(doc.activeElement,null);assert.equal($('query').value,'เพลง 사랑');assert.equal($('favorites-query').value,'愛');
  }
});

test('busy microphone, disabled fields and hidden favorites block focus; opening favorites enables it',()=>{
  const h=harness(),{$,doc,ui}=h;
  h.block(true);$('query-keyboard').click();ui.native($('query'));assert.equal(doc.activeElement,null);
  h.block(false);$('query').disabled=true;ui.refresh();ui.native($('query'));assert.equal(doc.activeElement,null);
  $('favorites-panel').hidden=true;ui.refresh();$('favorites-keyboard').click();ui.native($('favorites-query'));assert.equal(doc.activeElement,null);
  $('favorites-panel').hidden=false;ui.refresh();$('favorites-keyboard').click();assert.equal(doc.activeElement,$('favorites-query'));
});

test('closing for voice leaves drafts intact and does not steal focus from other controls',()=>{
  const {$,doc,ui}=harness();$('query').value='사랑';$('query-keyboard').click();ui.close();
  assert.equal(doc.activeElement,null);assert.equal($('query').value,'사랑');
  doc.activeElement=$('voice');ui.close();assert.equal(doc.activeElement,$('voice'));
});
