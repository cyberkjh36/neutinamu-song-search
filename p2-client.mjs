export const ENDPOINT='https://world-karaoke-connect.almondjoy11.chatgpt.site/api/p2';
const token=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('');
export const ERRORS={pairing:'PC에 나온 P2 연결번호 8자리를 확인해 주세요.',offline:'PC 연결 프로그램이 꺼져 있거나 인터넷 연결이 끊겼습니다.',full:'휴대폰 5대가 연결되어 있습니다. 사용하지 않는 휴대폰을 연결 해제해 주세요.',not_ready:'PC에서 송신 장치를 연결하고 리모컨 신호 시험을 완료해 주세요.',disconnected:'연결 시간이 지났습니다. P2 연결을 다시 눌러 주세요.',busy:'이전 요청을 처리 중입니다. 잠시 기다려 주세요.',slow:'잠시 기다린 뒤 다시 연결해 주세요.',permission:'연결 정보를 확인하지 못했습니다. 다시 연결해 주세요.',invalid:'곡번호 또는 연결 정보를 확인해 주세요.'};
export class P2Client{
 constructor({fetcher=fetch,storage,changed=()=>{},delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){this.fetcher=fetcher;try{this.storage=storage||globalThis.localStorage;}catch{this.storage=null;}this.changed=changed;this.delay=delay;this.room='';this.key='';this.state=null;this.busy=false;}
 async call(op,extra={}){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),7000);
  try{const response=await this.fetcher(ENDPOINT,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,room:this.room,key:this.key,...extra}),signal:abort.signal});const body=await response.json();if(!response.ok||!body.ok)throw Object.assign(new Error(ERRORS[body.code]||'연결을 확인하지 못했습니다.'),{code:body.code});return body;}
  finally{clearTimeout(timer);}
 }
 async join(room){
  if(this.busy)throw new Error('전송 결과 확인 후 연결해 주세요.');
  if(!/^[0-9]{8}$/.test(room))throw new Error(ERRORS.pairing);
  if(this.state)await this.leave();this.room=room;
  try{this.key=this.storage.getItem('p2-phone-'+room)||token(32);this.storage.setItem('p2-phone-'+room,this.key);}catch{this.key=token(32);}
  this.state=await this.call('join');this.changed();return this.state;
 }
 async refresh(){if(!this.state)return;try{this.state=await this.call('status');}catch(e){this.state={...this.state,online:false,capabilities:[]};if(e.code==='disconnected')this.state=null;throw e;}finally{this.changed();}}
 async leave(){if(this.busy)return;try{if(this.state)await this.call('leave');}finally{this.state=null;this.changed();}}
 can(command){const caps=this.state?.capabilities||[];const keys=command.action==='reserve'?[...command.number].map(n=>'digit_'+n).concat('reserve'):[command.key];return !!this.state?.online&&!this.busy&&keys.every(k=>caps.includes(k));}
 async send(command){
  if(!this.can(command))throw new Error(this.busy?ERRORS.busy:ERRORS.not_ready);
  this.busy=true;this.changed();const id=token(16);
  try{
   // A timed-out submission is never silently repeated: it may have reached the PC.
   await this.call('command',{id,command});
   for(let i=0;i<15;i++){await this.delay(1000);const result=await this.call('result',{id});if(!['pending','claimed'].includes(result.status))return result.status;}
   return 'unknown';
  }catch(e){if(['offline','not_ready','busy','slow','invalid','permission','disconnected'].includes(e.code))throw e;return 'unknown';}
  finally{this.busy=false;this.changed();}
 }
}
