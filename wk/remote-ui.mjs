import {REMOTE_TEXT} from './ui-text.mjs?v=3.11';
import {requestId} from './queue-protocol.mjs?v=3.1';
import {readCatalog} from './browse-protocol.mjs?v=3.0';
import {bindTypedSearch,normalizeTypedQuery} from './typed-search.mjs?v=3.7.2';
export function createRemoteUi({connection,getLanguage,blocked,cache,onRender=()=>{},$=id=>document.getElementById(id),doc=document}){
 let generation=connection.generation,language=getLanguage(),pending=false,controlStatus='',favoriteStatus='',failed=false,rows=[],page=0,applied='',loaded=false;
 let displayedSnapshot, more=false, loadSequence=0, menuOpen=false;
 const retries=new Map(),words=()=>REMOTE_TEXT[getLanguage()],connected=()=>['ready','sending'].includes(connection.state);
 function reset(){menuOpen=false;displayedSnapshot=undefined;more=false;generation=connection.generation;pending=false;controlStatus='';favoriteStatus='';failed=false;rows=[];page=0;applied='';loaded=false;retries.clear();$('favorites-list').replaceChildren();$('favorites-query').value='';$('favorites-panel').hidden=true;}
 function render(){
  if(generation!==connection.generation)reset();
  if(cache?.snapshot && cache.snapshot!==displayedSnapshot && loaded && !pending && !$('favorites-panel').hidden){
   showSaved(page,applied,true);
  }
  const w=words(),off=pending||blocked()||connection.state!=='ready';
  const browseOff=pending||blocked()||(!cache?.snapshot && (connection.state!=='ready'||!connection.favoritesSupported));
  const status=$('favorites-storage');
  status.textContent=cache?.snapshot ? (cache.saved?w.saved:w.temporary)+' · '+cache.snapshot.rows.length : '';
  status.hidden=!status.textContent;
  $('remote-title').textContent=w.title;$('remote-help').textContent=w.help;
  for(const action of ['play','pause','next']){$('remote-'+action+'-label').textContent=w[action];$('remote-'+action).disabled=off||!connection.controlSupported;}
  const tv=$('remote-tv');
  tv.hidden=!connection.tvInputSupported;
  tv.disabled=tv.hidden||off;
  $('remote-tv-label').textContent=w.tv;
  if(!connection.tvMenuSupported)menuOpen=false;
  $('tv-menu').hidden=!menuOpen;
  $('tv-menu-help').textContent=w.tvMenuHelp;
  $('tv-select').textContent=w.tvSelect;
  for(const id of ['tv-left','tv-right','tv-select'])$(id).disabled=!menuOpen||off;
  tv.setAttribute('aria-expanded',String(menuOpen));
  $('remote-feedback').textContent=!connected()?w.connect:controlStatus?w[controlStatus]:!connection.controlSupported?w.upgrade:'';
  $('remote-feedback').classList.toggle('error',['failed','uncertain','tvUnknown'].includes(controlStatus));
  $('favorites-open').textContent=w.favorites;$('favorites-open').disabled=browseOff;
  $('favorites-open').setAttribute('aria-expanded',String(!$('favorites-panel').hidden));
  $('favorites-hint').textContent=!connected()?w.connect:!connection.favoritesSupported?w.upgrade:w.hint;
  $('favorites-query-label').textContent=w.query;$('favorites-query').placeholder=w.query;$('favorites-query').disabled=browseOff;
  $('favorites-search').textContent=w.search;$('favorites-search').disabled=browseOff;
  $('favorites-previous').textContent=w.previous;$('favorites-previous').disabled=browseOff||!loaded||page===0;
  $('favorites-more').textContent=w.more;$('favorites-more').disabled=browseOff||!loaded||!more;
  $('favorites-page').textContent=loaded?w.page+' '+(page+1):'';
  $('favorites-feedback').textContent=favoriteStatus?w[favoriteStatus]:'';$('favorites-feedback').classList.toggle('error',failed);
  for(const row of rows){row.button.disabled=off||connection.queueSupported===false||row.state==='added';row.badge.textContent=w[row.state];row.button.setAttribute('aria-label',row.title+' · '+w[row.state]);row.meta.textContent=row.count+' '+w.plays;row.button.classList.toggle('reserved',row.state==='added');}
  onRender();
 }
 for(const action of ['play','pause','next'])$('remote-'+action).addEventListener('click',async()=>{
  if($('remote-'+action).disabled||pending)return;
  const g=connection.generation;pending=true;controlStatus='working';if(!retries.has(action))retries.set(action,requestId());render();
  try{const result=await connection.control(action,retries.get(action),getLanguage());if(g!==connection.generation)return;retries.delete(action);controlStatus=result.ok?'done':'failed';}
  catch(e){if(g===connection.generation)controlStatus=e.code==='upgrade'?'upgrade':'uncertain';}
  finally{if(g===connection.generation)pending=false;render();}
 });
 async function pressTv(input){
  if(pending||blocked()||connection.state!=='ready'||!connection.tvInputSupported)return;
  const g=connection.generation, retryKey='tv:'+input;
  const checkOnly=retries.has(retryKey);
  if(!checkOnly)retries.set(retryKey,requestId());
  if(input==='VIDEO')menuOpen=true;
  pending=true;controlStatus='working';render();
  try{
   const status=await connection.setTvInput(retries.get(retryKey),checkOnly,input);
   if(g!==connection.generation)return;
   retries.delete(retryKey);
   controlStatus=status==='sent'&&connection.tvMenuSupported?'tvKeySent':({confirmed:'tvConfirmed',sent:'tvSent',rejected:'failed'}[status]||'tvUnknown');
  }catch(e){if(g===connection.generation){
   if(e.code==='busy' || (checkOnly && e.code==='timeout'))retries.delete(retryKey);
   controlStatus=e.code==='busy'?'failed':'tvUnknown';
  }}
  finally{if(g===connection.generation)pending=false;render();}
 }
 $('remote-tv').addEventListener('click',()=>{if(!$('remote-tv').disabled)return pressTv(connection.tvMenuSupported?'VIDEO':'HDMI_INPUT');});
 for(const action of ['LEFT','RIGHT','SELECT']){
  const button=$('tv-'+action.toLowerCase());
  button.addEventListener('click',()=>{if(!button.disabled)return pressTv(action);});
 }
 function show(catalog,keepButtons=false){
  const previous=new Map(keepButtons?rows.map(row=>[row.id,row]):[]);
  readCatalog(catalog);$('favorites-list').replaceChildren();rows=catalog.items.map(video=>{
   const button=doc.createElement('button');button.type='button';button.className='video-result';
   const image=doc.createElement('img');image.src=`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;image.alt='';image.width=320;image.height=180;image.loading='lazy';image.referrerPolicy='no-referrer';image.addEventListener('error',()=>{if(!image.dataset.fallback){image.dataset.fallback='1';image.src='video-placeholder.svg';}});
   const info=doc.createElement('span');info.className='video-info';const title=doc.createElement('strong');title.textContent=video.title;
   const meta=doc.createElement('small'),badge=doc.createElement('span');badge.className='video-action';info.append(title,meta,badge);button.append(image,info);$('favorites-list').append(button);
   const row={...video,count:video.channel,button,meta,badge,state:previous.get(video.id)?.state||'add',request:previous.get(video.id)?.request||requestId()};
   button.addEventListener('click',async()=>{
    if(button.disabled||pending)return;const g=connection.generation;pending=true;row.state='adding';favoriteStatus='';failed=false;render();
    try{const result=await connection.addVideo(row.id,row.request,getLanguage(),row.title);if(!result.ok)throw Error('failed');if(g===connection.generation){row.state='added';favoriteStatus='added';}}
    catch{if(g===connection.generation){row.state='add';favoriteStatus='failed';failed=true;}}
    finally{if(g===connection.generation)pending=false;render();}
   });return row;
  });
 }
 function showSaved(target,query,keepButtons=false){
  const result=cache.page(getLanguage(),query,target);
  show(result.catalog,keepButtons);page=result.page;more=result.more;applied=query;loaded=true;displayedSnapshot=cache.snapshot;
  favoriteStatus=rows.length?'':'empty';failed=false;
 }
 async function load(target,query){
  if(pending||blocked())return;
  query=normalizeTypedQuery(query);
  if(query.length>160){favoriteStatus='long';failed=true;render();return;}
  const sequence=++loadSequence, startingLanguage=getLanguage(), startingRoom=connection.generation;
  if(!cache?.snapshot && cache?.refreshing){
   favoriteStatus='loading';failed=false;render();
   await cache.refreshing;
   if(sequence!==loadSequence||startingLanguage!==getLanguage()||startingRoom!==connection.generation||$('favorites-panel').hidden)return;
  }
  if(cache?.snapshot){showSaved(target,query);render();return;}
  if(connection.state!=='ready'||!connection.favoritesSupported)return;
  const g=connection.generation,lang=getLanguage();pending=true;favoriteStatus='loading';failed=false;render();
  try{const catalog=await connection.favorites(query,target,lang);if(g!==connection.generation||lang!==getLanguage())return;
   if(cache?.snapshot){showSaved(target,query);return;}
   if(catalog.error)throw Error('failed');show(catalog);page=target;more=rows.length===20&&page<99999;applied=query;loaded=true;favoriteStatus=rows.length?'':'empty';
  }catch{if(g===connection.generation&&lang===getLanguage()){
   if(cache?.snapshot)showSaved(target,query);else{favoriteStatus='failed';failed=true;}
  }}
  finally{if(g===connection.generation)pending=false;render();}
 }
 $('favorites-open').addEventListener('click',()=>{
  if($('favorites-open').disabled)return;const panel=$('favorites-panel');panel.hidden=!panel.hidden;render();
  if(!panel.hidden)void load(0,$('favorites-query').value.trim());
 });
 function searchFavorites(){
  if($('favorites-search').disabled)return;
  const field=$('favorites-query');field.value=normalizeTypedQuery(field.value);
  return load(0,field.value);
 }
 $('favorites-search').addEventListener('click',searchFavorites);
 bindTypedSearch({field:$('favorites-query'),submit:searchFavorites,
  canSubmit:()=>!$('favorites-search').disabled&&!$('favorites-panel').hidden,onDraft:()=>{}});
 $('favorites-previous').addEventListener('click',()=>{if(!$('favorites-previous').disabled)void load(page-1,applied);});
 $('favorites-more').addEventListener('click',()=>{if(!$('favorites-more').disabled)void load(page+1,applied);});
 function changeLanguage(){if(language===getLanguage())return;language=getLanguage();rows=[];loaded=false;page=0;applied='';favoriteStatus='';$('favorites-list').replaceChildren();$('favorites-query').value='';render();if(!$('favorites-panel').hidden)void load(0,'');}
 return{render,changeLanguage};
}
