import {REMOTE_TEXT} from './remote-text.mjs?v=3.2';
import {requestId} from './queue-protocol.mjs?v=3.1';
import {readCatalog} from './browse-protocol.mjs?v=3.0';
export function createRemoteUi({connection,getLanguage,blocked,onRender=()=>{},$=id=>document.getElementById(id),doc=document}){
 let generation=connection.generation,language=getLanguage(),pending=false,controlStatus='',favoriteStatus='',failed=false,rows=[],page=0,applied='',loaded=false;
 const retries=new Map(),words=()=>REMOTE_TEXT[getLanguage()],connected=()=>['ready','sending'].includes(connection.state);
 function reset(){generation=connection.generation;pending=false;controlStatus='';favoriteStatus='';failed=false;rows=[];page=0;applied='';loaded=false;retries.clear();$('favorites-list').replaceChildren();$('favorites-query').value='';$('favorites-panel').hidden=true;}
 function render(){
  if(generation!==connection.generation)reset();
  const w=words(),off=pending||blocked()||connection.state!=='ready';
  $('remote-title').textContent=w.title;$('remote-help').textContent=w.help;
  for(const action of ['play','pause','next']){$('remote-'+action+'-label').textContent=w[action];$('remote-'+action).disabled=off||!connection.controlSupported;}
  $('remote-feedback').textContent=!connected()?w.connect:!connection.controlSupported?w.upgrade:controlStatus?w[controlStatus]:'';
  $('remote-feedback').classList.toggle('error',['failed','uncertain'].includes(controlStatus));
  $('favorites-open').textContent=w.favorites;$('favorites-open').disabled=off||!connection.favoritesSupported;
  $('favorites-open').setAttribute('aria-expanded',String(!$('favorites-panel').hidden));
  $('favorites-hint').textContent=!connected()?w.connect:!connection.favoritesSupported?w.upgrade:w.hint;
  $('favorites-query-label').textContent=w.query;$('favorites-query').placeholder=w.query;$('favorites-query').disabled=off;
  $('favorites-search').textContent=w.search;$('favorites-search').disabled=off;
  $('favorites-previous').textContent=w.previous;$('favorites-previous').disabled=off||!loaded||page===0;
  $('favorites-more').textContent=w.more;$('favorites-more').disabled=off||!loaded||rows.length!==20||page>=99999;
  $('favorites-page').textContent=loaded?w.page+' '+(page+1):'';
  $('favorites-feedback').textContent=favoriteStatus?w[favoriteStatus]:'';$('favorites-feedback').classList.toggle('error',failed);
  for(const row of rows){row.button.disabled=off||row.state==='added';row.badge.textContent=w[row.state];row.button.setAttribute('aria-label',row.title+' · '+w[row.state]);row.meta.textContent=row.count+' '+w.plays;row.button.classList.toggle('reserved',row.state==='added');}
  onRender();
 }
 for(const action of ['play','pause','next'])$('remote-'+action).addEventListener('click',async()=>{
  if($('remote-'+action).disabled||pending)return;
  const g=connection.generation;pending=true;controlStatus='working';if(!retries.has(action))retries.set(action,requestId());render();
  try{const result=await connection.control(action,retries.get(action),getLanguage());if(g!==connection.generation)return;retries.delete(action);controlStatus=result.ok?'done':'failed';}
  catch(e){if(g===connection.generation)controlStatus=e.code==='upgrade'?'upgrade':'uncertain';}
  finally{if(g===connection.generation)pending=false;render();}
 });
 function show(catalog){
  readCatalog(catalog);$('favorites-list').replaceChildren();rows=catalog.items.map(video=>{
   const button=doc.createElement('button');button.type='button';button.className='video-result';
   const image=doc.createElement('img');image.src=`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;image.alt='';image.width=320;image.height=180;image.loading='lazy';image.referrerPolicy='no-referrer';image.addEventListener('error',()=>{if(!image.dataset.fallback){image.dataset.fallback='1';image.src='video-placeholder.svg';}});
   const info=doc.createElement('span');info.className='video-info';const title=doc.createElement('strong');title.textContent=video.title;
   const meta=doc.createElement('small'),badge=doc.createElement('span');badge.className='video-action';info.append(title,meta,badge);button.append(image,info);$('favorites-list').append(button);
   const row={...video,count:video.channel,button,meta,badge,state:'add',request:requestId()};
   button.addEventListener('click',async()=>{
    if(button.disabled||pending)return;const g=connection.generation;pending=true;row.state='adding';favoriteStatus='';failed=false;render();
    try{const result=await connection.addVideo(row.id,row.request,getLanguage(),row.title);if(!result.ok)throw Error('failed');if(g===connection.generation){row.state='added';favoriteStatus='added';}}
    catch{if(g===connection.generation){row.state='add';favoriteStatus='failed';failed=true;}}
    finally{if(g===connection.generation)pending=false;render();}
   });return row;
  });
 }
 async function load(target,query){
  if(pending||blocked()||connection.state!=='ready'||!connection.favoritesSupported)return;
  if(query.length>160){favoriteStatus='long';failed=true;render();return;}
  const g=connection.generation,lang=getLanguage();pending=true;favoriteStatus='loading';failed=false;render();
  try{const catalog=await connection.favorites(query,target,lang);if(g!==connection.generation||lang!==getLanguage())return;
   if(catalog.error)throw Error('failed');show(catalog);page=target;applied=query;loaded=true;favoriteStatus=rows.length?'':'empty';
  }catch{if(g===connection.generation){favoriteStatus='failed';failed=true;}}
  finally{if(g===connection.generation)pending=false;render();}
 }
 $('favorites-open').addEventListener('click',()=>{
  if($('favorites-open').disabled)return;const panel=$('favorites-panel');panel.hidden=!panel.hidden;render();
  if(!panel.hidden)void load(0,$('favorites-query').value.trim());
 });
 $('favorites-search').addEventListener('click',()=>{if(!$('favorites-search').disabled)void load(0,$('favorites-query').value.trim());});
 $('favorites-query').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&!$('favorites-search').disabled){e.preventDefault();void load(0,$('favorites-query').value.trim());}});
 $('favorites-previous').addEventListener('click',()=>{if(!$('favorites-previous').disabled)void load(page-1,applied);});
 $('favorites-more').addEventListener('click',()=>{if(!$('favorites-more').disabled)void load(page+1,applied);});
 function changeLanguage(){if(language===getLanguage())return;language=getLanguage();rows=[];loaded=false;page=0;applied='';favoriteStatus='';$('favorites-list').replaceChildren();$('favorites-query').value='';render();if(!$('favorites-panel').hidden)void load(0,'');}
 return{render,changeLanguage};
}
