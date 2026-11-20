import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { WifiClient } from '../../p2wifi/wifi-client.mjs';

const worker=spawn(process.argv[2],['--pair-worker',String(process.pid)],{stdio:['pipe','pipe','inherit']});
const exited=once(worker,'exit');
let output='';
worker.stdout.on('data',data=>{output+=data.toString();});
const file=path.join(process.env.LOCALAPPDATA,'NeutinamuP2Wifi','connection-'+process.pid+'.json');
async function until(read,label) {
  for(let i=0;i<90;i++){
    if(worker.exitCode!==null) throw Error('Fixture exited before '+label);
    const result=await read();
    if(result) return result;
    await wait(500);
  }
  throw Error('Timeout waiting for '+label);
}
const client=new WifiClient({storage:new class {
  cache=new Map();
  getItem(k){return this.cache.get(k);}
  setItem(k,v){this.cache.set(k,v);}
  removeItem(k){this.cache.delete(k);}
}()});
try {
  const room=await until(async()=>{
    try { const state=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
      return state.online && state.room; } catch { return false; }
  },'background room');
  await client.join(room);
  async function command(input){const r=await client.send(input);assert.equal(r.status,'confirmed',r.message);}
  await command({action:'reserve',number:67890});
  await until(async()=>{await client.refresh();return client.data?.state?.queue?.songs?.[0]===67890;},'reserved song');
  await command({action:'queueCancel',number:67890,index:0,version:client.data.state.queue.version});
  worker.stdin.write('KEY VIDEO\n');
  await until(()=>output.includes('KEY_SENT VIDEO'),'original World Karaoke TV key acknowledgement');
  await command({action:'play',number:34567});
  await client.leave();
  worker.stdin.end('END\n');
  const [code]=await exited;
  assert.equal(code,0);
  console.log('Windows PC handled phone reserve, queue cancellation, World TV and phone play on one registration.');
} finally { if(worker.exitCode===null)worker.kill(); }
