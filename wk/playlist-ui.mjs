import {PLAYLIST_TEXT} from './playlist-text.mjs?v=3.5';
import {readPlaylist} from './playlist-protocol.mjs?v=3.5';
export function createPlaylistUi({connection,getLanguage,blocked=()=>false,$=id=>document.getElementById(id),doc=document,setTimer=setTimeout,clearTimer=clearTimeout,interval=5000}){
 let generation=connection.generation,pending=false,snapshot=null,signature='',rows=[],status='',timer=null,destroyed=false;
 const words=()=>PLAYLIST_TEXT[getLanguage()],connected=()=>['ready','sending'].includes(connection.state),panel=()=>$('playlist-panel');
 function stop(){if(timer!==null)clearTimer(timer);timer=null;}
 function schedule(ms=interval){stop();if(!destroyed&&!panel().hidden&&!doc.hidden&&connected()&&connection.playlistSupported)timer=setTimer(()=>{timer=null;void load(snapshot?.page||0);},ms);}
 function reset(){stop();generation=connection.generation;pending=false;snapshot=null;signature='';rows=[];status='';panel().hidden=true;$('playlist-list').replaceChildren();}
 function render(){
  if(generation!==connection.generation)reset();
  const w=words(),off=!connected()||!connection.playlistSupported;
  $('playlist-open').textContent=w.open;$('playlist-open').disabled=off;$('playlist-open').setAttribute('aria-expanded',String(!panel().hidden));
  $('playlist-help').textContent=off?(!connected()?w.connect:w.upgrade):w.help;
  $('playlist-refresh').textContent=w.refresh;$('playlist-refresh').disabled=off||pending;
  $('playlist-previous').textContent=w.previous;$('playlist-next').textContent=w.next;
  $('playlist-previous').disabled=off||pending||!snapshot||snapshot.page===0;
  $('playlist-next').disabled=off||pending||!snapshot||(snapshot.page+1)*20>=snapshot.total;
  $('playlist-page').textContent=snapshot&&snapshot.total?`${snapshot.page+1} / ${Math.ceil(snapshot.total/20)}`:'';
  $('playlist-count').textContent=snapshot?w.count.replace('{n}',String(snapshot.total)):'';
  $('playlist-feedback').textContent=status?w[status]:snapshot?.total===0?w.empty:'';
  $('playlist-feedback').classList.toggle('error',status==='failed');
  $('playlist-list').classList.toggle('stale',status==='failed');$('playlist-list').setAttribute('aria-busy',String(pending));
  for(const row of rows)row.badge.textContent=w[row.state];
 }
 function show(value){
  const catalog=readPlaylist(value),key=JSON.stringify(catalog);snapshot=catalog;
  if(key===signature)return;signature=key;rows=[];$('playlist-list').replaceChildren();
  for(const video of catalog.items){
   const li=doc.createElement('li');li.className='playlist-row'+(video.state!=='queued'?' is-current':'');
   const number=doc.createElement('span');number.className='playlist-number';number.textContent=String(video.position);
   const image=doc.createElement('img');image.src=`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;image.alt='';image.width=112;image.height=63;image.loading='lazy';image.referrerPolicy='no-referrer';
   image.addEventListener('error',()=>{if(!image.dataset.fallback){image.dataset.fallback='1';image.src='video-placeholder.svg';}});
   const info=doc.createElement('div');info.className='playlist-info';const title=doc.createElement('strong');title.textContent=video.title;const badge=doc.createElement('span');badge.className='playlist-state';
   info.append(badge,title);li.append(number,image,info);$('playlist-list').append(li);rows.push({...video,badge});
  }
 }
 async function load(page){
  if(destroyed||panel().hidden||doc.hidden||pending||!connection.playlistSupported||!connected())return;
  if(blocked()||connection.state!=='ready'){schedule(1000);return;}
  stop();const g=connection.generation;pending=true;status='loading';render();
  try{const catalog=await connection.playlist(page,getLanguage());if(g!==connection.generation||destroyed)return;show(catalog);status='';}
  catch{if(g===connection.generation&&!destroyed)status='failed';}
  finally{if(g===connection.generation&&!destroyed){pending=false;render();schedule();}}
 }
 $('playlist-open').addEventListener('click',()=>{if($('playlist-open').disabled)return;panel().hidden=!panel().hidden;render();if(panel().hidden)stop();else void load(snapshot?.page||0);});
 $('playlist-refresh').addEventListener('click',()=>{if(!$('playlist-refresh').disabled)void load(snapshot?.page||0);});
 $('playlist-previous').addEventListener('click',()=>{if(!$('playlist-previous').disabled)void load(snapshot.page-1);});
 $('playlist-next').addEventListener('click',()=>{if(!$('playlist-next').disabled)void load(snapshot.page+1);});
 const visibility=()=>{if(doc.hidden)stop();else if(!panel().hidden)void load(snapshot?.page||0);};doc.addEventListener('visibilitychange',visibility);
 render();
 return{render,changeLanguage:render,destroy(){destroyed=true;stop();doc.removeEventListener('visibilitychange',visibility);}};
}
