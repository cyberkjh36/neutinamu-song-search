import {playlistCommand,readPlaylist} from './playlist-protocol.mjs?v=3.5';
import {controlCommand,favoritesCommand} from './remote-protocol.mjs?v=3.22';
import { LANGUAGES } from './labels.mjs?v=2.1';
import {browseCommand, readCatalog} from './browse-protocol.mjs?v=3.0';
import { CAPABILITY, queueCommand } from './queue-protocol.mjs?v=3.1';
export const ENDPOINT='https://world-karaoke-connect.almondjoy11.chatgpt.site/api/relay';
const failure=code=>Object.assign(new Error(code),{code});
const random=length=>Array.from(crypto.getRandomValues(new Uint8Array(length)),b=>b.toString(16).padStart(2,'0')).join('');
const SESSION_KEY='wk-phone-session-v1', SESSION_AGE=12*60*60*1000;
export class KaraokeConnection {
  constructor(_unused,onChange=()=>{},options={}){this.change=onChange;this.url=options.url||ENDPOINT;this.fetch=(options.fetch||globalThis.fetch).bind(globalThis);this.state='idle';this.generation=0;this.controllers=new Set();this.pingMs=options.pingMs||10000;this.waitMs=options.waitMs||250;this.searchMs=options.searchMs||45000;this.requestMs=options.requestMs||10000;this.storage=options.storage;this.isOnline=options.isOnline||(()=>true);this.foreground=0;this.paused=false;this.accepted=false;this.retryCount=0;}
  set(state,detail){this.state=state;this.change(state,detail);}
  async wait(ms,read){
    if(ms<=0)return;
    await new Promise(resolve=>{
      const done=()=>{clearTimeout(timer);if(read?.wake===done)read.wake=null;resolve();};
      const timer=setTimeout(done,ms);if(read)read.wake=done;
    });
  }
  async call(op,data={},generation=this.generation){
    const controller=new AbortController();this.controllers.add(controller);let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},this.requestMs);
    try{
      const response=await this.fetch(this.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({op,room:this.room,key:this.key,...data}),credentials:'omit',cache:'no-store',signal:controller.signal});
      let b;try{b=await response.json();}catch{throw failure('response');}if(generation!==this.generation)throw failure('disconnected');
      if(!response.ok||!b.ok)throw failure(b.code||'response');return b;
    }catch(e){throw generation!==this.generation?failure('disconnected'):timedOut?failure('networkTimeout'):typeof e.code==='string'?e:failure('connect');}finally{clearTimeout(timer);this.controllers.delete(controller);}
  }
  async connect(code,name){
    if(!/^\d{8}$/.test(code))throw failure('pairing');
    await this.disconnect();const generation=this.generation;this.key=random(32);this.room=code;this.name=name;this.last=null;this.set('connecting');
    try{const reply=await this.call('join',{name,fastControls:true},generation);
      this.acceptJoin(reply);this.accepted=true;this.confirmedAt=Date.now();this.remember();this.set(this.paused?'reconnecting':'ready',this.serverName);this.heartbeat(generation);}
    catch(e){if(generation===this.generation)this.set('error',e.code);throw e;}
  }
  acceptJoin(reply){
      // Negotiate the server's admission interval; older relays keep their safe delay.
      const interval=reply.timing?.sendIntervalMs;
      this.quick=reply.timing?.fastControls===1 && interval===130;
      this.sendMs=this.quick?interval:Number.isInteger(interval)&&interval>=300&&interval<=1550?interval:1550;
      this.relayVideoSearch=reply.videoSearch===1;
      this.youtubeVolumeSupported=typeof reply.server==='string' && reply.server.startsWith('WKQ1 WKS1 WKT1 WKC1 WKV1 WKL1 M1 YV1 ');
      this.windowSupported=typeof reply.server==='string' && reply.server.startsWith('WKQ1 WKS1 WKT1 WKC1 WKV1 WKL1 M1 ');
      this.tvMenuSupported=reply.capabilities?.p2TvMenu===1;
      this.tvInputSupported=this.tvMenuSupported||reply.capabilities?.p2HdmiInput===1;
      this.queueSupported=typeof reply.server==='string'&&reply.server.startsWith(CAPABILITY);this.browseSupported=this.queueSupported&&reply.server.startsWith('WKQ1 WKS1 ');this.titleSupported=this.browseSupported&&reply.server.startsWith('WKQ1 WKS1 WKT1 ');this.controlSupported=this.titleSupported&&reply.server.startsWith('WKQ1 WKS1 WKT1 WKC1 ');this.favoritesSupported=this.controlSupported&&reply.server.startsWith('WKQ1 WKS1 WKT1 WKC1 WKV1 ');this.playlistSupported=this.favoritesSupported&&reply.server.startsWith('WKQ1 WKS1 WKT1 WKC1 WKV1 WKL1 ');
      this.serverName=typeof reply.pcName==='string' ? reply.pcName : (this.queueSupported?reply.server.replace(/^WKQ1 (?:WKS1 )?(?:WKT1 )?(?:WKC1 )?(?:WKV1 )?(?:WKL1 )?(?:M1 )?(?:YV1 )?/,''):reply.server);
  }
  remember(){
    if(!this.accepted||!this.key||!this.room)return;
    try{this.storage?.setItem(SESSION_KEY,JSON.stringify({v:1,room:this.room,key:this.key,name:this.name,at:this.confirmedAt}));}catch{}
  }
  forget(){try{this.storage?.removeItem(SESSION_KEY);}catch{}}
  restore(expectedRoom=''){
    if(this.state!=='idle')return false;
    let saved;try{saved=JSON.parse(this.storage?.getItem(SESSION_KEY)||'null');}catch{}
    if(!saved||saved.v!==1||!/^\d{8}$/.test(saved.room)||!/^[a-f0-9]{64}$/.test(saved.key)||typeof saved.name!=='string'||saved.name.length>40||!Number.isFinite(saved.at)||saved.at>Date.now()+60000||Date.now()-saved.at>SESSION_AGE||(expectedRoom&&saved.room!==expectedRoom)){this.forget();return false;}
    this.key=saved.key;this.room=saved.room;this.name=saved.name;this.confirmedAt=saved.at;this.accepted=true;this.needsJoin=true;
    void this.resume();return true;
  }
  suspend(){
    this.paused=true;clearTimeout(this.timer);this.remember();
    if(this.accepted)this.set('reconnecting');
  }
  offline(){
    clearTimeout(this.timer);if(this.accepted)this.set('reconnecting');
  }
  resume(){
    this.paused=false;
    if(!this.accepted||!this.key||!this.room)return Promise.resolve(false);
    if(!this.isOnline()){this.set('reconnecting');return Promise.resolve(false);}
    if(this.recovery)return this.recovery;
    if(['ready','sending'].includes(this.state)&&Date.now()-this.confirmedAt<1000)return Promise.resolve(true);
    const generation=this.generation;clearTimeout(this.timer);this.set('reconnecting');
    const task=(async()=>{
      try{
        if(!this.needsJoin){
          try{const reply=await this.call('ping',{},generation);if(typeof reply.pcName==='string')this.serverName=reply.pcName;this.tvMenuSupported=reply.capabilities?.p2TvMenu===1;this.tvInputSupported=this.tvMenuSupported||reply.capabilities?.p2HdmiInput===1;}
          catch(e){if(e.code!=='disconnected'||generation!==this.generation)throw e;this.needsJoin=true;}
        }
        if(this.needsJoin){const reply=await this.call('join',{name:this.name,fastControls:true},generation);this.acceptJoin(reply);this.needsJoin=false;}
        if(generation!==this.generation)return false;
        this.retryCount=0;this.confirmedAt=Date.now();this.remember();
        this.set(this.paused?'reconnecting':this.foreground?'sending':'ready',this.serverName);this.heartbeat(generation);return true;
      }catch(e){
        if(generation!==this.generation)return false;
        if(['pairing','permission','invalid'].includes(e.code)){await this.disconnect();this.set('error',e.code);return false;}
        this.scheduleRecovery(e.code);return false;
      }finally{if(this.recovery===task)this.recovery=null;}
    })();
    this.recovery=task;return task;
  }
  scheduleRecovery(code){
    if(!this.accepted)return;clearTimeout(this.timer);this.set('reconnecting');
    if(this.paused||!this.isOnline())return;
    // Keep credentials during outages. A full room or rate limit backs off;
    // it must not create a new identity or occupy another phone slot.
    const delay=['full','slow'].includes(code)?60000:Math.min(30000,Math.min(2000,this.pingMs)*2**Math.min(this.retryCount++,5));
    const generation=this.generation;
    this.timer=setTimeout(()=>{if(generation===this.generation)void this.resume();},delay);
  }
  refreshTvStatus(generation=this.generation){
    if(generation!==this.generation || !['ready','sending'].includes(this.state))return Promise.reject(failure('disconnected'));
    if(this.tvStatusRead)return this.tvStatusRead;
    const read=this.call('ping',{},generation).then(reply=>{
      if(generation!==this.generation)throw failure('disconnected');
      const menu=reply.capabilities?.p2TvMenu===1, available=menu||reply.capabilities?.p2HdmiInput===1;
      const nameChanged=typeof reply.pcName==='string' && reply.pcName!==this.serverName;
      if(nameChanged)this.serverName=reply.pcName;
      if(nameChanged||menu!==this.tvMenuSupported||available!==this.tvInputSupported){
        this.tvMenuSupported=menu;this.tvInputSupported=available;this.change(this.state);
      }
      this.confirmedAt=Date.now();this.remember();
      return available;
    }).finally(()=>{if(this.tvStatusRead===read)this.tvStatusRead=null;});
    this.tvStatusRead=read;return read;
  }
  heartbeat(generation,misses=0){
    clearTimeout(this.timer);if(this.paused||!this.accepted)return;
    this.timer=setTimeout(async()=>{
      if(generation!==this.generation)return;
      try{await this.refreshTvStatus(generation);if(generation===this.generation)this.heartbeat(generation);}
      catch(e){
        if(generation!==this.generation)return;
        if(['connect','networkTimeout','response'].includes(e.code)&&misses<2){this.heartbeat(generation,misses+1);return;}
        this.scheduleRecovery(e.code);
      }
    },misses?Math.min(2000,this.pingMs):this.pingMs);
  }
  async browse(query,language){
    if(!this.browseSupported && !(this.queueSupported && this.relayVideoSearch))throw failure('upgrade');
    if(this.state!=='ready')throw failure('disconnected');
    const generation=this.generation;
    if(!this.browseDraft||this.browseDraft.query!==query||this.browseDraft.language!==language)this.browseDraft={query,language,request:random(16)};
    const command=browseCommand(query,this.browseDraft.request,language);
    let primary;
    if(this.browseSupported){
      try{
        const result=await this.search(command,language);
        if(!result.ok)throw failure(result.code);
        primary=readCatalog(result.catalog);
        this.browseDraft=null;
        if(primary.items.length||primary.error==='blocked'||!this.relayVideoSearch)return primary;
      }catch(e){
        if(!this.relayVideoSearch||!['busy','failed','networkTimeout','timeout','response'].includes(e.code))throw e;
      }
    }
    if(generation!==this.generation||this.state!=='ready')throw failure('disconnected');
    this.foreground++;
    this.set('sending');
    try{
      const reply=await this.call('videoCatalog',{query,language},generation);
      const recovered=readCatalog(reply.catalog);
      this.browseDraft=null;
      return recovered.error && primary?.error===null ? primary : recovered;
    }finally{
      if(generation===this.generation){this.foreground--;if(this.state==='sending')this.set('ready');}
    }
  }
  async control(action,request,language){
    if(!this.controlSupported || (action==='window'&&!this.windowSupported) || (['volumeUp','volumeDown'].includes(action)&&!this.youtubeVolumeSupported))throw failure('upgrade');
    if(action==='window'&&!/^[a-f0-9]{32}$/.test(request||''))throw failure('invalid');
    const text=action==='window'?'WKUI1:'+request:controlCommand(action,request),generation=this.generation;
    for(let attempt=0;attempt<3;attempt++){
      try{return await this.search(text,language);}
      catch(e){
        if(generation!==this.generation)throw failure('disconnected');
        if(attempt===2||!['connect','networkTimeout','busy','slow'].includes(e.code)||this.state!=='ready')throw e;
        // Keep the exact command nonce and retained relay job on a lost reply.
        // A retry must never become a second Next command. Keep all actions
        // blocked while recovering, and never retry into a different PC room.
        this.set('sending');
        await this.wait((this.quick && e.code!=='slow' ? (e.code==='busy'?260:400) : 1600)*(attempt+1));
        if(generation!==this.generation||this.state!=='sending')throw failure('disconnected');
        this.set('ready');
      }
    }
  }
  async setTvInput(request,checkOnly=false,input='HDMI_INPUT'){
    if(this.tvMenuSupported ? !['VIDEO','LEFT','RIGHT','SELECT'].includes(input) : input!=='HDMI_INPUT')throw failure('invalid');
    if(!this.tvInputSupported) throw failure('upgrade');
    if(this.state!=='ready') throw failure('busy');
    if(typeof request!=='string'||!/^[a-f0-9]{32}$/.test(request)) throw failure('invalid');
    const generation=this.generation;
    this.foreground++;
    this.set('sending');
    try {
      // The room host must deduplicate (room, phone, request). Only a read-back
      // of the selected P2 input warrants 'confirmed'; a send alone is 'sent'.
      const payload={request,input};
      let reply=await this.call(checkOnly?'tvInputResult':'setTvInput',{...payload,...(this.quick&&!checkOnly?{waitForAck:true}:{})},generation);
      const start=Date.now(),deadline=start+30000;let reads=0;
      for(;;){
        if(reply.request!==request||reply.input!==payload.input)throw failure('response');
        if(['confirmed','sent','rejected'].includes(reply.status))return reply.status;
        if(!['queued','processing'].includes(reply.status)||Date.now()>=deadline)throw failure('timeout');
        await this.wait(this.quick && Date.now()-start<2500 ? Math.min(180,65+45*reads++) : 300);
        if(generation!==this.generation)throw failure('disconnected');
        reply=await this.call('tvInputResult',payload,generation);
      }
    } finally {
      if(generation===this.generation)this.foreground--;
      if(generation===this.generation && this.state==='sending') this.set('ready');
    }
  }
  async favorites(query,page,language){
    if(!this.favoritesSupported)throw failure('upgrade');
    const result=await this.search(favoritesCommand(query,page,random(16),language),language);
    if(!result.ok)throw failure(result.code);return readCatalog(result.catalog);
  }
  async playlist(page,language,manual=false){
    if(!this.playlistSupported)throw failure('upgrade');
    if(this.playlistPending)throw failure('busy');
    const task=this.search(playlistCommand(page,random(16)),language,true,manual);
    this.playlistPending=task;
    try{const result=await task;if(!result.ok)throw failure(result.code);return readPlaylist(result.catalog);}
    finally{if(this.playlistPending===task)this.playlistPending=null;}
  }
  async addVideo(id,request,language,title){
    if(!this.queueSupported)throw failure('upgrade');
    return this.search(queueCommand(id,request,this.titleSupported?title:undefined),language);
  }
  async search(text,language,background=false,manual=false){
    if(this.state!=='ready')throw failure('disconnected');
    if(typeof text!=='string'||!text.trim()||text.length>300||/[\u0000-\u001f\u007f-\u009f]/.test(text)||!LANGUAGES.some(l=>l.code===language))throw failure('invalid');
    text=text.trim();if(!background&&(!this.last||this.last.text!==text||this.last.language!==language))this.last={id:random(16),text,language};
    const job=background?{id:random(16),text,language}:this.last,generation=this.generation;
    const read=background?{sent:false,deferred:false,wake:null}:null;
    if(read)this.backgroundRead=read;else {this.foreground++;this.set('sending');}
    try{
      // Queue polling is read-only and never flashes the search UI or changes its draft.
      // An unsent list refresh yields its slot to a deliberate command. Once sent,
      // keep the relay's one-pending-request rule and wake its result check promptly.
      if(!background&&this.playlistPending){
        const pendingRead=this.backgroundRead;
        if(pendingRead){if(!pendingRead.sent)pendingRead.deferred=true;pendingRead.wake?.();}
        await this.playlistPending.catch(()=>{});
      }
      const delay=Math.max(0,(this.nextSend||0)-Date.now());if(delay)await this.wait(delay,read);
      if(generation!==this.generation)throw failure('disconnected');
      if(read?.deferred)throw failure('deferred');
      if(read)read.sent=true;
      const flags=this.quick?{fastControls:true}:{};
      const sentAt=Date.now();
      const waitForAck=this.quick&&(!background||manual);
      const accepted=await this.call('search',{...job,...flags,...(waitForAck?{waitForAck:true}:{})},generation);
      this.nextSend=(this.quick?sentAt:Date.now())+(this.sendMs||1550);
      const started=Date.now(),deadline=started+this.searchMs;
      let reads=0, inlineAck=accepted.id===job.id && accepted.ack?.pending===false &&
        typeof accepted.ack.result==='boolean' ? accepted.ack : null;
      while(Date.now()<deadline){
        const r=inlineAck || await this.call('result',{id:job.id,...flags},generation);
        inlineAck=null;
        if(!r.pending){if(!background)this.last=null;return {ok:r.result,code:r.result?undefined:'failed',...(r.catalog?{catalog:r.catalog}:{})};}
        // Interactive results use a shorter interval for the first eight seconds.
        // Background/long-running work keeps the former interval to bound traffic.
        const elapsed=Date.now()-started, interactive=!background||manual||this.state==='sending';
        let interval=interactive && elapsed<8000 ? this.waitMs : Math.max(700,this.waitMs);
        if(this.quick && interactive && elapsed<2500)interval=Math.min(interval,65+45*reads++,180);
        await this.wait(interval,read);
        if(generation!==this.generation)throw failure('disconnected');
      }
      throw failure('timeout');
    }catch(e){if(!background&&['invalid','slow','busy','timeout'].includes(e.code))this.last=null;if(generation===this.generation&&e.code==='disconnected')this.scheduleRecovery(e.code);throw e;}
    finally{if(read&&this.backgroundRead===read)this.backgroundRead=null;if(!background&&generation===this.generation){this.foreground--;if(this.state==='sending')this.set('ready');}}
  }
  async disconnect(){
    const old=this.key&&this.room?{op:'leave',room:this.room,key:this.key}:null;
    this.generation++;this.forget();this.accepted=false;this.needsJoin=false;this.recovery=null;this.paused=false;this.foreground=0;this.retryCount=0;this.confirmedAt=0;this.tvStatusRead=null;clearTimeout(this.timer);for(const c of this.controllers)c.abort();this.controllers.clear();this.backgroundRead?.wake?.();this.backgroundRead=null;this.key=null;this.room=null;this.last=null;this.tvInputSupported=false;this.tvMenuSupported=false;this.queueSupported=false;this.browseSupported=false;this.titleSupported=false;this.controlSupported=false;this.windowSupported=false;this.youtubeVolumeSupported=false;this.favoritesSupported=false;this.playlistSupported=false;this.playlistPending=null;this.browseDraft=null;this.relayVideoSearch=false;this.nextSend=0;this.quick=false;this.set('idle');
    if(old)void Promise.resolve().then(()=>this.fetch(this.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(old),credentials:'omit',keepalive:true})).catch(()=>{});
  }
}


