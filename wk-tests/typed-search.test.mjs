import test from 'node:test';
import assert from 'node:assert/strict';
import {bindTypedSearch,normalizeTypedQuery} from '../wk/typed-search.mjs';
import {browseCommand} from '../wk/browse-protocol.mjs';

function input(){
 const listeners=new Map();let sends=0,drafts=0,ready=true;
 const field={value:'',addEventListener:(name,fn)=>listeners.set(name,fn)};
 bindTypedSearch({field,submit:()=>{sends++;ready=false;},canSubmit:()=>ready,onDraft:()=>drafts++});
 return{field,get sends(){return sends;},get drafts(){return drafts;},ready:value=>ready=value,
  fire(name,event={}){let prevented=false;listeners.get(name)?.({...event,preventDefault:()=>prevented=true});return prevented;}};
}
test('Vietnamese accents survive NFC normalization and copied line separators become spaces',()=>{
 const title='Đường về quê mẹ';assert.equal(normalizeTypedQuery(title.normalize('NFD')),title);
 const cleaned=normalizeTypedQuery('  '+title+'\r\nkaraoke\tbeat\u2028nhạc\u2029Việt  ');
 assert.equal(cleaned,title+' karaoke beat nhạc Việt');assert.ok(browseCommand(cleaned,'a'.repeat(32),'vi-VN').endsWith(':'+cleaned));
 assert.equal(normalizeTypedQuery('เพลงรัก 한국어 日本語 မြန်မာ'),'เพลงรัก 한국어 日本語 မြန်မာ');
 assert.equal(normalizeTypedQuery('Nơi này có anh'), 'Nơi này có anh');
 assert.throws(()=>browseCommand(normalizeTypedQuery('song\x00name'),'a'.repeat(32),'vi-VN'),'other controls still rejected');
});
test('typing, pasting, change and composition completion never auto-submit',()=>{
 const h=input();h.fire('input');h.field.value='Bài hát';h.fire('change');h.fire('compositionstart');h.fire('input');h.fire('compositionend');
 assert.equal(h.sends,0);assert.equal(h.drafts,4);
});
test('IME confirmation Enter and Android keyCode 229 never submit',()=>{
 const h=input();h.fire('compositionstart');h.fire('keydown',{key:'Enter'});h.fire('beforeinput',{inputType:'insertParagraph'});h.fire('compositionend');
 h.fire('keydown',{key:'Enter',isComposing:true});h.fire('keydown',{key:'Enter',keyCode:229});h.fire('beforeinput',{inputType:'insertLineBreak'});
 h.fire('beforeinput',{inputType:'insertLineBreak',isComposing:true});assert.equal(h.sends,0);
 assert.equal(h.fire('keydown',{key:'Enter'}),true);assert.equal(h.sends,1);
});
test('delayed change after submitted NFC normalization does not announce a new draft',()=>{
 const h=input();h.field.value='Đường về'.normalize('NFD');h.fire('input');assert.equal(h.drafts,1);
 h.field.value=normalizeTypedQuery(h.field.value);h.fire('change');assert.equal(h.drafts,1);
 h.field.value='Nơi này';h.fire('change');assert.equal(h.drafts,2);
});
test('Enter sends once; repeat, paired beforeinput and busy presses cannot duplicate it',()=>{
 const h=input();assert.equal(h.fire('keydown',{key:'Enter'}),true);h.fire('beforeinput',{inputType:'insertLineBreak'});h.fire('keydown',{key:'Enter',repeat:true});
 assert.equal(h.sends,1);h.ready(true);h.fire('keydown',{key:'Enter',repeat:true});assert.equal(h.sends,1);
 h.fire('keydown',{key:'Enter'});assert.equal(h.sends,2);
});
test('soft keyboards can submit without keydown, while modified Enter can still insert a newline',()=>{
 const h=input();h.fire('beforeinput',{inputType:'insertLineBreak'});assert.equal(h.sends,1);h.ready(true);
 assert.equal(h.fire('keydown',{key:'Enter',shiftKey:true}),false);assert.equal(h.fire('beforeinput',{inputType:'insertLineBreak'}),false);assert.equal(h.sends,1);
 h.fire('beforeinput',{inputType:'insertParagraph'});assert.equal(h.sends,2);
});
test('disabled or disconnected action does not submit; ordinary text is not prevented',()=>{
 const h=input();h.ready(false);h.fire('keydown',{key:'Enter'});h.fire('beforeinput',{inputType:'insertLineBreak'});assert.equal(h.sends,0);
 assert.equal(h.fire('keydown',{key:'a'}),false);assert.equal(h.fire('beforeinput',{inputType:'insertText',data:'ế'}),false);
});
