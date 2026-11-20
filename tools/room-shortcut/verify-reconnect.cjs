const assert = require('node:assert/strict');

module.exports = async function verifyReconnect(tab,base) {
 const original='10000005', replacement='20000005', ops=[];
 let code=original, pc=false, p2=true, expired=false;
 await tab.route('**/api/p2wifi',async route=>{
  const b=route.request().postDataJSON();
  ops.push(b);
  let json={ok:true,online:pc,name:'테스트 P2',session:'b'.repeat(32),state:{connected:pc&&p2}};
  if(b.op==='resolvePrintRoom')json=pc?{ok:true,room:code}:{ok:false,code:'room_offline'};
  if(b.op==='join'&&!pc)json={ok:false,code:'offline'};
  if(b.op==='status'&&expired){expired=false;json={ok:false,code:'disconnected'};}
  await route.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 const connected=()=>tab.waitForFunction(()=>document.querySelector('#nativeState')?.textContent.includes('테스트 P2 연결됨'));
 const waiting=()=>tab.waitForFunction(()=>document.querySelector('#nativeState')?.textContent.includes('자동 연결 중'));
 await tab.goto(base+'p2wifi/index.html#room='+original);
 await tab.waitForFunction(()=>document.querySelector('#nativeStatus')?.textContent.includes('꺼져'));
 pc=true;
 await connected();
 assert.equal(new Set(ops.filter(b=>b.op==='join').map(b=>b.key)).size,1);
 p2=false;await waiting();
 assert(await tab.locator('#nativeNext').isDisabled());
 p2=true;await connected();
 await tab.goto(base+'p2wifi/index.html?label=5#ticket='+'a'.repeat(64));
 await connected();
 pc=false;await waiting();code=replacement;pc=true;await connected();
 assert(ops.some(b=>b.op==='join'&&b.room===replacement));
 expired=true;
 await tab.evaluate(()=>{
  window.dispatchEvent(new Event('pagehide'));
  if(!document.getElementById('nativeNext').disabled)throw Error('control stayed enabled after pagehide');
  window.dispatchEvent(new Event('pageshow'));
  window.dispatchEvent(new Event('online'));
 });
 await connected();
 assert.equal(ops.filter(b=>b.op==='join'&&b.room===replacement).length,2);
 await tab.locator('#nativeConnect').click();
 await tab.waitForFunction(()=>document.querySelector('#nativeStatus')?.textContent.includes('해제했습니다'));
 const count=ops.length;
 await tab.evaluate(()=>window.dispatchEvent(new Event('online')));
 await tab.waitForTimeout(3250);
 assert.equal(ops.length,count);
 assert(!ops.some(b=>b.op==='command'));
 console.log('verified same-room recovery, P2 outage, expired phone, PC restart and explicit disconnect');
};
