import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceInput, openVoiceDialog, closeVoiceDialog, isAppleMobile } from '../wk/voice-input.mjs';
import { VOICE_TEXT } from '../wk/voice-text.mjs';
import { LANGUAGES } from '../wk/labels.mjs';

function fixture({ missing = false, constructError, startError, endOnStop = false } = {}) {
  let now = 0, next = 0;
  const timers = new Map(), instances = [], states = [], results = [], errors = [], finished = [];
  class Speech {
    constructor() { if (constructError) throw constructError; instances.push(this); }
    start() { if (startError) throw startError; this.started = true; }
    stop() { this.stopped = true; if (endOnStop) this.onend?.(); }
    abort() { this.aborted = true; this.onend?.(); }
  }
  const voice = new VoiceInput({
    getRecognition: () => missing ? undefined : Speech,
    onState: state => states.push(state), onResult: result => results.push(result),
    onError: error => errors.push(error), onFinish: reason => finished.push(reason),
    setTimer(fn, delay) { const id = ++next; timers.set(id, { fn, at:now + delay }); return id; },
    clearTimer: id => timers.delete(id)
  });
  function advance(ms) {
    const target = now + ms;
    for (;;) {
      const entry = [...timers].filter(([,t]) => t.at <= target).sort((a,b) => a[1].at-b[1].at)[0];
      if (!entry) break;
      now = entry[1].at; timers.delete(entry[0]); entry[1].fn();
    }
    now = target;
  }
  return { voice, instances, states, results, errors, finished, timers, advance };
}
const event = (text, final = true) => { const result = [{transcript:text}]; result.isFinal = final; return {resultIndex:0,results:[result]}; };

test('default timer adapters preserve the global receiver through startup, results, stop and cancel', () => {
  // Model the Window receiver check that Node timers and Playwright fake clocks lack.
  const originalSet=globalThis.setTimeout, originalClear=globalThis.clearTimeout;
  const timers=new Map(); let id=0, recognition;
  globalThis.setTimeout=function(fn,ms){assert.equal(this,globalThis,'Window timer receiver');timers.set(++id,{fn,ms});return id;};
  globalThis.clearTimeout=function(id){assert.equal(this,globalThis,'Window cancel receiver');timers.delete(id);};
  class Speech {constructor(){recognition=this;}start(){this.started=true;}stop(){}abort(){}}
  const voice=new VoiceInput({getRecognition:()=>Speech});
  try {
    assert.equal(voice.start('ko-KR'),true);assert.equal(recognition.started,true);assert.equal(timers.size,2);
    recognition.onstart();assert.equal(timers.size,1);
    recognition.onresult(event('노래'));recognition.onend();assert.equal(timers.size,0);assert.equal(voice.active,false);
    voice.start('th-TH');voice.stop();assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,2500);
    [...timers.values()][0].fn();assert.equal(timers.size,0);assert.equal(voice.active,false);
    voice.start('ja-JP');voice.cancel();assert.equal(timers.size,0);
  } finally {voice.cancel();globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});

test('prefixed Safari and Android-compatible recognition starts synchronously in the tap with all eleven locales', () => {
  for (const {code} of LANGUAGES) {
    const f = fixture(); assert.equal(f.instances.length,0);
    assert.equal(f.voice.start(code),true);
    const r = f.instances[0]; assert.equal(r.started,true); assert.equal(r.lang,code);
    assert.equal(r.continuous,false); assert.equal(r.interimResults,true);
    assert.deepEqual(f.states,['starting']); f.voice.cancel(); assert.equal(f.timers.size,0);
  }
});
test('an exposed but silent Safari API cannot leave the microphone stuck indefinitely', () => {
  const f = fixture(); f.voice.start('ko-KR'); f.advance(11999);
  assert.equal(f.voice.active,true); assert.deepEqual(f.errors,[]);
  f.advance(1); assert.equal(f.voice.active,false); assert.deepEqual(f.errors,['timeout']);
  assert.equal(f.instances[0].aborted,true); assert.equal(f.timers.size,0);
  assert.equal(f.voice.start('ko-KR'),true); assert.equal(f.instances.length,2); f.voice.cancel();
});
test('recognition with onstart but no result/end is also bounded', () => {
  const f = fixture(); f.voice.start('ko-KR'); f.instances[0].onstart(); f.advance(12000);
  assert.equal(f.voice.active,true); assert.deepEqual(f.states,['starting','listening']);
  f.advance(33000); assert.deepEqual(f.errors,['no-speech']); assert.equal(f.voice.active,false);
});
test('unsupported API and throwing constructor/start produce recoverable states', () => {
  for (const [options,reason] of [[{missing:true},'unsupported'],[{constructError:new Error('unavailable')},'unavailable'],[{startError:new Error('unavailable')},'unavailable'],[{startError:{name:'NotAllowedError'}},'not-allowed']]) {
    const f = fixture(options); assert.equal(f.voice.start('ko-KR'),false);
    assert.equal(f.voice.active,false); assert.deepEqual(f.errors,[reason]); assert.equal(f.timers.size,0);
  }
});
test('permission, service, microphone, network, language and no-speech failures release the session without erasing any draft', () => {
  for (const reason of ['not-allowed','service-not-allowed','audio-capture','network','language-not-supported','no-speech']) {
    const f = fixture(); f.voice.start('ko-KR'); f.instances[0].onerror({error:reason});
    assert.deepEqual(f.errors,[reason]); assert.deepEqual(f.results,[]); assert.equal(f.voice.active,false); assert.equal(f.timers.size,0);
  }
});
test('revised/repeated Safari results do not append duplicate song titles', () => {
  const f = fixture(); f.voice.start('ko-KR'); const r=f.instances[0];
  r.onresult(event('사랑은',false)); r.onresult(event('사랑은 늘 도망가')); r.onresult(event('사랑은 늘 도망가'));
  r.onend(); assert.equal(f.results.at(-1).text,'사랑은 늘 도망가');
  assert.deepEqual(f.finished,['result']); assert.deepEqual(f.errors,[]); assert.equal(f.timers.size,0);
});
test('Safari interim-only result is retained as a draft when recognition ends', () => {
  const f=fixture(); f.voice.start('th-TH'); const r=f.instances[0]; r.onresult(event('เพลงไทย',false));
  assert.equal(f.results.at(-1).text,''); r.onend(); assert.equal(f.results.at(-1).text,'เพลงไทย'); assert.deepEqual(f.finished,['result']);
});
test('final result is retained if a recognizer never emits end', () => {
  const f=fixture(); f.voice.start('ja-JP'); f.instances[0].onresult(event('日本の歌')); f.advance(45000);
  assert.equal(f.results.at(-1).text,'日本の歌'); assert.deepEqual(f.finished,['result']); assert.equal(f.voice.active,false);
});
test('stale result/error/end callbacks cannot overwrite a new recognition session', () => {
  const f=fixture(); f.voice.start('ko-KR'); const old=f.instances[0], result=old.onresult, error=old.onerror, end=old.onend;
  f.voice.cancel(); f.voice.start('vi-VN'); result(event('old')); error({error:'not-allowed'}); end();
  assert.equal(f.voice.active,true); assert.deepEqual(f.results,[]); assert.deepEqual(f.errors,[]);
  f.instances[1].onresult(event('bài hát')); f.instances[1].onend(); assert.equal(f.results.at(-1).text,'bài hát');
});
test('repeated microphone taps do not create overlapping recognizers', () => {
  const f=fixture(); f.voice.start('ko-KR'); assert.equal(f.voice.start('th-TH'),false);
  assert.equal(f.instances.length,1); assert.equal(f.instances[0].lang,'ko-KR'); f.voice.cancel();
});
test('Done waits briefly for final results and then recovers if stop never finishes', () => {
  const f=fixture(); f.voice.start('ko-KR'); f.instances[0].onresult(event('새 노래',false)); f.voice.stop();
  assert.equal(f.instances[0].stopped,true); f.advance(2499); assert.equal(f.voice.active,true);
  f.advance(1); assert.equal(f.voice.active,false); assert.equal(f.results.at(-1).text,'새 노래'); assert.equal(f.timers.size,0);
});
test('Done with a synchronous end creates no stale timer; close/pagehide cancels cleanly', () => {
  const f=fixture({endOnStop:true}); f.voice.start('ko-KR'); f.instances[0].onresult(event('노래')); f.voice.stop();
  assert.equal(f.timers.size,0); f.voice.start('ko-KR'); f.voice.cancel(); f.advance(60000);
  assert.deepEqual(f.finished,['result','cancel']); assert.deepEqual(f.errors,[]); assert.equal(f.timers.size,0);
});
test('result length is bounded to the existing 300-character query limit', () => {
  const f=fixture(); f.voice.start('ko-KR'); f.instances[0].onresult(event('가'.repeat(400))); f.instances[0].onend(); assert.equal(f.results.at(-1).text.length,300);
});
function dialog({native=false,throws=false}={}) {
  const attributes={},classes=new Set();
  const d={open:false,attributes,classes,setAttribute(k,v){attributes[k]=v;},removeAttribute(k){delete attributes[k];},classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}}};
  if(native){d.showModal=()=>{if(throws)throw Error('unsupported dialog');d.open=true;};d.close=()=>{d.open=false;};}
  return d;
}
test('older Safari without showModal/close can display and dismiss the microphone UI', () => {
  const d=dialog(); openVoiceDialog(d); assert.equal(d.open,true); assert.ok(d.classes.has('fallback-modal'));
  closeVoiceDialog(d); assert.equal(d.open,false); assert.equal('open' in d.attributes,false);
});
test('a throwing dialog API falls back without blocking voice startup', () => {
  const d=dialog({native:true,throws:true}); openVoiceDialog(d); assert.equal(d.open,true); assert.ok(d.classes.has('fallback-modal')); closeVoiceDialog(d); assert.equal(d.open,false);
});
test('modern iPhone/Android native dialogs retain native behavior', () => {
  const d=dialog({native:true}); openVoiceDialog(d); openVoiceDialog(d); assert.equal(d.open,true); assert.equal(d.classes.size,0); closeVoiceDialog(d); assert.equal(d.open,false);
});
test('iPhone and touch-enabled iPad desktop mode get Apple guidance; Android/desktop do not', () => {
  assert.equal(isAppleMobile({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X)'}),true);
  assert.equal(isAppleMobile({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)'}),true);
  assert.equal(isAppleMobile({platform:'MacIntel',maxTouchPoints:5}),true);
  assert.equal(isAppleMobile({platform:'MacIntel',maxTouchPoints:0}),false);
  assert.equal(isAppleMobile({userAgent:'Android Chrome'}),false);
});
test('all eleven languages contain complete nonempty voice recovery instructions', () => {
  assert.deepEqual(Object.keys(VOICE_TEXT).sort(),LANGUAGES.map(l=>l.code).sort());
  for(const words of Object.values(VOICE_TEXT)) {
    assert.deepEqual(Object.keys(words).sort(),Object.keys(VOICE_TEXT['ko-KR']).sort());
    for(const text of Object.values(words))assert.ok(text.trim());
    assert.match(words.iphoneHelp,/Safari/);
  }
});
