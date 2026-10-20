import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../wk/labels.mjs?v=2.1';
import { MESSAGES } from '../wk/network-text.mjs?v=2.1';
import { CHROME_TEXT } from '../wk/chrome-text.mjs?v=2.2';
import { readHandoff } from '../wk/chrome-handoff.mjs?v=2.2';

class Element {
  constructor(){this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.events=new Map();this.children=[];this.attributes={};this.classList={toggle(){}};}
  addEventListener(type,fn){this.events.set(type,fn);}
  fire(type,event={}){return this.events.get(type)?.(event);}
  append(...values){this.children.push(...values);}
  replaceChildren(...values){this.children=values;}
  setAttribute(k,v){this.attributes[k]=v;}
  focus(){this.focused=true;}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
test('UI event harness: explicit search, dictation and reconnect states',async t=>{
  const html=await readFile(new URL('../wk/index.html',import.meta.url),'utf8');
  const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>[x[1],new Element()]));
  const head=new Element(),events=new Map(),sent=[],storage=new Map();let speech;
  globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
  globalThis.document={getElementById:id=>{assert.ok(elements.has(id),id);return elements.get(id);},querySelector:()=>head,documentElement:{},createElement:()=>new Element()};
  globalThis.location={protocol:'https:',hostname:'example.test',hash:'#12345678'};
  class Speech {
    constructor(){speech=this;}
    start(){this.started=true;}
    stop(){this.onend?.();}
    abort(){this.onend?.();}
  }
  globalThis.window={isSecureContext:true,SpeechRecognition:Speech,addEventListener:(k,v)=>events.set(k,v)};
  globalThis.fetch=async function(url,options){assert.equal(this,globalThis,'native fetch receiver');const message=JSON.parse(options.body);sent.push(message);return Response.json({ok:true,server:'TEST-PC',pending:false,result:true});};
  window.fetch=globalThis.fetch;window.crypto=globalThis.crypto;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{language:'ko-KR',userAgent:'Mozilla/5.0 (Linux; Android 10) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36'}});
  const $=id=>elements.get(id);
  const choose=code=>$('countries').children[LANGUAGES.findIndex(l=>l.code===code)].fire('click');
  try {
    await import('../wk/app.mjs');
    await t.test('eleven languages are selectable',()=>assert.equal($('countries').children.length,11));
    await t.test('first visit shows country choices and each country translates the entire app',()=>{
      assert.equal($('country-picker').open,true);assert.equal($('code').value,'12345678');assert.equal(sent.length,0);$('code').value='12345678';$('query').value='보존할 노래';
      for(const language of LANGUAGES){
        choose(language.code);const words=MESSAGES[language.code];
        assert.equal(document.documentElement.lang,language.code);assert.equal($('title').textContent,words.title);
        assert.equal($('pair-help').textContent,words.pairHelp);assert.equal($('help-list').children[4].textContent,words.steps[4]);
        assert.equal($('privacy-help').textContent,words.privacyHelp);assert.equal($('disconnect').textContent,words.disconnect);
        assert.equal($('stop-voice').textContent,words.done);assert.equal($('send').textContent,language.text[1]);
        assert.equal($('listening-title').textContent,language.text[5]);assert.equal($('connection-state').textContent,language.text[7]);
        assert.equal($('chrome-handoff').hidden,false);assert.equal($('chrome-open').textContent,CHROME_TEXT[language.code][2]);assert.equal($('chrome-default').textContent,CHROME_TEXT[language.code][4]);
        assert.equal($('query').value,'보존할 노래');assert.equal($('code').value,'12345678');assert.equal(storage.get('wk-bt-language'),language.code);
        assert.equal($('countries').children.filter(b=>b.attributes['aria-pressed']==='true').length,1);
      }
      assert.equal(sent.length,0);assert.equal($('country-picker').open,false);
    });
    await t.test('typing and language change do not submit',()=>{
      $('query').value='노래 입력중';$('query').fire('input');choose('th-TH');
      assert.equal(sent.length,0);assert.equal($('send').disabled,true);
    });
    await t.test('room input strips nonnumeric characters',()=>{$('code').value='12x3456a789';$('code').fire('input');assert.equal($('code').value,'12345678');});
    await t.test('invalid code is shown beside Connect in all eleven languages',async()=>{
      $('code').value='123';$('connect').fire('click');await tick();
      for(const language of LANGUAGES){choose(language.code);assert.equal($('connection-state').textContent,MESSAGES[language.code].errors.pairing);}
      assert.equal(sent.length,0);assert.equal($('connect').disabled,false);$('code').value='12345678';choose('th-TH');
    });
    await t.test('connect authenticates without submitting a search',async()=>{
      $('connect').fire('click');await tick();assert.equal(sent.length,1);assert.equal(sent[0].op,'join');assert.equal($('connect').disabled,true);assert.equal($('send').disabled,false);
    });
    await t.test('changing language while connected preserves session and entered title',()=>{
      choose('ja-JP');assert.equal($('connection-state').textContent,'接続済み · TEST-PC');assert.equal($('query').value,'노래 입력중');
      assert.equal($('connect').disabled,true);assert.equal(sent.length,1);choose('th-TH');
    });
    await t.test('voice starts only after tapping; selected locale is passed',()=>{
      assert.equal(speech,undefined);$('voice').fire('click');assert.equal(speech.started,true);assert.equal(speech.lang,'th-TH');choose('ja-JP');assert.equal(document.documentElement.lang,'th-TH');assert.equal($('listening').open,true);assert.equal($('send').disabled,true);
    });
    await t.test('recognized title fills text and never auto searches',()=>{
      const result=[{transcript:'เพลงไทย'}];result.isFinal=true;speech.onresult({resultIndex:0,results:[result]});speech.onend();
      assert.equal($('query').value,'เพลงไทย');assert.equal(sent.length,1);assert.equal($('listening').open,false);assert.equal($('send').disabled,false);
    });
    await t.test('explicit button sends one selected-language request and confirms PC acknowledgement',async()=>{
      await $('send').fire('click');assert.equal(sent.length,3);assert.equal(sent[1].op,'search');assert.equal(sent[1].language,'th-TH');assert.equal(sent[1].text,'เพลงไทย');assert.match($('feedback').textContent,/PC/);
    });
    await t.test('microphone denial leaves typed search available',()=>{
      $('voice').fire('click');speech.onerror({error:'not-allowed'});assert.equal($('feedback').textContent,MESSAGES['th-TH'].errors.microphone);assert.equal($('listening').open,false);assert.equal($('query').disabled,false);assert.equal($('send').disabled,false);
    });
    await t.test('an existing error follows language changes without losing the title',()=>{
      for(const language of LANGUAGES){choose(language.code);assert.equal($('feedback').textContent,MESSAGES[language.code].errors.microphone);}
      assert.equal($('query').value,'เพลงไทย');assert.equal(sent.length,3);
    });
    await t.test('Safari prefixed speech API uses the selected language',()=>{
      window.SpeechRecognition=undefined;window.webkitSpeechRecognition=Speech;choose('ja-JP');
      $('voice').fire('click');assert.equal(speech.started,true);assert.equal(speech.lang,'ja-JP');speech.onend();
    });
    await t.test('missing recognition API leaves keyboard dictation and manual sending available',()=>{
      window.webkitSpeechRecognition=undefined;$('voice').fire('click');assert.equal($('query').focused,true);assert.equal($('send').disabled,false);
    });
    await t.test('Chrome button preserves current fields, releases session and never claims app-launch success',async()=>{
      choose('vi-VN');$('query').value='Bài hát & 노래';let prevented=false;
      $('chrome-open').fire('click',{preventDefault(){prevented=true;}});await tick();
      assert.equal(prevented,false);assert.equal(sent.at(-1).op,'leave');assert.equal($('connect').disabled,false);
      const intent=$('chrome-open').href;
      const target=new URL(intent.slice(0,intent.lastIndexOf('#Intent;')).replace(/^intent:/,'https:'));
      assert.deepEqual(readHandoff(target.hash),{room:'12345678',language:'vi-VN',query:'Bài hát & 노래'});
      assert.equal($('chrome-feedback').hidden,false);assert.equal($('chrome-feedback').textContent,CHROME_TEXT['vi-VN'][3]);
      choose('ja-JP');
    });
    await t.test('page close releases session',async()=>{events.get('pagehide')();await tick();assert.equal($('connect').disabled,false);assert.equal($('send').disabled,true);});
    await t.test('saved language restores on reopen; unsupported browser guidance is translated',async()=>{
      // Reset the DOM model to simulate another page load; retain only browser storage.
      elements.forEach(element=>{element.children=[];element.value='';element.events.clear();});
      window.fetch=undefined;navigator.language='ko-KR';
      await import('../wk/app.mjs?reload');
      assert.equal(document.documentElement.lang,'ja-JP');assert.equal($('country-picker').open,false);
      assert.equal($('title').textContent,MESSAGES['ja-JP'].title);
      for(const language of LANGUAGES){choose(language.code);assert.equal($('compatibility').textContent,MESSAGES[language.code].errors.unsupported);assert.equal($('connect').disabled,true);}
    });
    await t.test('invalid saved language and unavailable storage still permit language selection',async()=>{
      storage.set('wk-bt-language','bad-code');navigator.language='vi';
      elements.forEach(element=>{element.children=[];element.value='';element.events.clear();});
      await import('../wk/app.mjs?invalid-storage');
      assert.equal(document.documentElement.lang,'vi-VN');assert.equal($('country-picker').open,true);
      localStorage.setItem=()=>{throw new Error('Storage blocked');};choose('ne-NP');assert.equal(document.documentElement.lang,'ne-NP');
    });
    await t.test('non-HTTPS warning is localized for all countries',async()=>{
      elements.forEach(element=>{element.children=[];element.value='';element.events.clear();});location.protocol='http:';window.isSecureContext=false;
      await import('../wk/app.mjs?http');
      for(const language of LANGUAGES){choose(language.code);assert.equal($('compatibility').textContent,MESSAGES[language.code].errors.insecure);assert.equal($('connect').disabled,true);}
    });
    await t.test('Chrome arrival restores the transferred room, language and draft without sending anything',async()=>{
      events.get('pagehide')?.();elements.forEach(element=>{element.children=[];element.value='';element.events.clear();});
      location.protocol='https:';location.hash='#room=87654321&language=th-TH&query=เพลงไทย';window.isSecureContext=true;window.fetch=globalThis.fetch;
      navigator.userAgent='Mozilla/5.0 (Linux; Android 10) Chrome/130.0.0.0 Mobile Safari/537.36';
      const before=sent.length;await import('../wk/app.mjs?chrome-arrival');
      assert.equal($('chrome-handoff').hidden,true);assert.equal($('code').value,'87654321');assert.equal($('query').value,'เพลงไทย');
      assert.equal(document.documentElement.lang,'th-TH');assert.equal($('country-picker').open,false);assert.equal(sent.length,before);assert.equal($('send').disabled,true);
      $('connect').fire('click');await tick();assert.equal(sent.at(-1).op,'join');assert.equal(sent.at(-1).room,'87654321');assert.equal(sent.length,before+1);
      events.get('pagehide')?.();await tick();
    });
    await t.test('iPhone stays in Safari and does not offer an Android app link',async()=>{
      elements.forEach(element=>{element.children=[];element.value='';element.events.clear();element.href=undefined;});
      navigator.userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1';location.hash='#12345678';
      await import('../wk/app.mjs?iphone');assert.equal($('chrome-handoff').hidden,true);assert.equal($('chrome-open').href,undefined);assert.equal($('code').value,'12345678');
    });
    await t.test('served assets exist and text stays within a responsive phone layout',async()=>{
      assert.match(html,/viewport-fit=cover/);assert.match(html,/maxlength="300"/);assert.match(html,/type="button" disabled/);
      for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g))if(!/^https?:/.test(m[1]))assert.ok((await readFile(new URL('../wk/'+m[1],import.meta.url))).length>0);
    });
  }finally{events.get('pagehide')?.();}
});

// These checks exercise translation completeness and local assets; no real-browser claims.
test('eleven country packs include every instruction, every error and a flag asset',async()=>{
  assert.deepEqual(Object.keys(MESSAGES).sort(),LANGUAGES.map(l=>l.code).sort());
  const keys=Object.keys(MESSAGES['ko-KR']).sort(),errors=Object.keys(MESSAGES['ko-KR'].errors).sort();
  for(const language of LANGUAGES){
    const words=MESSAGES[language.code];
    assert.deepEqual(Object.keys(words).sort(),keys,language.code);assert.deepEqual(Object.keys(words.errors).sort(),errors,language.code);
    for(const value of Object.values(words).flatMap(v=>typeof v==='string'?v:Object.values(v)))assert.ok(typeof value==='string'&&value.trim(),language.code);
    assert.equal(words.steps.length,5);assert.ok((await readFile(new URL('../wk/flags/'+words.flag+'.png',import.meta.url))).length>0);
  }
});
