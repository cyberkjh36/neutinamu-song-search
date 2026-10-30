import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {LANGUAGES} from '../wk/labels.mjs';
class E{
 constructor(){this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.events=new Map();this.children=[];this.attributes={};this.dataset={};this.selectionStart=0;this.selectionEnd=0;this.maxLength=-1;const classes=new Set();this.classList={add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle:(k,v)=>v?classes.add(k):classes.delete(k)};}
 addEventListener(k,f){if(!this.events.has(k))this.events.set(k,[]);this.events.get(k).push(f);}fire(k,e={}){return Promise.all((this.events.get(k)||[]).map(f=>f({target:this,preventDefault(){},...e})));}
 dispatchEvent(e){void this.fire(e.type);return true;}click(){if(!this.disabled)void this.fire('click');}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}
 setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}removeAttribute(k){delete this.attributes[k];}setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}
 focus(){this.focused=true;void this.fire('focus');}blur(){this.focused=false;}contains(e){return this===e||this.children.some(c=>c.contains(e));}showModal(){this.open=true;}close(){this.open=false;}scrollIntoView(){}
}
const wait=async check=>{const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw Error('UI did not settle');await new Promise(r=>setTimeout(r,10));}};
for(const device of ['Android Chrome/130','iPhone OS 14_8 Safari','iPhone OS 18_0 Safari'])test('full app custom keyboard, search, favorites and native dictation fallback: '+device,async t=>{
 const html=await readFile(new URL('../wk/index.html',import.meta.url),'utf8'),elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>[x[1],new E()]));const $=id=>{assert.ok(elements.has(id),id);return elements.get(id);};$('favorites-panel').hidden=true;$('country-keyboard').hidden=true;$('query').maxLength=200;$('favorites-query').maxLength=160;
 const events=new E(),storage=new Map(),calls=[];
 globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};globalThis.document={addEventListener(){},removeEventListener(){},body:new E(),documentElement:{},getElementById:$,querySelector:()=>new E(),createElement:()=>new E()};
 globalThis.location={protocol:'https:',hostname:'example.test',hash:'#12345678'};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{language:'ko-KR',userAgent:device,platform:device.startsWith('iPhone')?'iPhone':'Linux',maxTouchPoints:1}});
 globalThis.fetch=async(u,o)=>{const body=JSON.parse(o.body);calls.push(body);return Response.json({ok:true,server:'WKQ1 WKS1 WKT1 WKC1 WKV1 TEST-PC',pending:false,result:true,catalog:{v:1,items:[{id:'abcdefghijk',title:'사랑 노래',channel:'3',duration:''}],error:null}});};
 globalThis.window={fetch:globalThis.fetch,crypto:globalThis.crypto,isSecureContext:true,addEventListener:events.addEventListener.bind(events)};
 const choose=code=>$('countries').children[LANGUAGES.findIndex(x=>x.code===code)].click();const press=k=>{const b=$('country-keyboard-keys').children.flatMap(r=>r.children).find(b=>b.attributes['data-key']===k);assert.ok(b,k);b.click();};
 try{
  await import('../wk/app.mjs?keyboard-'+encodeURIComponent(device));$('connect').click();await wait(()=>$('remote-play').disabled===false);
  await t.test('Thai draft stays local until one explicit video search',async()=>{
   choose('th-TH');$('query-keyboard').click();const before=calls.length;for(const c of 'เพลงรัก')press(c);assert.equal($('query').value,'เพลงรัก');assert.equal($('query').readOnly,true);assert.equal(calls.length,before);assert.equal($('country-keyboard-search').disabled,false);
   $('country-keyboard-search').click();await wait(()=>calls.some(c=>c.op==='result'));assert.equal($('country-keyboard').hidden,true);const req=calls.find(c=>c.op==='search');assert.match(req.text,/:เพลงรัก$/);assert.equal(req.language,'th-TH');assert.equal($('results-list').children.length,1);
  });
  await t.test('next search clears draft and reopens the chosen local keyboard',async()=>{await wait(()=>$('send').disabled===false);$('send').click();assert.equal($('query').value,'');assert.equal($('country-keyboard').hidden,false);assert.equal($('country-keyboard').lang,'th-TH');});
  await t.test('favorites own search uses composed Korean and preserves the video draft',async()=>{
   $('country-keyboard-close').click();choose('ko-KR');$('favorites-open').click();await wait(()=>!$('favorites-search').disabled&&$('favorites-list').children.length===1);
   $('favorites-keyboard').click();const count=calls.filter(c=>c.op==='search').length;for(const c of 'ㅅㅏㄹㅏㅇ')press(c);assert.equal($('favorites-query').value,'사랑');assert.equal(calls.filter(c=>c.op==='search').length,count);assert.equal($('query').value,'');
   $('country-keyboard-search').click();await wait(()=>calls.filter(c=>c.op==='search').length===count+1);await wait(()=>!$('favorites-search').disabled);
   const req=calls.filter(c=>c.op==='search').at(-1);assert.match(req.text,/^WKV1:[a-f0-9]{32}:ko-KR:0:사랑$/);assert.equal($('favorites-query').value,'사랑');
  });
  await t.test('all language changes keep the room and translate keyboard independently of PC playback',async()=>{
   $('favorites-open').click();const count=calls.length;for(const lang of LANGUAGES){choose(lang.code);$('query-keyboard').click();assert.equal($('country-keyboard').lang,lang.code);$('country-keyboard-close').click();}assert.equal(calls.length,count);assert.equal($('connect').disabled,true);
  });
  await t.test('existing keyboard-microphone button still opens native input in the same tap',async()=>{
   $('keyboard-voice').click();assert.equal($('query').readOnly,false);assert.equal($('query').attributes.inputmode,'text');assert.equal($('query').focused,true);assert.equal($('country-keyboard').hidden,true);
   $('query-keyboard').click();assert.equal($('query').readOnly,true);assert.equal($('country-keyboard').hidden,false);
  });
  await t.test('playback controls retain their protocol',async()=>{
   $('country-keyboard-close').click();$('remote-next').click();await wait(()=>calls.some(c=>c.op==='search'&&/:next$/.test(c.text)));await wait(()=>!$('remote-next').disabled);assert.equal(calls.filter(c=>c.op==='search'&&/:next$/.test(c.text)).length,1);
  });
 }finally{await events.fire('pagehide');}
});
