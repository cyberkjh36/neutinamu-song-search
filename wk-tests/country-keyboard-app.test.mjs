import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {LANGUAGES} from '../wk/labels.mjs';
class E{
 constructor(){this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.events=new Map();this.children=[];this.attributes={};this.dataset={};this.selectionStart=0;this.selectionEnd=0;this.maxLength=-1;const classes=new Set();this.classList={add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle:(k,v)=>v?classes.add(k):classes.delete(k)};}
 addEventListener(k,f){if(!this.events.has(k))this.events.set(k,[]);this.events.get(k).push(f);}fire(k,e={}){return Promise.all((this.events.get(k)||[]).map(f=>f({target:this,preventDefault(){},...e})));}
 dispatchEvent(e){void this.fire(e.type);return true;}click(){if(!this.disabled)void this.fire('click');}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}
 setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}removeAttribute(k){delete this.attributes[k];}setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}
 focus(){this.focused=true;document.activeElement=this;void this.fire('focus');}blur(){this.focused=false;if(document.activeElement===this)document.activeElement=null;}contains(e){return this===e||this.children.some(c=>c.contains(e));}showModal(){this.open=true;}close(){this.open=false;}scrollIntoView(){}
}
const wait=async check=>{const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw Error('UI did not settle');await new Promise(r=>setTimeout(r,10));}};
for(const device of ['Android Chrome/130','iPhone OS 14_8 Safari','iPhone OS 18_0 Safari'])test('full app native keyboard, explicit search, favorites and dictation fallback: '+device,async t=>{
 const html=await readFile(new URL('../wk/index.html',import.meta.url),'utf8'),elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>[x[1],new E()]));const $=id=>{assert.ok(elements.has(id),id);return elements.get(id);};$('favorites-panel').hidden=true;$('country-keyboard').hidden=true;$('query').maxLength=200;$('favorites-query').maxLength=160;
 const events=new E(),storage=new Map(),calls=[];
 globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};globalThis.document={addEventListener(){},removeEventListener(){},body:new E(),documentElement:{},getElementById:$,querySelector:()=>new E(),createElement:()=>new E()};
 globalThis.location={protocol:'https:',hostname:'example.test',hash:'#12345678'};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{language:'ko-KR',userAgent:device,platform:device.startsWith('iPhone')?'iPhone':'Linux',maxTouchPoints:1}});
 globalThis.fetch=async(u,o)=>{const body=JSON.parse(o.body);calls.push(body);return Response.json({ok:true,server:'WKQ1 WKS1 WKT1 WKC1 WKV1 TEST-PC',pending:false,result:true,catalog:{v:1,items:[{id:'abcdefghijk',title:'사랑 노래',channel:'3',duration:''}],error:null}});};
 globalThis.window={fetch:globalThis.fetch,crypto:globalThis.crypto,isSecureContext:true,addEventListener:events.addEventListener.bind(events)};
 const choose=code=>$('countries').children[LANGUAGES.findIndex(x=>x.code===code)].click();
 const typeNative=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('input'));};
 try{
  await import('../wk/app.mjs?keyboard-'+encodeURIComponent(device));$('connect').click();await wait(()=>$('remote-play').disabled===false);
  await t.test('Thai native draft stays local until one explicit video search',async()=>{
   choose('th-TH');$('query-keyboard').click();const before=calls.length;
   assert.equal(document.activeElement,$('query'));assert.equal($('query').readOnly,false);assert.equal($('query').lang,'th-TH');
   for(const value of ['เ','เพ','เพลง','เพลงรัก'])typeNative('query',value);
   assert.equal($('query').value,'เพลงรัก');assert.equal(calls.length,before);assert.equal($('country-keyboard').hidden,true);assert.equal($('send').disabled,false);
   $('send').click();await wait(()=>calls.some(c=>c.op==='result'));const req=calls.find(c=>c.op==='search');assert.match(req.text,/:เพลงรัก$/);assert.equal(req.language,'th-TH');assert.equal($('results-list').children.length,1);
  });
  await t.test('next search clears the old query and synchronously focuses native input',async()=>{
   await wait(()=>$('send').disabled===false);const count=calls.length;$('send').click();
   assert.equal($('query').value,'');assert.equal(document.activeElement,$('query'));assert.equal($('query').readOnly,false);assert.equal($('country-keyboard').hidden,true);assert.equal(calls.length,count);
  });
  await t.test('Vietnamese IME stays local until explicit Search/Enter and sends accented title once',async()=>{
   choose('vi-VN');$('query-keyboard').click();const count=calls.filter(c=>c.op==='search').length;
   await $('query').fire('compositionstart');
   typeNative('query','Đừng làm'.normalize('NFD'));
   await $('query').fire('keydown',{key:'Enter',isComposing:true});
   await $('query').fire('keydown',{key:'Enter',isComposing:false,keyCode:229});
   assert.equal(calls.filter(c=>c.op==='search').length,count,'composition must not search');
   const title='Đừng làm trái tim anh đau';typeNative('query',title.normalize('NFD'));
   await $('query').fire('compositionend');
   assert.equal($('query').value,title.normalize('NFD'),'do not rewrite the IME draft');
   assert.equal(calls.filter(c=>c.op==='search').length,count);
   let prevented=false;await $('query').fire('keydown',{key:'Enter',preventDefault(){prevented=true;}});
   assert.equal(prevented,true);await wait(()=>calls.filter(c=>c.op==='search').length===count+1);await wait(()=>!$('send').disabled);
   const req=calls.filter(c=>c.op==='search').at(-1);assert.equal(req.language,'vi-VN');assert.ok(req.text.endsWith(':'+title));
   assert.equal($('query').value,title);assert.equal($('results-list').children.length,1);assert.equal($('connect').disabled,true);
  });
  await t.test('pasted Vietnamese title with newlines and keyboard change event works with app search button',async()=>{
   const count=calls.filter(c=>c.op==='search').length;
   $('query').value='  Nơi này có anh\nkaraoke\tbeat  '.normalize('NFD');await $('query').fire('change');
   assert.equal(calls.filter(c=>c.op==='search').length,count);
   $('send').click();await wait(()=>calls.filter(c=>c.op==='search').length===count+1);await wait(()=>!$('send').disabled);
   const req=calls.filter(c=>c.op==='search').at(-1);assert.equal(req.language,'vi-VN');assert.ok(req.text.endsWith(':Nơi này có anh karaoke beat'));
   assert.equal($('query').value,'Nơi này có anh karaoke beat');
  });
  await t.test('late blur/change after a successful keyboard search cannot resend the previous song',async()=>{
   const count=calls.filter(c=>c.op==='search').length;await $('query').fire('change');$('send').click();
   assert.equal($('query').value,'');assert.equal(calls.filter(c=>c.op==='search').length,count);
  });
  await t.test('phone Search action without a keydown submits the next Vietnamese title',async()=>{
   const count=calls.filter(c=>c.op==='search').length;typeNative('query','Chúng ta của hiện tại');
   let prevented=false;await $('query').fire('beforeinput',{inputType:'insertLineBreak',preventDefault(){prevented=true;}});
   assert.equal(prevented,true);await wait(()=>calls.filter(c=>c.op==='search').length===count+1);await wait(()=>!$('send').disabled);
   assert.ok(calls.filter(c=>c.op==='search').at(-1).text.endsWith(':Chúng ta của hiện tại'));
  });
  await t.test('favorites native composition uses its own explicit search and keeps video draft',async()=>{
   choose('ko-KR');typeNative('query','보존할 영상');$('favorites-open').click();await wait(()=>!$('favorites-search').disabled&&$('favorites-list').children.length===1);
   $('favorites-keyboard').click();assert.equal(document.activeElement,$('favorites-query'));const count=calls.filter(c=>c.op==='search').length;
   typeNative('favorites-query','사');await $('favorites-query').fire('keydown',{key:'Enter',isComposing:true});typeNative('favorites-query','사랑');
   assert.equal(calls.filter(c=>c.op==='search').length,count);assert.equal($('query').value,'보존할 영상');assert.equal($('country-keyboard').hidden,true);
   $('favorites-search').click();await wait(()=>calls.filter(c=>c.op==='search').length===count+1);await wait(()=>!$('favorites-search').disabled);
   const req=calls.filter(c=>c.op==='search').at(-1);assert.match(req.text,/^WKV1:[a-f0-9]{32}:ko-KR:0:사랑$/);assert.equal($('favorites-query').value,'사랑');
  });
  await t.test('all language changes keep room, draft and native language hint without PC commands',async()=>{
   $('favorites-open').click();const count=calls.length;
   for(const lang of LANGUAGES){choose(lang.code);$('query-keyboard').click();assert.equal($('query').lang,lang.code);assert.equal($('favorites-query').lang,lang.code);assert.equal($('query').readOnly,false);assert.equal($('query').value,'보존할 영상');assert.equal($('country-keyboard').hidden,true);}
   assert.equal(calls.length,count);assert.equal($('connect').disabled,true);
  });
  await t.test('keyboard microphone and adjacent icon both stay native',()=>{
   $('keyboard-voice').click();assert.equal($('query').readOnly,false);assert.equal($('query').attributes.inputmode,'text');assert.equal(document.activeElement,$('query'));assert.equal($('country-keyboard').hidden,true);
   $('query-keyboard').click();assert.equal($('query').readOnly,false);assert.equal(document.activeElement,$('query'));assert.equal($('country-keyboard').hidden,true);
  });
  await t.test('playback controls retain their protocol',async()=>{
   $('remote-next').click();await wait(()=>calls.some(c=>c.op==='search'&&/:next$/.test(c.text)));await wait(()=>!$('remote-next').disabled);assert.equal(calls.filter(c=>c.op==='search'&&/:next$/.test(c.text)).length,1);
  });
  await t.test('every PC join downloads all countries without opening favorites, and cached pages reserve on the current PC',async()=>{
   const {IDBFactory}=await import('fake-indexeddb');
   globalThis.indexedDB=new IDBFactory();
   const file=JSON.parse(await readFile(new URL('../data/favorites/all.json',import.meta.url)));
   const initial={...file,updatedAt:'2030-01-01T00:00:00Z'};
   const extra={country:'ko',id:'NEWtest1234',title:'재접속 시험곡',count:999999,lastPlayed:'2030-01-02T00:00:00Z'};
   const relay=globalThis.fetch, releases=[];
   globalThis.fetch=(url,options)=>options.method==='POST'?relay(url,options):new Promise(resolve=>releases.push(data=>resolve(Response.json(data))));
   try{
    const start=async()=>{$('disconnect').click();$('connect').click();await wait(()=>!$('remote-play').disabled);};
    choose('ko-KR');
    await start();await wait(()=>releases.length===1);
    assert.equal($('favorites-panel').hidden,true);
    releases[0](initial);
    await wait(()=>$('favorites-storage').textContent.includes(String(initial.rows.length)));
    assert.match($('favorites-storage').textContent,/휴대폰에 저장된/);
    await start();await wait(()=>releases.length===2);
    const before=calls.filter(c=>c.op==='search').length;
    $('favorites-open').click();
    assert.ok($('favorites-list').children.length>0);
    releases[1]({...initial,updatedAt:'2030-01-02T00:00:00Z',rows:[extra,...initial.rows]});
    await wait(()=>$('favorites-list').children[0]?.children[1].children[0].textContent===extra.title);
    typeNative('favorites-query','재접속');$('favorites-search').click();
    assert.equal($('favorites-list').children.length,1);
    assert.equal(calls.filter(c=>c.op==='search').length,before);
    $('favorites-list').children[0].click();
    await wait(()=>calls.some(c=>c.op==='search'&&c.text.includes(':NEWtest1234:재접속 시험곡')));
    await wait(()=>!$('remote-play').disabled);
    $('disconnect').click();$('favorites-open').click();
    assert.ok($('favorites-list').children[0].disabled);
    assert.equal(releases.length,2);
   }finally{globalThis.fetch=relay;delete globalThis.indexedDB;}
  });
 }finally{await events.fire('pagehide');}
});
