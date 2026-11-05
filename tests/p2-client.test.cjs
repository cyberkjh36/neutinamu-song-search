const {test}=require('node:test');const assert=require('node:assert/strict');
const storage=()=>({getItem(){return null},setItem(){}});
test('phone sends one command, waits for physical bridge acknowledgment and blocks double taps',async()=>{
 const {P2Client}=await import('../p2-client.mjs');let submitted=0,release;const gate=new Promise(r=>release=r);const client=new P2Client({storage:storage(),delay:()=>gate,fetcher:async(url,options)=>{const b=JSON.parse(options.body);if(b.op==='command')submitted++;return new Response(JSON.stringify(b.op==='join'?{ok:true,online:true,capabilities:['digit_1','reserve']}:{ok:true,status:'sent'}));}});
 await client.join('12345678');const result=client.send({action:'reserve',number:'11'});assert.equal(client.busy,true);await assert.rejects(client.send({action:'reserve',number:'11'}));assert.equal(submitted,1);release();assert.equal(await result,'sent');assert.equal(client.busy,false);
});
test('lost submit response is uncertain and never automatically resubmitted',async()=>{
 const {P2Client}=await import('../p2-client.mjs');let attempts=0;const client=new P2Client({storage:storage(),fetcher:async()=>{attempts++;throw new TypeError('network lost')}});client.state={online:true,capabilities:['start']};assert.equal(await client.send({action:'key',key:'start'}),'unknown');assert.equal(attempts,1);
});
test('offline state or unlearned number prevents any command',async()=>{
 const {P2Client}=await import('../p2-client.mjs');let attempts=0;const client=new P2Client({storage:storage(),fetcher:async()=>{attempts++}});client.state={online:false,capabilities:['start']};await assert.rejects(client.send({action:'key',key:'start'}));client.state={online:true,capabilities:['digit_1','reserve']};await assert.rejects(client.send({action:'reserve',number:'12'}));assert.equal(attempts,0);
});
test('accepted job remains pending until terminal result; failed and unknown stay distinct',async()=>{
 const {P2Client}=await import('../p2-client.mjs');for(const terminal of ['failed','expired','unknown']){let reads=0;const client=new P2Client({storage:storage(),delay:async()=>{},fetcher:async(url,options)=>{const b=JSON.parse(options.body);return new Response(JSON.stringify(b.op==='command'?{ok:true}:{ok:true,status:++reads<3?'claimed':terminal}));}});client.state={online:true,capabilities:['start']};assert.equal(await client.send({action:'key',key:'start'}),terminal);assert.equal(reads,3);}
});
