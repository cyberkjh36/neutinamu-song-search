import {BROWSE_TEXT} from '../wk/browse-text.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../wk/labels.mjs?v=2.1';
import { MESSAGES } from '../wk/network-text.mjs?v=2.1';
import { CHROME_TEXT } from '../wk/chrome-text.mjs?v=2.2';
import { readHandoff } from '../wk/chrome-handoff.mjs?v=2.3';
import { NEXT_SEARCH } from '../wk/search-text.mjs?v=2.3';
import { MIC_TEXT } from '../wk/mic-text.mjs';
import { PERMISSION_TEXT } from '../wk/permission-text.mjs';

class Element {
  constructor(){this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.events=new Map();this.children=[];this.attributes={};this.classList={toggle(){}};}
  addEventListener(type,fn){this.events.set(type,fn);}
  fire(type,event={}){return this.events.get(type)?.(event);}
  append(...values){this.children.push(...values);}
  replaceChildren(...values){this.children=values;}
  setAttribute(k,v){this.attributes[k]=v;}
  scrollIntoView(){}
  focus(){this.focused=true;}
  removeAttribute(k){delete this.attributes[k];}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
test('UI event harness: explicit search, dictation and reconnect states',async t=>{
  const html=await readFile(new URL('../wk/index.html',import.meta.url),'utf8');
  const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>[x[1],new Element()]));
  const head=new Element(),events=new Map(),sent=[],storage=new Map();let speech, nextResult=true;
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
  globalThis.fetch=async function(url,options){assert.equal(this,globalThis,'native fetch receiver');const message=JSON.parse(options.body);sent.push(message);return Response.json({ok:true,server:'WKQ1 WKS1 TEST-PC',pending:false,result:nextResult,catalog:{v:1,items:[{id:'abcdefghijk',title:'노래 ไทย',channel:'Channel',duration:'3:00'}],error:null}});};
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
        assert.equal(document.documentElement.lang,language.code);assert.equal($('title').textContent,BROWSE_TEXT[language.code].title);
        assert.equal($('pair-help').textContent,words.pairHelp);assert.equal($('help-list').children[4].textContent,BROWSE_TEXT[language.code].hint);
        assert.equal($('privacy-help').textContent,words.privacyHelp);assert.equal($('disconnect').textContent,words.disconnect);
        assert.equal($('stop-label').textContent,MIC_TEXT[language.code].stop);assert.equal($('send').textContent,BROWSE_TEXT[language.code].search);
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
    await t.test('mic status distinguishes permission wait, listening, detected sound and ending',()=>{
      const state=()=> $('listening').attributes['data-mic-state'];
      assert.equal(state(),'starting'); assert.equal($('dialog-mic-state').textContent,MIC_TEXT['th-TH'].starting);
      assert.equal($('stop-voice').hidden,true); assert.equal($('voice-close').hidden,false);
      speech.onstart(); assert.equal(state(),'listening');
      assert.equal($('dialog-mic-state').textContent,MIC_TEXT['th-TH'].listening);
      assert.equal($('stop-voice').hidden,false);
      speech.onsoundstart(); assert.equal(state(),'hearing');
      speech.onaudioend(); assert.equal(state(),'processing'); assert.equal($('stop-voice').disabled,true);
      speech.onspeechstart(); assert.equal(state(),'processing'); assert.equal(sent.length,1);
    });
    await t.test('recognized title fills text and never auto searches',()=>{
      const result=[{transcript:'เพลงไทย'}];result.isFinal=true;speech.onresult({resultIndex:0,results:[result]});speech.onend();
      assert.equal($('query').value,'เพลงไทย');assert.equal(sent.length,1);assert.equal($('listening').open,false);assert.equal($('send').disabled,false);
      assert.equal($('mic-state').textContent,MIC_TEXT['th-TH'].result);
    });
    await t.test('explicit button sends one selected-language request and confirms PC acknowledgement',async()=>{
      await $('send').fire('click');assert.equal(sent.length,3);assert.equal(sent[1].op,'search');assert.equal(sent[1].language,'th-TH');assert.ok(sent[1].text.endsWith(":"+'เพลงไทย'));assert.match($('feedback').textContent,/PC/);
    });
    await t.test('microphone denial leaves typed search available',()=>{
      $('voice').fire('click');speech.onerror({error:'not-allowed'});assert.equal($('feedback').textContent,MESSAGES['th-TH'].errors.microphone);assert.equal($('listening').open,true);assert.equal($('voice-keyboard').hidden,false);$('voice-close').fire('click');assert.equal($('query').disabled,false);assert.equal($('send').disabled,false);
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
      window.webkitSpeechRecognition=undefined;$('voice').fire('click');assert.equal($('listening').open,true);assert.equal($('voice-retry').hidden,false);$('voice-close').fire('click');assert.equal($('query').disabled,false);assert.equal($('send').disabled,false);
    });
    await t.test('successful search offers translated Next Song; one tap clears only the draft',async()=>{
      for(const language of LANGUAGES){choose(language.code);assert.equal($('send').textContent,NEXT_SEARCH[language.code]);}
      choose('ko-KR');const count=sent.length,room=$('code').value,status=$('connection-state').textContent;
      await $('send').fire('click');
      assert.equal($('query').value,'');assert.equal($('interim').textContent,'');assert.equal($('query').focused,true);
      assert.equal($('code').value,room);assert.equal($('connection-state').textContent,status);assert.equal(document.documentElement.lang,'ko-KR');
      assert.equal(sent.length,count);assert.equal($('connect').disabled,true);assert.equal($('send').disabled,true);assert.equal($('send').textContent,BROWSE_TEXT['ko-KR'].search);
      const intent=$('chrome-open').href;const target=new URL(intent.slice(0,intent.lastIndexOf('#Intent;')).replace(/^intent:/,'https:'));
      assert.equal(readHandoff(target.hash).query,'');
      await $('send').fire('click');assert.equal(sent.length,count);
    });
    await t.test('next typed song is sent once only after explicit search without reconnecting',async()=>{
      const count=sent.length;$('query').value='두 번째 노래';$('query').fire('input');assert.equal(sent.length,count);
      await $('send').fire('click');assert.equal(sent.length,count+2);assert.equal(sent[count].op,'search');assert.ok(sent[count].text.endsWith(":"+'두 번째 노래'));assert.equal(sent[count].language,'ko-KR');
      assert.equal($('send').textContent,NEXT_SEARCH['ko-KR']);
      await $('send').fire('click');await $('send').fire('click');assert.equal(sent.length,count+2);assert.equal($('query').value,'');
    });
    await t.test('failed search keeps the title and retry action; editing a successful title starts a new search',async()=>{
      $('query').value='재시도할 노래';$('query').fire('input');nextResult=false;
      await $('send').fire('click');assert.equal($('query').value,'재시도할 노래');assert.equal($('send').textContent,BROWSE_TEXT['ko-KR'].search);assert.equal($('send').disabled,false);
      nextResult=true;await $('send').fire('click');assert.equal($('send').textContent,NEXT_SEARCH['ko-KR']);
      $('query').value='직접 고친 노래';$('query').fire('input');assert.equal($('send').textContent,BROWSE_TEXT['ko-KR'].search);
      const count=sent.length;await $('send').fire('click');assert.ok(sent[count].text.endsWith(":"+'직접 고친 노래'));assert.equal($('query').value,'직접 고친 노래');
    });
    await t.test('new voice result after a successful search replaces the title and still waits for Search',async()=>{
      window.webkitSpeechRecognition=Speech;choose('th-TH');const count=sent.length;
      $('voice').fire('click');const result=[{transcript:'เพลงใหม่'}];result.isFinal=true;
      speech.onresult({resultIndex:0,results:[result]});speech.onend();
      assert.equal($('query').value,'เพลงใหม่');assert.equal(sent.length,count);assert.equal($('send').textContent,BROWSE_TEXT['th-TH'].search);
      await $('send').fire('click');assert.ok(sent[count].text.endsWith(":"+'เพลงใหม่'));assert.equal(sent[count].language,'th-TH');
      await $('send').fire('click');assert.equal($('query').value,'');assert.equal(sent.length,count+2);
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
      assert.equal($('title').textContent,BROWSE_TEXT['ja-JP'].title);
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
    await t.test('iPhone permission guidance requests only on a tap, never bypasses consent or submits a search',()=>{
      choose('ko-KR'); window.SpeechRecognition=Speech;
      const previous=speech,count=sent.length;
      assert.equal($('voice-text').textContent,PERMISSION_TEXT['ko-KR'].action);
      assert.equal($('voice-help').hidden,true);
      assert.equal(speech,previous,'opening the page must not open the microphone');
      $('voice').fire('click'); assert.notEqual(speech,previous); assert.equal(speech.started,true);
      assert.equal($('permission-prompt').hidden,false);
      assert.equal($('permission-prompt-title').textContent,PERMISSION_TEXT['ko-KR'].prompt);
      assert.equal($('listening').attributes['data-mic-state'],'starting');
      speech.onerror({error:'not-allowed'});
      assert.equal($('permission-prompt').hidden,true); assert.equal($('permission-guide').open,true);
      assert.equal($('listening-title').textContent,PERMISSION_TEXT['ko-KR'].blocked);
      assert.equal($('voice-retry').textContent,PERMISSION_TEXT['ko-KR'].retry);
      assert.equal($('permission-step-3').textContent,PERMISSION_TEXT['ko-KR'].step3);
      assert.equal(sent.length,count);
      const denied=speech; $('voice-retry').fire('click');assert.notEqual(speech,denied);assert.equal(speech.started,true);
      assert.equal($('permission-guide').open,false);
      speech.onstart(); assert.equal($('permission-prompt').hidden,true); assert.equal($('permission-guide').hidden,true);
      assert.equal($('voice-text').textContent,LANGUAGES[0].text[0].replace('🎙 ',''));
      speech.onerror({error:'service-not-allowed'});assert.equal($('voice-text').textContent,PERMISSION_TEXT['ko-KR'].action);
      $('permission-safari').fire('click');assert.equal($('listening').open,false);assert.equal($('safari-handoff').open,true);assert.equal($('safari-open').focused,true);
      assert.equal(sent.length,count,'help does not disconnect or send searches');
    });
    await t.test('permission instructions follow all eleven selected languages without changing drafts or PC code',()=>{
      const draft=$('query').value,code=$('code').value;
      for(const language of LANGUAGES){
        choose(language.code);const p=PERMISSION_TEXT[language.code];
        assert.equal($('voice-text').textContent,p.action);
        assert.equal($('permission-prompt-title').textContent,p.prompt);
        assert.equal($('permission-guide-title').textContent,p.guide);
        for(let i=1;i<=3;i++)assert.equal($('permission-step-'+i).textContent,p['step'+i]);
        assert.equal($('query').value,draft);assert.equal($('code').value,code);
      }
    });
    await t.test('old iPhone without native dialog still shows permission instructions and keyboard fallback',async()=>{
      events.get('pagehide')?.();
      elements.forEach(element=>{element.children=[];element.value='';element.events.clear();element.href=undefined;});
      $('listening').showModal=undefined;$('listening').close=undefined;
      navigator.userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) Version/14.1 Mobile Safari/604.1';
      location.hash='#room=12345678&language=ko-KR';window.SpeechRecognition=undefined;window.webkitSpeechRecognition=Speech;
      await import('../wk/app.mjs?old-iphone-permission');
      $('voice').fire('click');assert.equal(speech.started,true);assert.equal($('listening').open,true);assert.equal($('permission-prompt').hidden,false);
      speech.onerror({error:'not-allowed'});assert.equal($('permission-guide').open,true);assert.equal($('listening').open,true);
      $('voice-keyboard').fire('click');assert.equal($('listening').open,false);assert.equal($('query').focused,true);
    });
    await t.test('served assets exist and text stays within a responsive phone layout',async()=>{
      assert.match(html,/viewport-fit=cover/);assert.match(html,/maxlength="200"/);assert.match(html,/type="button" disabled/);
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


