import assert from 'node:assert/strict';
import test from 'node:test';
import {KaraokeConnection} from '../wk/relay-client.mjs';
import {WifiClient} from '../p2wifi/wifi-client.mjs';

test('a manager never reaches ready if the World PC at the saved number has changed', async()=>{
  const stages=[], ops=[];
  const fetch=async(_,options)=>{
    ops.push(JSON.parse(options.body).op);
    return Response.json({ok:true,pcName:'SIMULATED-6',server:'SIMULATED-6'});
  };
  const client=new KaraokeConnection(null,state=>stages.push(state),{fetch});
  await assert.rejects(client.connect('00000005','한국어','SIMULATED-5'),{code:'room_mismatch'});
  assert.equal(client.accepted,false);
  assert.equal(stages.includes('ready'),false);
  assert.deepEqual(ops,['join','leave']);
});
test('P2 validates the registered machine before admitting a song command',async()=>{
  const client=new WifiClient({storage:{getItem(){return null;},setItem(){}},expectedName:'TEST-5',
    fetcher:async()=>Response.json({ok:true,online:true,name:'TEST-6',state:{connected:true}})});
  await assert.rejects(client.join('00000005'),{code:'room_conflict'});
  assert.equal(client.data,null);
  await assert.rejects(client.send({action:'play'}));
});
