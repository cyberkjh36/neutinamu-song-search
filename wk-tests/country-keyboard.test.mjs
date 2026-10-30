import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {KeyboardEditor,appendHangul,previousBoundary} from '../wk/keyboard/editor.mjs';
import {LAYOUTS} from '../wk/keyboard/layouts.mjs';
import {KEYBOARD_TEXT} from '../wk/keyboard/text.mjs';
import {PINYIN} from '../wk/keyboard/pinyin-data.mjs';
import {LANGUAGES} from '../wk/labels.mjs';
import {createCountryKeyboard} from '../wk/keyboard/ui.mjs';
const type=(e,keys)=>{for(const key of keys)e.input(key);return e.value;};

test('all eleven countries have readable labels, full local layouts and <= 10 keys per row',()=>{
 assert.deepEqual(Object.keys(LAYOUTS),LANGUAGES.map(x=>x.code));
 for(const {code} of LANGUAGES){assert.equal(LAYOUTS[code].pages.length,2);for(const page of LAYOUTS[code].pages)for(const row of page){assert.ok(row.length>0&&row.length<=10);for(const key of row)assert.ok(key&&key!=='undefined');}
  for(const value of Object.values(KEYBOARD_TEXT[code]))assert.ok(value.trim());
 }
 assert.ok(LAYOUTS['my-MM'].pages[0].every(row=>row.length<=9));
 assert.ok(LAYOUTS['mn-MN'].pages.flat(2).includes('ү'));assert.ok(LAYOUTS['mn-MN'].pages.flat(2).includes('ө'));
});
for(const [title,keys] of [['사랑은 늘 도망가','ㅅㅏㄹㅏㅇㅇㅡㄴ ㄴㅡㄹ ㄷㅗㅁㅏㅇㄱㅏ'],['값이','ㄱㅏㅂㅅㅇㅣ'],['가까이','ㄱㅏㄲㅏㅇㅣ'],['괜찮아','ㄱㅗㅐㄴㅊㅏㄴㅎㅇㅏ'],['닭을','ㄷㅏㄹㄱㅇㅡㄹ'],['과자','ㄱㅗㅏㅈㅏ'],['읽어','ㅇㅣㄹㄱㅇㅓ'],['있다','ㅇㅣㅆㄷㅏ'],['갃사','ㄱㅏㄱㅅㅅㅏ']]){
 test('Korean two-set composition: '+title,()=>assert.equal(type(new KeyboardEditor('ko-KR'),keys),title));
}
test('all 11,172 modern Hangul syllables compose correctly',()=>{
 const L=[...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'],V=[...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'],T=['',...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
 for(let l=0;l<19;l++)for(let v=0;v<21;v++)for(let t=0;t<28;t++){const first=appendHangul(L[l],V[v]);assert.equal(t?appendHangul(first,T[t]):first,String.fromCharCode(0xac00+(l*21+v)*28+t));}
});
test('Korean compound final migrates to next vowel and undo removes one entered key',()=>{
 const e=new KeyboardEditor('ko-KR');type(e,'ㄱㅏㅂㅅ');assert.equal(e.value,'값');e.input('ㅏ');assert.equal(e.value,'갑사');
 for(const expected of ['값','갑','가','ㄱ','']){e.backspace();assert.equal(e.value,expected);}
});
test('cursor changes and native edits commit the previous syllable',()=>{
 const e=new KeyboardEditor('ko-KR','노래');e.input('ㄱ');assert.equal(e.value,'노래ㄱ');e.setSelection(0);type(e,'ㅇㅏ');assert.equal(e.value,'아노래ㄱ');
 e.setValue('노래',0,2);type(e,'ㅅㅏ');assert.equal(e.value,'사');
});
test('Vietnamese vowel shape and all five tones use composed Unicode',()=>{
 const e=new KeyboardEditor('vi-VN');type(e,['T','i','ê','{acute}','n','g',' ','V','i','ê','{dot}','t']);assert.equal(e.value,'Tiếng Việt');
 e.setValue('ă');for(const [key,want] of [['{acute}','ắ'],['{grave}','ằ'],['{hook}','ẳ'],['{tilde}','ẵ'],['{dot}','ặ'],['{noTone}','ă']]){e.input(key);assert.equal(e.value,want);}
 e.setValue('Ơ');e.input('{grave}');assert.equal(e.value,'Ờ');assert.equal(e.value,e.value.normalize('NFC'));
 e.setValue('b');assert.equal(e.input('{acute}'),false);assert.equal(e.value,'b');
});
test('Japanese kana voicing, small letters and katakana work without a phone IME',()=>{
 const e=new KeyboardEditor('ja-JP');type(e,['か','{dakuten}','ん','は','{handakuten}','い']);assert.equal(e.value,'がんぱい');
 e.setValue('つ');e.input('{small}');assert.equal(e.value,'っ');e.input('{small}');assert.equal(e.value,'つ');
 e.setValue('ハ');e.input('{handakuten}');assert.equal(e.value,'パ');e.input('{dakuten}');assert.equal(e.value,'バ');e.input('{dakuten}');assert.equal(e.value,'ハ');
 e.setValue('ウ');e.input('{dakuten}');assert.equal(e.value,'ヴ');
});
test('Chinese offline candidates cover full syllables and continuous pinyin with selected characters',()=>{
 assert.ok(Object.keys(PINYIN).length>=398);const e=new KeyboardEditor('zh-CN');type(e,'nihao');assert.equal(e.value,'nihao');
 let candidates=e.candidates();assert.ok(candidates.some(x=>x.text==='你'));e.choose(candidates.find(x=>x.text==='你'));assert.equal(e.value,'你hao');
 e.choose(e.candidates().find(x=>x.text==='好'));assert.equal(e.value,'你好');assert.equal(e.candidates().length,0);
 type(e,'zhoujielun');for(const c of ['周','杰','伦']){const choice=e.candidates().find(x=>x.text===c);assert.ok(choice,c);e.choose(choice);}assert.equal(e.value,'你好周杰伦');
 e.setValue('');type(e,"xi'an");e.choose(e.candidates().find(x=>x.text==='西'));e.choose(e.candidates().find(x=>x.text==='安'));assert.equal(e.value,'西安');
 e.setValue('');type(e,'zzzz');assert.deepEqual(e.candidates(),[]);e.backspace();assert.equal(e.value,'zzz');
});
test('native alphabet, numbers and symbol mode do not trigger Hangul or Chinese conversion',()=>{
 const e=new KeyboardEditor('zh-CN');for(const c of 'Adele 2026')e.input(c,{native:false});assert.equal(e.value,'Adele 2026');assert.equal(e.pinyin,null);
});
test('all countries can enter a representative title/word entirely from their keys',()=>{
 const samples={'ko-KR':'ㅅㅏㄹㅏㅇ','th-TH':'เพลงรัก','fil-PH':'Buwan','vi-VN':'Hẹn hò','ne-NP':'नेपाली','mn-MN':'Монгол дуу','id-ID':'Cinta','lo-LA':'ເພງລາວ','my-MM':'မြန်မာ','zh-CN':'yue','ja-JP':'さくら'};
 for(const [locale,sample] of Object.entries(samples)){
  const keys=new Set(LAYOUTS[locale].pages.flat(2));for(const c of sample.normalize('NFD')){if(/[\p{M}\s]/u.test(c))continue;assert.ok(keys.has(c)||keys.has(c.toLowerCase()),locale+' missing '+c);}
  const e=new KeyboardEditor(locale);type(e,sample);assert.ok(e.value.trim());
 }
});
test('Unicode title limits, selection replacement, cursor and grapheme deletion preserve text',()=>{
 const e=new KeyboardEditor('fil-PH','abcd',4);assert.equal(e.input('e'),false);e.setSelection(1,3);e.input('X');assert.equal(e.value,'aXd');
 e.move(-1);e.input('!');assert.equal(e.value,'a!Xd');e.setSelection(1,3);e.backspace();assert.equal(e.value,'ad');
 e.setValue('a😀');e.backspace();assert.equal(e.value,'a');
 e.setValue('เพลง');e.clear();assert.equal(e.value,'');assert.equal(e.start,0);
 e.setValue('a\u0301');e.backspace();assert.equal(e.value,'');
 const ko=new KeyboardEditor('ko-KR','',1);type(ko,'ㄱㅏㄴ');assert.equal(ko.value,'간');assert.equal(ko.input('ㅏ'),false);assert.equal(ko.value,'간');
});
test('older Safari grapheme fallback does not split emoji or dangling combining marks',async()=>{
 const saved=Intl.Segmenter;try{Intl.Segmenter=undefined;const old=await import('../wk/keyboard/editor.mjs?old-safari');assert.equal(old.previousBoundary('A😀',3),1);assert.equal(old.previousBoundary('a\u0301',2),0);}finally{Intl.Segmenter=saved;}
});

class Element{
 constructor(id='',tag='div'){this.id=id;this.tagName=tag;this.value='';this.disabled=false;this.hidden=false;this.attributes={};this.events=new Map();this.children=[];this.textContent='';this.selectionStart=0;this.selectionEnd=0;this.maxLength=-1;this.placeholder='';const classes=new Set();this.classList={add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle:(k,v)=>v?classes.add(k):classes.delete(k)};}
 addEventListener(k,f){if(!this.events.has(k))this.events.set(k,[]);this.events.get(k).push(f);}
 fire(k,e={}){for(const f of this.events.get(k)||[])f({target:this,preventDefault(){},...e});}
 dispatchEvent(e){this.fire(e.type);return true;}
 click(){if(!this.disabled)this.fire('click');}
 focus(){this.focused=true;this.fire('focus');}blur(){this.focused=false;}
 setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}
 setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}
 contains(node){return this===node||this.children.some(c=>c.contains(node));}
}
async function harness(){
 const html=await readFile(new URL('../wk/index.html',import.meta.url),'utf8'),elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element(m[1])]));const $=id=>elements.get(id);
 $('query').maxLength=200;$('favorites-query').maxLength=160;$('country-keyboard').hidden=true;
 const doc={body:new Element(),createElement:tag=>new Element('',tag)},win=new Element();let locale='ko-KR',blocked=false,searches=0,changes=0;
 $('send').textContent='영상 검색';$('favorites-search').textContent='애창곡 검색';$('query').addEventListener('input',()=>changes++);$('favorites-query').addEventListener('input',()=>changes++);$('send').addEventListener('click',()=>searches++);$('favorites-search').addEventListener('click',()=>searches++);
 const ui=createCountryKeyboard({getLanguage:()=>locale,getName:()=>LANGUAGES.find(x=>x.code===locale).name,blocked:()=>blocked,$,doc,win});
 const key=k=>$('country-keyboard-keys').children.flatMap(r=>r.children).find(x=>x.getAttribute('data-key')===k)?.click();
 return{$,ui,doc,win,key,choose:code=>{locale=code;ui.refresh();},block:value=>{blocked=value;ui.refresh();},get searches(){return searches;},get changes(){return changes;}};
}
test('custom keyboard opens by field or icon, toggles closed, keeps native IME off and never auto searches',async()=>{
 const h=await harness(),{$,key,ui}=h;assert.equal($('query').readOnly,true);assert.equal($('query').attributes.inputmode,'none');
 $('query').focus();assert.equal($('country-keyboard').hidden,false);key('ㅅ');key('ㅏ');key('ㄹ');key('ㅏ');key('ㅇ');assert.equal($('query').value,'사랑');assert.equal(h.searches,0);assert.equal(h.changes,5);
 $('query-keyboard').click();assert.equal($('country-keyboard').hidden,true);$('query-keyboard').click();assert.equal($('country-keyboard-preview').value,'사랑');
 $('country-keyboard-search').click();assert.equal(h.searches,1);assert.equal($('country-keyboard').hidden,true);
});
test('favorites has an independent draft and delegates exactly one explicit search',async()=>{
 const h=await harness(),{$,key}=h;$('query').value='동영상';$('favorites-keyboard').click();key('ㄴ');key('ㅗ');key('ㄹ');key('ㅐ');assert.equal($('favorites-query').value,'노래');assert.equal($('query').value,'동영상');assert.equal(h.searches,0);
 $('country-keyboard-search').click();assert.equal(h.searches,1);assert.equal($('favorites-query').value,'노래');
});
test('country changes switch all eleven layouts, preserve draft, reset mode, and translate controls',async()=>{
 const h=await harness(),{$}=h;$('query').value='kept';$('query-keyboard').click();
 for(const lang of LANGUAGES){h.choose(lang.code);assert.equal($('country-keyboard').lang,lang.code);assert.ok($('country-keyboard-title').textContent.includes(lang.name));assert.equal($('country-keyboard-native').textContent,KEYBOARD_TEXT[lang.code].native);assert.equal($('query').value,'kept');}
 $('country-keyboard-symbols').click();assert.ok($('country-keyboard-keys').children[0].children.some(b=>b.textContent==='1'));h.choose('th-TH');assert.ok($('country-keyboard-keys').children[0].children.some(b=>b.textContent==='ๆ'));assert.equal(h.searches,0);
});
test('system keyboard fallback happens synchronously in the tap and custom icon restores app keyboard',async()=>{
 const h=await harness(),{$,ui}=h;$('query').value='ไทย';$('query-keyboard').click();$('country-keyboard-native').click();assert.equal($('query').readOnly,false);assert.equal($('query').attributes.inputmode,'text');assert.equal($('query').focused,true);assert.equal($('country-keyboard').hidden,true);
 $('query-keyboard').click();assert.equal($('query').readOnly,true);assert.equal($('country-keyboard').hidden,false);assert.equal($('query').value,'ไทย');ui.native($('query'));assert.equal($('country-keyboard').hidden,true);
});
test('busy microphone, disabled search, hidden favorites and outside touches cannot leave an active editor',async()=>{
 const h=await harness(),{$,key,ui,win}=h;$('query-keyboard').click();$('send').disabled=true;ui.refresh();$('country-keyboard-search').click();assert.equal(h.searches,0);assert.equal($('country-keyboard-search').disabled,true);
 h.block(true);assert.equal($('country-keyboard').hidden,true);$('query-keyboard').click();assert.equal($('country-keyboard').hidden,true);
 h.block(false);$('favorites-keyboard').click();$('favorites-panel').hidden=true;ui.refresh();assert.equal($('country-keyboard').hidden,true);
 $('query-keyboard').click();win.fire('pointerdown',{target:new Element()});assert.equal($('country-keyboard').hidden,true);
});
test('external voice/reset values cannot be overwritten by stale editor state',async()=>{
 const h=await harness(),{$,ui,key}=h;$('query-keyboard').click();key('ㄱ');$('query').value='음성';ui.refresh();key('ㅅ');key('ㅓ');assert.equal($('query').value,'음성서');
 $('query').value='';ui.refresh();key('ㄱ');key('ㅏ');assert.equal($('query').value,'가');
});
test('all Chinese candidates are reachable and selecting one updates the real search field',async()=>{
 const h=await harness(),{$,key}=h;h.choose('zh-CN');$('query-keyboard').click();for(const c of 'zhou')key(c);assert.equal($('query').value,'zhou');
 const button=$('country-keyboard-candidates').children.find(b=>b.textContent==='周');assert.ok(button);button.click();assert.equal($('query').value,'周');assert.equal(h.searches,0);
});

test('browser translation cannot rewrite the selected language or key labels',async()=>{
 const html=await readFile(new URL('../wk/index.html',import.meta.url),'utf8');
 assert.match(html,/<html[^>]*translate="no"/);assert.match(html,/<meta name="google" content="notranslate">/);
});
