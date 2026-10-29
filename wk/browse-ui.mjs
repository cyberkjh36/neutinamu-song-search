import {BROWSE_TEXT} from './browse-text.mjs?v=3.0';
import {requestId} from './queue-protocol.mjs?v=2.9';
import {readCatalog} from './browse-protocol.mjs?v=3.0';
export function createBrowseUi({connection,getLanguage,blocked,$=id=>document.getElementById(id),doc=document}){
 let rows=[],pending=false,status='',failed=false,generation=connection.generation;
 const list=$('results-list');
 const words=()=>BROWSE_TEXT[getLanguage()];
 function clear(){rows=[];pending=false;status='';failed=false;list.replaceChildren();render();}
 function render(){
  if(generation!==connection.generation){generation=connection.generation;rows=[];pending=false;status='';list.replaceChildren();}
  const w=words();$('results-title').textContent=w.results;$('results-help').textContent=w.hint;
  $('results').hidden=!rows.length&&!status;
  $('results-feedback').textContent=status?w[status]:'';$('results-feedback').classList.toggle('error',failed);
  for(const row of rows){row.button.disabled=pending||blocked()||connection.state!=='ready'||row.state==='added';row.badge.textContent=w[row.state];row.button.setAttribute('aria-label',row.title+' · '+w[row.state]);row.button.classList.toggle('reserved',row.state==='added');}
 }
 function show(catalog){
  readCatalog(catalog);clear();status=catalog.error?'unavailable':catalog.items.length?'':'empty';failed=Boolean(catalog.error);
  rows=catalog.items.map(video=>{
   const button=doc.createElement('button');button.type='button';button.className='video-result';
   const image=doc.createElement('img');image.src=`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;image.alt='';image.width=320;image.height=180;image.loading='lazy';image.referrerPolicy='no-referrer';image.addEventListener('error',()=>{if(!image.dataset.fallback){image.dataset.fallback='1';image.src='video-placeholder.svg';}});
   const info=doc.createElement('span');info.className='video-info';const title=doc.createElement('strong');title.textContent=video.title;
   const meta=doc.createElement('small');meta.textContent=[video.channel,video.duration].filter(Boolean).join(' · ');
   const badge=doc.createElement('span');badge.className='video-action';info.append(title,meta,badge);button.append(image,info);list.append(button);
   const row={...video,button,badge,state:'add',request:requestId()};
   button.addEventListener('click',async()=>{
    if(button.disabled||pending)return;
    const currentGeneration=connection.generation;pending=true;row.state='adding';status='';failed=false;render();
    try{const result=await connection.addVideo(row.id,row.request,getLanguage());if(!result.ok)throw Error('failed');if(currentGeneration===connection.generation){row.state='added';status='added';}}
    catch{if(currentGeneration===connection.generation){row.state='add';status='failed';failed=true;}}
    finally{if(currentGeneration===connection.generation)pending=false;render();}
   });return row;
  });render();
 }
 return{render,show,clear};
}
