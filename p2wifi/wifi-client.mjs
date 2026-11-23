export const ENDPOINT='https://world-karaoke-connect.almondjoy11.chatgpt.site/api/p2wifi';
export const token=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('');
export const ERRORS={unknown_label:'등록된 방 QR을 다시 찍어 주세요.',bad_ticket:'이 방의 QR을 다시 찍어 주세요.',room_conflict:'같은 방에 두 PC가 연결되어 있습니다. 직원에게 알려 주세요.',venue_wifi:'매장 와이파이에 연결하면 자동으로 연결됩니다.',room_setup:'방 PC에서 ‘느티나무 노래방 리모컨’을 열면 연결됩니다.',room_offline:'방 PC와 반주기의 연결을 기다리고 있습니다.',room_wait:'매장 와이파이와 방 PC의 P2 연결을 확인해 주세요.',pairing:'PC에 표시된 P2 전용 연결번호 8자리를 확인해 주세요.',offline:'P2 연결 PC가 꺼져 있거나 인터넷 연결이 끊겼습니다.',full:'휴대폰 5대가 연결되어 있습니다. 사용하지 않는 휴대폰을 연결 해제해 주세요.',not_ready:'PC에서 P2 반주기 연결을 먼저 완료해 주세요.',disconnected:'연결 상태가 바뀌었습니다. 다시 연결해 주세요.',busy:'이전 요청을 처리하고 있습니다. 잠시 후 다시 눌러 주세요.',permission:'이 방의 연결 정보를 확인하지 못했습니다.',invalid:'곡번호 또는 예약 순서를 다시 확인해 주세요.',slow:'연결 요청이 많습니다. 잠시 후 다시 시도해 주세요.'};
const queueActions=new Set(['queue','reserve','queueMove','queueCancel','queuePlay','play','next']);
function validQueue(q){return q?.valid===true && /^[a-f0-9]{64}$/.test(q.version) && Array.isArray(q.songs)
 && q.songs.length<=255 && q.songs.every(n=>Number.isInteger(n)&&n>0&&n<=99999999);}
export class WifiClient {
 constructor({fetcher=(input, options) => globalThis.fetch(input, options),storage=globalThis.localStorage,changed=()=>{},delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){Object.assign(this,{fetcher,storage,changed,delay});this.room='';this.key='';this.data=null;this.busy=false;this.refreshing=false;this.queueEpoch=0;this.playbackEpoch=0;this.revision=0;this.sending=false;}
 async call(op,extra={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);try{const response=await this.fetcher(ENDPOINT,{method:'POST',cache:'no-store',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({op,room:this.room,key:this.key,session:this.data?.session,...extra}),signal:controller.signal});const b=await response.json();if(!response.ok||!b.ok)throw Object.assign(new Error(ERRORS[b.code]||'통신 결과를 확인하지 못했습니다.'),{code:b.code});return b;}finally{clearTimeout(timer);}}
 invalidate() {
  this.revision++;
  if (this.data) this.data = {...this.data, online:false, state:{connected:false}};
  this.changed();
 }
 async resolvePrinted(label,ticket) {
  if (!/^[1235678]$/.test(label)) throw Object.assign(new Error(ERRORS.unknown_label), {code:'unknown_label'});
  const extra = {label, key:token(32)};
  if (ticket !== null) extra.ticket = ticket;
  const found = await this.call('resolvePrintRoom', extra);
  return found.room;
 }
 async joinPrinted(label,ticket) { return this.join(await this.resolvePrinted(label,ticket)); }
 async join(room) {
  if (this.busy) throw new Error(ERRORS.busy);
  if (!/^\d{8}$/.test(room)) throw Object.assign(new Error(ERRORS.pairing), {code:'pairing'});
  this.busy = true;
  const revision = ++this.revision;
  const switching = this.room !== room;
  const departure = switching && this.data ? this.call('leave').catch(()=>{}) : null;
  this.room = room;
  this.data = null;
  if (switching) this.key = '';
  try {
    try { this.key = this.storage.getItem('p2wifi-key-' + room) || this.key; } catch {}
    if (!this.key) this.key = token(32);
    try { this.storage.setItem('p2wifi-key-' + room, this.key); } catch {}
    this.changed();
    if (departure) await departure;
    if (revision !== this.revision) return;
    const next = await this.call('join');
    if (revision !== this.revision) return;
    this.data = next;
    try { this.storage.setItem('p2wifi-last-room', room); } catch {}
    return next;
  } finally { this.busy = false; this.changed(); }
 }
 async refresh() {
  if (!this.data || this.refreshing || (this.busy && !this.sending)) return;
  const revision = this.revision, queueEpoch=this.queueEpoch, playbackEpoch=this.playbackEpoch;
  let finish;
  this.refreshing = new Promise(resolve=>{finish=resolve;});
  try {
    let next;
    try { next = await this.call('status'); }
    catch (error) {
      if (revision !== this.revision || error.code !== 'disconnected') throw error;
      next = await this.call('join');
    }
    if (revision === this.revision) {
      if(queueEpoch!==this.queueEpoch && next.online && next.state?.connected && next.session===this.data?.session){
        next={...next,state:{...next.state,queue:this.data.state.queue}};
      }
      if(playbackEpoch!==this.playbackEpoch && next.online && next.state?.connected && next.session===this.data?.session){
        next={...next,state:{...next.state,playback:this.data.state.playback}};
      }
      this.data = next;
    }
  } catch (error) {
    if (revision === this.revision) this.invalidate();
    throw error;
  } finally { this.refreshing = false; finish(); this.changed(); }
 }
 async leave() {
  if (this.busy) throw new Error(ERRORS.busy);
  this.revision = (this.revision || 0) + 1;
  this.busy = true;
  try {
    if (this.refreshing) await this.refreshing;
    if (this.data) await this.call('leave');
  }
  finally {
    this.data = null; this.room = ''; this.key = ''; this.busy = false;
    try { this.storage.removeItem('p2wifi-last-room'); } catch {}
    this.changed();
  }
 }
 async send(command,onPlaybackStarted) {
  if (this.busy) throw new Error(ERRORS.busy);
  if (!this.data?.online || !this.data.state?.connected) throw new Error(ERRORS.not_ready);
  this.busy = this.sending = true;
  this.changed();
  // Reserve IDs stay recognizable in temporary relay history after the job expires.
  // Version 8 is distinct from the room PC's version-4 playback IDs.
  let id=token(16);
  if(command.action==='reserve')id='faca'+id.slice(4,12)+'8'+id.slice(13);
  const request = {id,room:this.room,key:this.key,session:this.data.session};
  const deadline = Date.now() + 55000;
  try {
   try { await this.call('command',{...request,command}); }
   catch (error) {
    if (['offline','not_ready','disconnected','permission'].includes(error.code) || !error.code) this.invalidate();
    if (error.code) throw error;
    // The PC may already have acted. Only read the original request's result.
   }
   const readQueue=queueActions.has(command.action);
   const resultRequest={...request,...(readQueue?{readQueue:true}:{}),...(command.action==='pause'?{readPlayback:true}:{})};
   let confirmed=null, queueChecks=0;
   let reportedStart = false;
   let fastUntil = Date.now() + 3000;
   let pollDelay = 80;
   while (Date.now() < deadline) {
    await this.delay(pollDelay);
    pollDelay = Math.min(Date.now() < fastUntil ? 280 : 1000, pollDelay * 2);
    if (Date.now() >= deadline) break;
    try {
     const result = await this.call('result',resultRequest);
     if (['pending','claimed'].includes(result.status)) {
      if(!reportedStart && command.action==='next' && result.status==='claimed' && typeof onPlaybackStarted==='function'
          && /^[1-9]\d{0,7}번 재생을 확인했습니다\.$/u.test(result.message) && this.room===request.room && this.data?.session===request.session){
       reportedStart=true;onPlaybackStarted(result.message);
      }
      continue;
     }
     if(result.status==='confirmed' && readQueue){
      const current=this.data;
      if(current?.online && current.state?.connected && this.room===request.room && current.session===request.session
          && result.session===request.session && validQueue(result.queue)){
       this.queueEpoch++;
       this.data={...current,state:{...current.state,queue:result.queue}};
       return {...result,requestId:request.id,queueApplied:true};
      }
      // The PC sends its verified queue directly after the ACK. A short read-only
      // follow-up updates the row with the correct revision even on older room PCs.
      if(result.queueReceipt && ['queue','queueCancel','queueMove'].includes(command.action) && queueChecks++<2){
       confirmed={...result,requestId:request.id};pollDelay=80;continue;
      }
     }
     const p=result.playback;
     if (command.action==='pause' && result.status==='confirmed' && p && typeof p.paused==='boolean'
         && typeof p.known==='boolean' && Number.isInteger(p.number) && p.number>=0 && p.number<=99999999
         && this.data?.online && this.data.state?.connected && this.room===request.room
         && result.session===request.session && this.data.session===request.session) {
      this.playbackEpoch++;
      this.data={...this.data,state:{...this.data.state,playback:p}};
      return {...result,requestId:request.id,playbackApplied:true};
     }
     return {...result,requestId:request.id,playbackApplied:false};
    } catch (error) {
     if(confirmed)return confirmed;
     if (['permission','disconnected','expired'].includes(error.code)) break;
     fastUntil = 0;
     pollDelay = 1000;
    }
   }
   return confirmed || {status:'unknown',message:'결과를 확인하지 못했습니다.'};
  } finally { this.sending = this.busy = false; this.changed(); }
 }
}

// Room PCs already verify the queue version and song number before playing a
// particular reservation. Use that check even if another phone edits the queue.
export async function playSearchResult(client,number){
 if(!Number.isInteger(number)||number<1||number>99999999)throw Error(ERRORS.invalid);
 const revision=client.revision,room=client.room,session=client.data?.session;
 const ensureSameRoom=()=>{
  if(!session||client.room!==room||client.revision!==revision||client.data?.session!==session||!client.data?.online)throw Error(ERRORS.disconnected);
 };
 async function snapshot(){
  ensureSameRoom();
  const state=await client.call('status');
  ensureSameRoom();
  if(!state.online||!state.state?.connected||state.session!==session)throw Error(ERRORS.disconnected);
  return state.state;
 }
 async function readQueue(accept){
  for(let i=0;i<7;i++){
   const state=await snapshot();
   if(!state.busy&&validQueue(state.queue)&&accept(state.queue))return state.queue;
   if(i<6)await client.delay([80,160,320,550,900,1300][i]);
  }
  return null;
 }
 let before=(await snapshot()).queue;
 if(!validQueue(before)){
  const result=await client.send({action:'queue'});if(result.status!=='confirmed')return result;
  before=result.queueApplied?result.queue:await readQueue(()=>true);
  if(!before)throw Error('예약 목록을 확인하지 못했습니다. 다시 실행해 주세요.');
 }
 let index=before.songs.indexOf(number),queue=before;
 if(index<0){
  ensureSameRoom();
  const reserved=await client.send({action:'reserve',number});
  if(reserved.status!=='confirmed')return reserved;
  const expected=before.songs.concat(number);
  const matches=q=>q.songs.length===expected.length&&q.songs.every((n,i)=>n===expected[i]);
  queue=reserved.queueApplied&&matches(reserved.queue)?reserved.queue:await readQueue(matches);
  if(!queue)throw Error('예약은 확인했습니다. 재생 상태와 예약 목록을 확인해 주세요.');
  index=queue.songs.length-1;
 }
 ensureSameRoom();
 return client.send({action:'queuePlay',number,index,version:queue.version});
}

export function rankPersonal(a,b){
 return b.playCount-a.playCount || b.lastPlayed-a.lastPlayed || b.savedAt-a.savedAt || a.number-b.number;
}

export function savePersonalSong(record,number,now){
 if(!record.songs[number])record.songs[number]={number,playCount:0,lastPlayed:0,savedAt:now};
}

export function mergePersonal(record,events=[]){
 const songs={...record?.songs},removed={...record?.removed},recent={...record?.recent};
 let through=record?.through||0;
 if(record?.version!==2){
  // Old rows had only one date, including for a manually saved favorite.
  for(const song of Object.values(songs)){
   songs[song.number]={number:song.number,savedAt:song.lastPlayed,lastPlayed:0,playCount:0};
  }
 }
 const byId=new Map();
 for(const [root,play] of Object.entries(recent)){
  for(const id of play.ids)byId.set(id,root);
 }
 const validId=id=>typeof id==='string' && /^[a-f0-9]{32}$/.test(id);
 for(const event of events){
  if(!event || !validId(event.id) || !Number.isSafeInteger(event.created) || event.created<=through ||
      !Number.isInteger(event.number) || event.number<1 || event.number>99999999)continue;
  const {number,created}=event;
  const ids=new Set([event.id,...(Array.isArray(event.aliases)?event.aliases.filter(validId):[])]);
  if([...ids].some(id=>byId.has(id) && recent[byId.get(id)].number!==number))continue;
  const matches=new Set();
  for(const id of ids){const root=byId.get(id);if(root && recent[root].number===number)matches.add(root);}
  const cutoff=removed[number]||0;
  let first=created,credited=0;
  for(const root of matches){
   const prev=recent[root];
   first=Math.min(first,prev.first);
   if(prev.first>cutoff)credited++;
   for(const id of prev.ids)ids.add(id);
   delete recent[root];
  }
  const root=event.id;
  recent[root]={number,first,ids:[...ids].sort()};
  for(const id of ids)byId.set(id,root);
  const delta=Number(first>cutoff)-credited;
  if(!songs[number] && delta<=0)continue;
  const old=songs[number]||{number,playCount:0,lastPlayed:0,savedAt:created};
  songs[number]={...old,playCount:Math.max(0,old.playCount+delta),
   lastPlayed:first>cutoff?Math.max(old.lastPlayed,created):old.lastPlayed};
 }
 // Keep lifetime totals when retiring deduplication IDs. The watermark stops
 // old, repeated responses from adding another play after their IDs are retired.
 const history=Object.entries(recent);
 if(history.length>10000){
  history.sort((a,b)=>b[1].first-a[1].first);
  through=Math.max(through,history[10000][1].first);
  for(const [id,play] of history)if(play.first<=through)delete recent[id];
 }
 const keep=Object.values(songs).sort(rankPersonal).slice(0,5000);
 return {version:2,songs:Object.fromEntries(keep.map(song=>[song.number,song])),recent,through,
  removed:Object.fromEntries(Object.entries(removed).sort((a,b)=>b[1]-a[1]).slice(0,10000))};
}
