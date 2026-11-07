const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../room-connect.js'),'utf8');
function run(query,ua='Android',hash=''){
 const nodes={};const context={URLSearchParams,location:{search:query,hash},navigator:{userAgent:ua},document:{getElementById(id){return nodes[id]||(nodes[id]={hidden:id==='connectRoom',addEventListener(event,fn){this[event]=fn}})}};
 vm.runInNewContext(code,context);return nodes;
}
test('all seven room QR links target only the installed direct app and correct room',()=>{
 for(const room of ['1','2','3','5','6','7','8']){
  const nodes=run('?room='+room),b=nodes.connectRoom;assert.equal(b.hidden,false);assert.match(b.href,new RegExp('^intent://connect\\?room='+room+'#Intent;'));
  assert.match(b.href,/package=kr\.neutinamu\.p2\.direct;/);assert.match(b.href,/scheme=neutinamu-p2;/);assert.equal(b.textContent,room+'번방 연결하기');
  assert.match(nodes.roomStatus.textContent,/Wi-Fi/);b.click();assert.match(nodes.roomStatus.textContent,/상태를 확인/);assert.doesNotMatch(nodes.roomStatus.textContent,/연결되었습니다/);
 }
});
test('unknown or ambiguous rooms and injected commands never create a launch link',()=>{
 for(const query of ['','?room=4','?room=01','?room=1&room=5','?room=1&song=10909','?room=1%23Intent','?room=<script>']){
  const nodes=run(query);assert.equal(nodes.connectRoom.hidden,true);assert.equal(nodes.connectRoom.href,undefined);
 }
});
test('iPhone and desktop do not advertise unsupported direct connection',()=>{
 for(const ua of ['iPhone','Macintosh','Windows']){const nodes=run('?room=5',ua);assert.equal(nodes.connectRoom.hidden,true);assert.match(nodes.roomStatus.textContent,/안드로이드/);}
});
test('missing-app fallback gives setup guidance without automatic retry',()=>{
 const nodes=run('?room=7','Android','#app-required');assert.match(nodes.roomStatus.textContent,/앱을 열지 못했습니다/);assert.equal(nodes.connectRoom.hidden,false);
});
