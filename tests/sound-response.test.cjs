const test = require('node:test');
const assert = require('node:assert/strict');

test('an inline room ACK completes the original sound key without a result poll', async () => {
  const {WifiClient} = await import('../p2wifi/wifi-client.mjs');
  const calls = [];
  const client = new WifiClient({storage:{}, delay:async () => assert.fail('unexpected timer')});
  client.room = '00000001';
  client.data = {online:true,session:'a'.repeat(32),state:{connected:true}};
  client.call = async (op, request) => {
    calls.push(op);
    assert.equal(request.soundReceipt,true);
    return {ok:true,id:request.id,session:request.session,soundResult:{status:'sent',message:'전송'}};
  };
  assert.equal((await client.send({action:'micUp'})).status,'sent');
  assert.deepEqual(calls,['command']);
  assert.equal(client.busy,false);
});

test('missing or mismatched sound ACKs read the same job without delay or retransmission', async () => {
  const {WifiClient} = await import('../p2wifi/wifi-client.mjs');
  for(const mode of ['old-server','wrong-session','wrong-id','lost-response']){
    const calls = [];
    const client = new WifiClient({storage:{}, delay:async () => assert.fail('unexpected timer')});
    client.room = '00000001';
    client.data = {online:true,session:'a'.repeat(32),state:{connected:true}};
    client.call = async (op, req) => {
      calls.push({op,id:req.id});
      if(op==='result')return {ok:true,status:'sent',message:'original result'};
      if(mode==='old-server')return {ok:true,id:req.id};
      if(mode==='lost-response')throw new Error('connection closed');
      return {ok:true,id:mode==='wrong-id'?'other':req.id,
        session:mode==='wrong-session'?'other':req.session,soundResult:{status:'failed',message:'other job'}};
    };
    const res=await client.send({action:'musicDown'});
    assert.equal(res.message,'original result');
    assert.deepEqual(calls.map(c=>c.op),['command','result']);
    assert.equal(calls[0].id,calls[1].id);
  }
});
