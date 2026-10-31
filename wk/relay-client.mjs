import {playlistCommand,readPlaylist} from './playlist-protocol.mjs?v=3.5';
import {controlCommand,favoritesCommand} from './remote-protocol.mjs?v=3.2';
import { LANGUAGES } from './labels.mjs?v=2.1';
import {browseCommand, readCatalog} from './browse-protocol.mjs?v=3.0';
import { CAPABILITY, queueCommand } from './queue-protocol.mjs?v=3.1';
export const ENDPOINT='https://world-karaoke-connect.almondjoy11.chatgpt.site/api/relay';
const failure=code=>Object.assign(new Error(code),{code});
const random=length=>Array.from(crypto.getRandomValues(new Uint8Array(length)),b=>b.toString(16).padStart(2,'0')).join('');
export class KaraokeConnection {
  constructor(_unused,onChange=()=>{},options={}){this.change=onChange;this.url=options.url||ENDPOINT;this.fetch=(options.fetch||globalThis.fetch).bind(globalThis);this.state='idle';this.generation=0;this.controllers=new Set();this.pingMs=options.pingMs||10000;this.waitMs=options.waitMs||250;this.searchMs=options.searchMs||45000;this.requestMs=options.requestMs||10000;}
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
      const response=await this.fetch(this.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,room:this.room,key:this.key,...data}),credentials:'omit',cache:'no-store',signal:controller.signal});
      let b;try{b=await response.json();}catch{throw failure('response');}if(generation!==this.generation)throw failure('disconnected');
      if(!response.ok||!b.ok)throw failure(b.code||'response');return b;
    }catch(e){throw generation!==this.generation?failure('disconnected'):timedOut?failure('networkTimeout'):typeof e.code==='string'?e:failure('connect');}finally{clearTimeout(timer);this.controllers.delete(controller);}
  }
  async connect(code,name){
    if(!/^\d{8}$/.test(code))throw failure('pairing');
    await this.disconnect();const generation=this.generation;this.key=random(32);this.room=code;this.last=null;this.set('connecting');
    try{const reply=await this.call('join',{name},generation);this.queueSupported=typeof reply.server==='string'&&reply.server.startsWith(CAPABILITY);this.browseSupported=this.queueSupported&&reply.server.startsWith('WKQ1 WKS1 ');this.titleSupported=this.browseSupported&&reply.server.startsWith('WKQ1 WKS1 WKT1 ');this.controlSupported=this.titleSupported&&reply.server.startsWith('WKQ1 WKS1 WKT1 WKC1 ');this.favoritesSupported=this.controlSupported&&reply.server.startsWith('WKQ1 WKS1 WKT1 WKC1 WKV1 ');this.playlistSupported=this.favoritesSupported&&reply.server.startsWith('WKQ1 WKS1 WKT1 WKC1 WKV1 WKL1 ');this.set('ready',this.queueSupported?reply.server.replace(/^WKQ1 (?:WKS1 )?(?:WKT1 )?(?:WKC1 )?(?:WKV1 )?(?:WKL1 )?/,''):reply.server);this.heartbeat(generation);}
    catch(e){if(generation===this.generation)this.set('error',e.code);throw e;}
  }
  heartbeat(generation){
    this.timer=setTimeout(async()=>{
      if(generation!==this.generation)return;
      try{await this.call('ping',{},generation);if(generation===this.generation)this.heartbeat(generation);}
      catch(e){if(generation===this.generation){await this.disconnect();this.set('error',e.code);}}
    },this.pingMs);
  }
  async browse(query,language){
    if(!this.browseSupported)throw failure('upgrade');
    if(!this.browseDraft||this.browseDraft.query!==query||this.browseDraft.language!==language)this.browseDraft={query,language,request:random(16)};
    const result=await this.search(browseCommand(query,this.browseDraft.request,language),language);
    if(!result.ok)throw failure(result.code);const catalog=readCatalog(result.catalog);this.browseDraft=null;return catalog;
  }
  async control(action,request,language){
    if(!this.controlSupported)throw failure('upgrade');
    const text=controlCommand(action,request),generation=this.generation;
    for(let attempt=0;attempt<3;attempt++){
      try{return await this.search(text,language);}
      catch(e){
        if(generation!==this.generation)throw failure('disconnected');
        if(attempt===2||!['connect','networkTimeout','busy','slow'].includes(e.code)||this.state!=='ready')throw e;
        // Keep the exact command nonce and retained relay job on a lost reply.
        // A retry must never become a second Next command. Keep all actions
        // blocked while recovering, and never retry into a different PC room.
        this.set('sending');
        await new Promise(resolve=>setTimeout(resolve,1600*(attempt+1)));
        if(generation!==this.generation||this.state!=='sending')throw failure('disconnected');
        this.set('ready');
      }
    }
  }
  async favorites(query,page,language){
    if(!this.favoritesSupported)throw failure('upgrade');
    const result=await this.search(favoritesCommand(query,page,random(16),language),language);
    if(!result.ok)throw failure(result.code);return readCatalog(result.catalog);
  }
  async playlist(page,language){
    if(!this.playlistSupported)throw failure('upgrade');
    if(this.playlistPending)throw failure('busy');
    const task=this.search(playlistCommand(page,random(16)),language,true);
    this.playlistPending=task;
    try{const result=await task;if(!result.ok)throw failure(result.code);return readPlaylist(result.catalog);}
    finally{if(this.playlistPending===task)this.playlistPending=null;}
  }
  async addVideo(id,request,language,title){
    if(!this.queueSupported)throw failure('upgrade');
    return this.search(queueCommand(id,request,this.titleSupported?title:undefined),language);
  }
  async search(text,language,background=false){
    if(this.state!=='ready')throw failure('disconnected');
    if(typeof text!=='string'||!text.trim()||text.length>300||/[\u0000-\u001f\u007f-\u009f]/.test(text)||!LANGUAGES.some(l=>l.code===language))throw failure('invalid');
    text=text.trim();if(!background&&(!this.last||this.last.text!==text||this.last.language!==language))this.last={id:random(16),text,language};
    const job=background?{id:random(16),text,language}:this.last,generation=this.generation;
    const read=background?{sent:false,deferred:false,wake:null}:null;
    if(read)this.backgroundRead=read;else this.set('sending');
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
      await this.call('search',job,generation);this.nextSend=Date.now()+1550;const started=Date.now(),deadline=started+this.searchMs;
      while(Date.now()<deadline){
        const r=await this.call('result',{id:job.id},generation);
        if(!r.pending){if(!background)this.last=null;return {ok:r.result,code:r.result?undefined:'failed',...(r.catalog?{catalog:r.catalog}:{})};}
        // Interactive results use a shorter interval for the first eight seconds.
        // Background/long-running work keeps the former interval to bound traffic.
        const interactive=!background||this.state==='sending';
        await this.wait(interactive&&Date.now()-started<8000?this.waitMs:Math.max(700,this.waitMs),read);
        if(generation!==this.generation)throw failure('disconnected');
      }
      throw failure('timeout');
    }catch(e){if(!background&&['invalid','slow','busy','timeout'].includes(e.code))this.last=null;throw e;}
    finally{if(read&&this.backgroundRead===read)this.backgroundRead=null;if(!background&&generation===this.generation&&this.state==='sending')this.set('ready');}
  }
  async disconnect(){
    const old=this.key&&this.room?{op:'leave',room:this.room,key:this.key}:null;
    this.generation++;clearTimeout(this.timer);for(const c of this.controllers)c.abort();this.controllers.clear();this.backgroundRead?.wake?.();this.backgroundRead=null;this.key=null;this.room=null;this.last=null;this.queueSupported=false;this.browseSupported=false;this.titleSupported=false;this.controlSupported=false;this.favoritesSupported=false;this.playlistSupported=false;this.playlistPending=null;this.browseDraft=null;this.nextSend=0;this.set('idle');
    if(old)void Promise.resolve().then(()=>this.fetch(this.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(old),credentials:'omit',keepalive:true})).catch(()=>{});
  }
}

