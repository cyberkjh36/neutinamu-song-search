import {createPlaylistUi} from '../wk/playlist-ui.mjs?v=3.5';import {PLAYLIST_TEXT} from '../wk/playlist-text.mjs?v=3.5';
const requested=new URLSearchParams(location.search).get('lang'),language=PLAYLIST_TEXT[requested]?requested:'ko-KR';document.documentElement.lang=language;
const examples=['사랑은 늘 도망가 · 임영웅','เพลงรัก · เพลงภาษาไทย','Buwan · Juan Karlos','Lemon · 米津玄師','朋友 · 周華健'];
const connection={state:'ready',generation:1,playlistSupported:true,async playlist(page){return{v:1,kind:'queue',page,total:25,items:Array.from({length:Math.min(20,25-page*20)},(_,i)=>({id:String(i+page*20).padStart(11,'0'),title:examples[(i+page*20)%examples.length],position:page*20+i+1,state:page===0&&i===0?'current':'queued'}))};}};
createPlaylistUi({connection,getLanguage:()=>language});document.getElementById('playlist-open').click();
