import { LANGUAGES } from './labels.mjs';
export const ENDPOINT='https://world-karaoke-connect.almondjoy11.chatgpt.site/api/relay';
const failure=code=>Object.assign(new Error(code),{code});
const random=length=>Array.from(crypto.getRandomValues(new Uint8Array(length)),b=>b.toString(16).padStart(2,'0')).join('');
export class KaraokeConnection {
  constructor(_unused,onChange=()=>{},options={}){this.change=onChange;this.url=options.url||ENDPOINT;this.fetch=options.fetch||globalThis.fetch;this.state='idle';this.generation=0;this.controllers=new Set();this.pingMs=options.pingMs||10000;this.waitMs=options.waitMs||700;this.searchMs=options.searchMs||45000;}
  set(state,detail){this.state=state;this.change(state,detail);}
  async call(op,data={},generation=this.generation){
    const controller=new AbortController();this.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await this.fetch(this.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,room:this.room,key:this.key,...data}),credentials:'omit',cache:'no-store',signal:controller.signal});
      const b=await response.json();if(generation!==this.generation)throw failure('disconnected');
      if(!b.ok)throw failure(b.code||'failed');return b;
    }catch(e){throw e.code?e:failure('connect');}finally{clearTimeout(timer);this.controllers.delete(controller);}
  }
  async connect(code,name){
    if(!/^\d{8}$/.test(code))throw failure('pairing');
    await this.disconnect();const generation=this.generation;this.key=random(32);this.room=code;this.last=null;this.set('connecting');
    try{const reply=await this.call('join',{name},generation);this.set('ready',reply.server);this.heartbeat(generation);}
    catch(e){if(generation===this.generation)this.set('error',e.code);throw e;}
  }
  heartbeat(generation){
    this.timer=setTimeout(async()=>{
      if(generation!==this.generation)return;
      try{await this.call('ping',{},generation);if(generation===this.generation)this.heartbeat(generation);}
      catch(e){if(generation===this.generation){await this.disconnect();this.set('error',e.code);}}
    },this.pingMs);
  }
  async search(text,language){
    if(this.state!=='ready')throw failure('disconnected');
    if(typeof text!=='string'||!text.trim()||text.length>300||/[\u0000-\u001f\u007f-\u009f]/.test(text)||!LANGUAGES.some(l=>l.code===language))throw failure('invalid');
    text=text.trim();if(!this.last||this.last.text!==text||this.last.language!==language)this.last={id:random(16),text,language};
    const job=this.last,generation=this.generation,deadline=Date.now()+this.searchMs;this.set('sending');
    try{
      await this.call('search',job,generation);
      while(Date.now()<deadline){
        const r=await this.call('result',{id:job.id},generation);
        if(!r.pending){this.last=null;return {ok:r.result,code:r.result?undefined:'failed'};}
        await new Promise(resolve=>setTimeout(resolve,this.waitMs));
        if(generation!==this.generation)throw failure('disconnected');
      }
      throw failure('timeout');
    }catch(e){if(['invalid','slow','busy','timeout'].includes(e.code))this.last=null;throw e;}
    finally{if(generation===this.generation&&this.state==='sending')this.set('ready');}
  }
  async disconnect(){
    const old=this.key&&this.room?{op:'leave',room:this.room,key:this.key}:null;
    this.generation++;clearTimeout(this.timer);for(const c of this.controllers)c.abort();this.controllers.clear();this.key=null;this.room=null;this.last=null;this.set('idle');
    if(old)void this.fetch(this.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(old),credentials:'omit',keepalive:true}).catch(()=>{});
  }
}
