import {LAYOUTS,LATIN,SYMBOLS,KEY_LABELS} from './layouts.mjs?v=3.4.2';
import {KEYBOARD_TEXT} from './text.mjs?v=3.4';
import {KeyboardEditor} from './editor.mjs?v=3.4';

export function createCountryKeyboard({getLanguage,getName,blocked=()=>false,$=id=>document.getElementById(id),doc=document,win=window}){
 const panel=$('country-keyboard'),preview=$('country-keyboard-preview'),keys=$('country-keyboard-keys');
 const bindings=[{field:$('query'),toggle:$('query-keyboard'),search:$('send')},{field:$('favorites-query'),toggle:$('favorites-keyboard'),search:$('favorites-search')}];
 let active=null,editor=null,page=0,mode='local',locale=getLanguage(),drawing=false;
 const words=()=>KEYBOARD_TEXT[getLanguage()]||KEYBOARD_TEXT['ko-KR'];
 const available=b=>b&&!b.field.disabled&&!blocked()&&!(b.field===$('favorites-query')&&$('favorites-panel').hidden);
 function keyboardMode(b,custom){b.custom=custom;b.field.readOnly=custom;b.field.setAttribute('inputmode',custom?'none':'text');}
 function close(){panel.hidden=true;active=null;editor=null;for(const b of bindings)b.toggle.setAttribute('aria-expanded','false');doc.body?.classList.remove('country-keyboard-open');}
 function write(){
  if(!active||!editor)return;const changed=active.field.value!==editor.value;
  active.field.value=editor.value;active.field.setSelectionRange?.(editor.start,editor.end);
  preview.value=editor.value;preview.setSelectionRange?.(editor.start,editor.end);
  // The ordinary input handler still owns search state. Typing never submits.
  if(changed)active.field.dispatchEvent(new Event('input',{bubbles:true}));
 }
 function renderCandidates(){
  const holder=$('country-keyboard-candidates');holder.replaceChildren();
  const candidates=editor?.candidates()||[];
  holder.hidden=!editor?.pinyin;
  $('country-keyboard-composition').textContent=editor?.pinyin?.raw||'';
  // All candidates remain reachable by horizontal scrolling; none are discarded.
  for(const candidate of candidates){
   const button=doc.createElement('button');button.type='button';button.textContent=candidate.text;button.className='country-keyboard-candidate';
   button.addEventListener('click',()=>{if(!available(active))return;if(editor.choose(candidate)){write();renderCandidates();refresh();}});holder.append(button);
  }
  holder.scrollLeft=0;
 }
 function takeSelection(){if(editor&&preview.selectionStart!=null)editor.setSelection(preview.selectionStart,preview.selectionEnd);}
 function press(key){
  if(!available(active)||!editor)return;takeSelection();
  let result=true;
  if(key==='backspace')editor.backspace();
  else if(key==='clear')editor.clear();
  else if(key==='left'||key==='right')editor.move(key==='left'?-1:1);
  else result=editor.input(key,{native:mode==='local'});
  write();renderCandidates();refresh();
  $('country-keyboard-status').textContent=!result&&editor.value.length>=editor.limit?words().limit:'';
 }
 function renderKeys(){
  const layout=mode==='symbols'?SYMBOLS:mode==='latin'?LATIN[page]:LAYOUTS[getLanguage()].pages[page];
  keys.replaceChildren();
  for(const row of layout){
   const line=doc.createElement('div');line.className='country-keyboard-row';
   for(const key of row){
    const button=doc.createElement('button');button.type='button';button.className='country-keyboard-key'+(key==='ဪ'?' country-keyboard-extra-wide':['ໜ','ໝ','ဏ','ဿ','ေ','င်္','ဤ','ဩ'].includes(key)?' country-keyboard-wide':'');button.setAttribute('data-key',key);
    button.textContent=KEY_LABELS[key]||(/^\p{M}/u.test(key)?'◌'+key:key);
    button.addEventListener('click',()=>press(key));line.append(button);
   }keys.append(line);
  }
  $('country-keyboard-shift').setAttribute('aria-pressed',String(page===1));
  $('country-keyboard-latin').setAttribute('aria-pressed',String(mode==='latin'));
  $('country-keyboard-symbols').setAttribute('aria-pressed',String(mode==='symbols'));
  $('country-keyboard-shift').textContent=getLanguage()==='ja-JP'&&mode==='local'?(page?'あいう':'アイウ'):(page?'⇧ 2':'⇧ 1');
 }
 function changeMode(next){if(!available(active))return;editor.commit();mode=next;page=0;renderKeys();renderCandidates();}
 function open(binding){
  if(!available(binding))return;active=binding;keyboardMode(binding,true);
  editor=new KeyboardEditor(getLanguage(),binding.field.value,Number(binding.field.maxLength)>0?Number(binding.field.maxLength):(binding.field===$('query')?200:160));
  const start=binding.field.selectionStart,end=binding.field.selectionEnd;
  if(start!=null)editor.setSelection(start,end);
  page=0;mode='local';panel.hidden=false;$('country-keyboard-status').textContent='';binding.field.blur?.();
  doc.body?.classList.add('country-keyboard-open');
  preview.value=editor.value;preview.setSelectionRange?.(editor.start,editor.end);
  renderKeys();renderCandidates();refresh();preview.focus({preventScroll:true});
 }
 function native(field){
  const binding=bindings.find(b=>b.field===field)||active;if(!available(binding))return;
  close();keyboardMode(binding,false);binding.field.focus();
 }
 function refresh(){
  if(drawing)return;drawing=true;
  try{
   const w=words(),changed=locale!==getLanguage();
   if(changed){locale=getLanguage();for(const b of bindings)keyboardMode(b,true);mode='local';page=0;editor?.setLanguage(locale);}
   for(const b of bindings){b.toggle.disabled=!available(b);b.toggle.setAttribute('aria-label',w.keyboard);b.toggle.title=w.keyboard;b.toggle.setAttribute('aria-expanded',String(active===b&&!panel.hidden));}
   if(active&&!available(active)){close();return;}
   if(!active)return;
   if(editor.value!==active.field.value){editor.setValue(active.field.value);preview.value=editor.value;preview.setSelectionRange?.(editor.start,editor.end);renderCandidates();}
   panel.lang=getLanguage();$('country-keyboard-title').textContent=getName()+' · '+w.keyboard;
   preview.setAttribute('aria-label',active.field.getAttribute?.('aria-label')||active.field.placeholder||w.keyboard);
   for(const key of ['native','clear','space','close'])$('country-keyboard-'+key).textContent=w[key];
   for(const key of ['shift','backspace','left','right'])$('country-keyboard-'+key).setAttribute('aria-label',w[key]);
   $('country-keyboard-help').textContent=w.tip;
   $('country-keyboard-search').textContent=active.search.textContent;$('country-keyboard-search').disabled=active.search.disabled;
   if(changed){renderKeys();renderCandidates();}
  }finally{drawing=false;}
 }
 for(const b of bindings){
  keyboardMode(b,true);b.toggle.setAttribute('aria-controls','country-keyboard');
  b.toggle.addEventListener('click',()=>{if(active===b&&!panel.hidden)close();else open(b);});
  b.field.addEventListener('focus',()=>{if(b.custom&&active!==b)open(b);});
  b.field.addEventListener('click',()=>{if(b.custom&&active!==b)open(b);});
 }
 preview.readOnly=true;preview.setAttribute('inputmode','none');
 preview.addEventListener('select',()=>{takeSelection();renderCandidates();});
 for(const key of ['clear','backspace','left','right'])$('country-keyboard-'+key).addEventListener('click',()=>press(key));
 $('country-keyboard-space').addEventListener('click',()=>press(' '));
 $('country-keyboard-close').addEventListener('click',close);
 $('country-keyboard-native').addEventListener('click',()=>native());
 $('country-keyboard-shift').addEventListener('click',()=>{if(!available(active)||mode==='symbols')return;page=1-page;renderKeys();});
 $('country-keyboard-latin').addEventListener('click',()=>changeMode(mode==='latin'?'local':'latin'));
 $('country-keyboard-symbols').addEventListener('click',()=>changeMode(mode==='symbols'?'local':'symbols'));
 $('country-keyboard-search').addEventListener('click',()=>{if(!available(active)||active.search.disabled)return;const search=active.search;close();search.click();});
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}else if(e.target===preview){
  if(e.key==='Backspace'){e.preventDefault();press('backspace');}
  else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();press(e.key==='ArrowLeft'?'left':'right');}
 }});
 win.addEventListener('pointerdown',e=>{
  if(!active||panel.contains(e.target)||bindings.some(b=>b.field===e.target||b.toggle.contains(e.target)))return;close();
 });
 win.addEventListener('pagehide',close);
 refresh();return{refresh,close,native};
}
