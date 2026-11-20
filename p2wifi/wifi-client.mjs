export const ENDPOINT='https://world-karaoke-connect.almondjoy11.chatgpt.site/api/p2wifi';
export const token=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('');
export const ERRORS={unknown_label:'등록된 방 QR을 다시 찍어 주세요.',bad_ticket:'이 방의 QR을 다시 찍어 주세요.',room_conflict:'같은 방에 두 PC가 연결되어 있습니다. 직원에게 알려 주세요.',venue_wifi:'매장 와이파이에 연결하면 자동으로 연결됩니다.',room_setup:'방 PC에서 ‘느티나무 노래방 리모컨’을 열면 연결됩니다.',room_offline:'방 PC와 반주기의 연결을 기다리고 있습니다.',room_wait:'매장 와이파이와 방 PC의 P2 연결을 확인해 주세요.',pairing:'PC에 표시된 P2 전용 연결번호 8자리를 확인해 주세요.',offline:'P2 연결 PC가 꺼져 있거나 인터넷 연결이 끊겼습니다.',full:'휴대폰 5대가 연결되어 있습니다. 사용하지 않는 휴대폰을 연결 해제해 주세요.',not_ready:'PC에서 P2 반주기 연결을 먼저 완료해 주세요.',disconnected:'연결 상태가 바뀌었습니다. 다시 연결해 주세요.',busy:'이전 요청을 처리하고 있습니다. 잠시 후 다시 눌러 주세요.',permission:'이 방의 연결 정보를 확인하지 못했습니다.',invalid:'곡번호 또는 예약 순서를 다시 확인해 주세요.',slow:'연결 요청이 많습니다. 잠시 후 다시 시도해 주세요.'};
export class WifiClient {
 constructor({fetcher=(input, options) => globalThis.fetch(input, options),storage=globalThis.localStorage,changed=()=>{},delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){Object.assign(this,{fetcher,storage,changed,delay});this.room='';this.key='';this.data=null;this.busy=false;this.refreshing=false;this.revision=0;this.sending=false;}
 async call(op,extra={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);try{const response=await this.fetcher(ENDPOINT,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,room:this.room,key:this.key,session:this.data?.session,...extra}),signal:controller.signal});const b=await response.json();if(!response.ok||!b.ok)throw Object.assign(new Error(ERRORS[b.code]||'통신 결과를 확인하지 못했습니다.'),{code:b.code});return b;}finally{clearTimeout(timer);}}
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
  const revision = this.revision;
  let finish;
  this.refreshing = new Promise(resolve=>{finish=resolve;});
  try {
    let next;
    try { next = await this.call('status'); }
    catch (error) {
      if (revision !== this.revision || error.code !== 'disconnected') throw error;
      next = await this.call('join');
    }
    if (revision === this.revision) this.data = next;
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
 async send(command) {
  if (this.busy) throw new Error(ERRORS.busy);
  if (!this.data?.online || !this.data.state?.connected) throw new Error(ERRORS.not_ready);
  this.busy = this.sending = true;
  this.changed();
  const request = {id:token(16),room:this.room,key:this.key,session:this.data.session};
  const deadline = Date.now() + 55000;
  try {
   try { await this.call('command',{...request,command}); }
   catch (error) {
    if (['offline','not_ready','disconnected','permission'].includes(error.code) || !error.code) this.invalidate();
    if (error.code) throw error;
    // The PC may already have acted. Only read the original request's result.
   }
   while (Date.now() < deadline) {
    await this.delay(1000);
    if (Date.now() >= deadline) break;
    try {
     const result = await this.call('result',request);
     if (!['pending','claimed'].includes(result.status)) return result;
    } catch (error) {
     if (['permission','disconnected','expired'].includes(error.code)) break;
    }
   }
   return {status:'unknown',message:'결과를 확인하지 못했습니다.'};
  } finally { this.sending = this.busy = false; this.changed(); }
 }
}
export function mergePersonal(record,events){
 const saved=record&&typeof record==='object'?record:{},songs={...(saved.songs||{})},seen={...(saved.seen||{})};
 for(const e of events||[]){if(!/^[a-f0-9]{32}$/.test(e.id)||!Number.isInteger(e.number)||e.number<1||e.number>99999999||!Number.isSafeInteger(e.created)||seen[e.id])continue;seen[e.id]=e.created;songs[e.number]={number:e.number,lastPlayed:Math.max(songs[e.number]?.lastPlayed||0,e.created)};}
 const keep=Object.values(songs).sort((a,b)=>b.lastPlayed-a.lastPlayed).slice(0,5000);return {songs:Object.fromEntries(keep.map(x=>[x.number,x])),seen:Object.fromEntries(Object.entries(seen).sort((a,b)=>b[1]-a[1]).slice(0,10000))};
}
