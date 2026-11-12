import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LANGUAGES} from '../wk/labels.mjs';
import {KaraokeConnection} from '../wk/relay-client.mjs?v=3.10';

const titles={
 'ko-KR':'사랑은 늘 도망가', 'th-TH':'เพลงรักของเรา', 'fil-PH':'Awit ng pag-ibig',
 'vi-VN':'Đường về quê mẹ', 'ne-NP':'तिमी बिना मेरो जीवन', 'mn-MN':'Сэтгэлийн хөг аялгуу',
 'id-ID':'Cinta untukmu', 'lo-LA':'ເພງຮັກຂອງເຮົາ', 'my-MM':'အချစ်သီချင်း',
 'zh-CN':'月亮代表我的心', 'ja-JP':'君がいるだけで'
};
// This matrix tests text/IME/UI routing. The connection suite independently
// verifies the production rate waits. Leave clocks and native timers intact.
const search=KaraokeConnection.prototype.search;
KaraokeConnection.prototype.search=function(...args){this.nextSend=0;return search.apply(this,args);};
class Element {
 constructor(){this.value='';this.disabled=false;this.hidden=false;this.children=[];this.events=new Map();this.attributes={};this.dataset={};this.selectionStart=0;this.selectionEnd=0;this.classList={toggle(){},add(){},remove(){}};}
 addEventListener(k,f){if(!this.events.has(k))this.events.set(k,[]);this.events.get(k).push(f);}
 async fire(k,e={}){let prevented=false;await Promise.all((this.events.get(k)||[]).map(f=>f({target:this,preventDefault(){prevented=true;},...e})));return prevented;}
 click(){if(!this.disabled)void this.fire('click');}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}
 setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}getAttribute(k){return this.attributes[k];}
 setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}focus(){document.activeElement=this;void this.fire('focus');}
 blur(){if(document.activeElement===this)document.activeElement=null;}showModal(){this.open=true;}close(){this.open=false;}scrollIntoView(){}
 contains(e){return e===this||this.children.some(c=>c.contains(e));}
}
const wait=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('search UI did not settle');};
for(const device of ['Android Chrome/130','iPhone OS 14_8 Safari','iPhone OS 18_0 Safari'])test('all 11 languages: typed search, favorites and queue routing — '+device,async t=>{
 const html=await readFile(new URL('../wk/index.html',import.meta.url),'utf8');
 const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>[x[1],new Element()]));
 const $=id=>{assert.ok(elements.has(id),id);return elements.get(id);},events=new Element(),storage=new Map(),calls=[],jobs=new Map();
 $('favorites-panel').hidden=true;$('country-keyboard').hidden=true;
 globalThis.document={addEventListener(){},removeEventListener(){},body:new Element(),documentElement:{},getElementById:$,querySelector:()=>new Element(),createElement:()=>new Element()};
 globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 globalThis.location={protocol:'https:',hostname:'example.test',hash:'#12345678'};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{language:'ko-KR',userAgent:device,platform:device.startsWith('iPhone')?'iPhone':'Linux',maxTouchPoints:1}});
 globalThis.fetch=async(_,o)=>{
  const request=JSON.parse(o.body);calls.push(request);
  if(request.op==='search')jobs.set(request.id,request);
  const job=jobs.get(request.id),title=titles[job?.language]||'Song';
  return Response.json({ok:true,server:'WKQ1 WKS1 WKT1 WKC1 WKV1 TEST-PC',pending:false,result:true,catalog:{v:1,items:[{id:'abcdefghijk',title,channel:'1',duration:'3:00'}],error:null}});
 };
 globalThis.window={fetch:globalThis.fetch,crypto:globalThis.crypto,isSecureContext:true,addEventListener:events.addEventListener.bind(events)};
 const requests=()=>calls.filter(c=>c.op==='search'),type=async(field,value)=>{field.value=value;await field.fire('input');};
 const choose=code=>$('countries').children[LANGUAGES.findIndex(l=>l.code===code)].click();
 const settled=()=>!$('send').disabled&&!$('favorites-search').disabled;
 try {
  await import('../wk/app.mjs?matrix='+encodeURIComponent(device));$('connect').click();await wait(()=>!$('remote-play').disabled);
  assert.deepEqual(Object.keys(titles),LANGUAGES.map(l=>l.code));
  for(const language of LANGUAGES)await t.test(language.code+' preserves text and explicitly routes every search',async()=>{
   choose(language.code);const title=titles[language.code],nfd=title.normalize('NFD');
   assert.equal(document.documentElement.lang,language.code);assert.equal($('query').lang,language.code);assert.equal($('favorites-query').lang,language.code);
   for(const [id,meaning] of Object.entries({'search-title':'노래 제목 말하기','remote-play-label':'재생','remote-pause-label':'일시정지','remote-next-label':'다음곡','favorites-open':'애창곡','playlist-open':'예약곡 목록'})){
    const label=$(id).textContent;
    if(language.code==='ko-KR')assert.ok(!label.includes('\n('),'Korean has no duplicate gloss: '+id);
    else {assert.ok(label.endsWith('\n('+meaning+')'),'Korean gloss for '+language.code+' '+id);assert.ok(label.split('\n(')[0].trim());}
   }
   assert.equal(calls.filter(c=>c.op==='join').length,1,'no reconnect on language change');
   let count=requests().length;
   await $('query').fire('compositionstart');await type($('query'),nfd);
   await $('query').fire('keydown',{key:'Enter',isComposing:true});
   await $('query').fire('keydown',{key:'Enter',keyCode:229,isComposing:false});
   assert.equal(requests().length,count,'composition sends nothing');assert.equal($('query').value,nfd);
   await $('query').fire('compositionend');await $('query').fire('keyup',{key:'Enter'});
   assert.equal(await $('query').fire('beforeinput',{inputType:'insertLineBreak'}),true);
   await wait(()=>requests().length===count+1&&settled());
   assert.equal(requests().at(-1).language,language.code);assert.match(requests().at(-1).text,new RegExp('^WKF1:[a-f0-9]{32}:'+language.code+':'));
   assert.ok(requests().at(-1).text.endsWith(':'+title));assert.equal($('query').value,title);
   assert.equal($('results-list').children[0].children[1].children[0].textContent,title,'result title preserved');
   $('results-list').children[0].click();await wait(()=>requests().length===count+2&&settled());
   assert.match(requests().at(-1).text,/^WKQ2:/);assert.equal(requests().at(-1).language,language.code,'queue country preserved');
   assert.ok(requests().at(-1).text.endsWith(':abcdefghijk:'+title),'queue title preserved');
   count=requests().length;await $('query').fire('change');$('send').click();assert.equal($('query').value,'');assert.equal(requests().length,count,'next search clears instead of resending');
   await type($('query'),nfd+'\n karaoke\tbeat');$('send').click();await wait(()=>requests().length===count+1&&settled());
   assert.ok(requests().at(-1).text.endsWith(':'+title+'  karaoke beat'),'app button accepts copied line separators');
   count=requests().length;await type($('query'),nfd+'\r\nkaraoke');$('legacy-search').click();await wait(()=>requests().length===count+1&&settled());
   assert.equal(requests().at(-1).text,title+' karaoke','legacy PC search uses the same normalized title');assert.equal(requests().at(-1).language,language.code);
   $('favorites-open').click();await wait(()=>!$('favorites-panel').hidden&&settled());count=requests().length;
   await $('favorites-query').fire('compositionstart');await type($('favorites-query'),nfd);
   await $('favorites-query').fire('keydown',{key:'Enter',isComposing:false,keyCode:229});
   assert.equal(requests().length,count,'favorites must not search while selecting an IME candidate');
   await $('favorites-query').fire('compositionend');await $('favorites-query').fire('keyup',{key:'Enter'});
   assert.equal(await $('favorites-query').fire('beforeinput',{inputType:'insertParagraph'}),true);
   await wait(()=>requests().length===count+1&&settled());assert.ok(requests().at(-1).text.endsWith(':'+language.code+':0:'+title));
   count=requests().length;await type($('favorites-query'),nfd+'\nkaraoke');$('favorites-search').click();await wait(()=>requests().length===count+1&&settled());
   assert.ok(requests().at(-1).text.endsWith(':'+language.code+':0:'+title+' karaoke'));
   assert.equal($('query').value,title+' karaoke','favorites leaves the video draft intact');
   $('favorites-open').click();assert.equal($('favorites-panel').hidden,true);
  });
  assert.equal(calls.filter(c=>c.op==='join').length,1);
  assert.ok(requests().every(c=>c.room==='12345678'&&/^[a-f0-9]{64}$/.test(c.key)));
  assert.ok(!requests().some(c=>c.text.startsWith('WKC1:')),'search tests send no playback controls');
 }finally{await events.fire('pagehide');}
});
