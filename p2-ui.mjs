import {P2Client} from './p2-client.mjs';
if(!window.NeutiP2){
const byId=id=>document.getElementById(id);
const panel=document.createElement('details');panel.className='p2-panel';panel.id='p2Panel';
panel.innerHTML=`<summary>📱 P2 반주기 연결 <span class="p2-pill">예약 · 리모컨</span></summary>
<p>PC의 <b>P2 휴대폰 연결</b> 창에 나온 QR을 찍거나 연결번호 8자리를 입력하세요.</p>
<form id="p2JoinForm" class="p2-line"><label for="p2Room" class="small">P2 연결번호 8자리</label><input id="p2Room" inputmode="numeric" autocomplete="off" pattern="[0-9]{8}" maxlength="8" placeholder="00000000" required><button id="p2Join" type="submit">P2 연결</button><button id="p2Leave" type="button" hidden>연결 해제</button></form>
<p id="p2Status" class="p2-status" role="status">아직 연결하지 않았습니다. 노래 검색은 그대로 사용할 수 있습니다.</p>
<div class="p2-grid" aria-label="P2 리모컨"><button type="button" data-p2-key="start" disabled>▶ 시작</button><button type="button" data-p2-key="pause" disabled>Ⅱ 일시정지</button><button type="button" data-p2-key="cancel" disabled>■ 취소</button><button type="button" data-p2-key="key_down" disabled>♭ 음정 −</button><button type="button" data-p2-key="key_up" disabled>♯ 음정 +</button></div>
<p class="p2-note">송신 장치와 실제 리모컨 신호 학습이 필요합니다. 신호 전송 후 예약·재생 여부는 P2 화면에서 확인하세요. 반주기에서 숫자를 입력 중이라면 먼저 입력칸을 비워 주세요.</p>
<p id="p2ControlResult" class="p2-result" role="status"></p>`;
const searchPanel=byId('query').closest('section');searchPanel.before(panel);
const reserve=document.createElement('button');reserve.type='button';reserve.className='p2-reserve';reserve.id='p2Reserve';reserve.disabled=true;reserve.textContent='＋ 이 곡 P2 예약';
const open=document.createElement('button');open.type='button';open.className='p2-open';open.textContent='P2 연결 / 리모컨 열기';
const result=document.createElement('p');result.id='p2SongResult';result.className='p2-result';result.setAttribute('role','status');
byId('hero').append(reserve,open,result);
let selected=null,connecting=false;
const keys=[...panel.querySelectorAll('[data-p2-key]')];
function paint(){
 byId('p2Join').disabled=connecting||client.busy;byId('p2Room').disabled=connecting||client.busy;
 byId('p2Leave').hidden=!client.state;byId('p2Leave').disabled=client.busy;
 const state=client.state;
 byId('p2Status').textContent=!state?'아직 연결하지 않았습니다. 노래 검색은 그대로 사용할 수 있습니다.':!state.online?'PC 연결이 끊겼습니다. PC 프로그램을 확인해 주세요.':state.capabilities?.includes('reserve')?`연결됨 · ${state.name} · 신호 전송 가능`:`연결됨 · ${state.name} · PC에서 장치 연결과 신호 시험을 완료해 주세요.`;
 reserve.disabled=!selected||!client.can({action:'reserve',number:selected.code});
 reserve.textContent=client.busy?'전송 결과 확인 중…':'＋ 이 곡 P2 예약';
 for(const b of keys)b.disabled=!client.can({action:'key',key:b.dataset.p2Key});
 open.hidden=!!state?.online&&state.capabilities?.includes('reserve');
}
const client=new P2Client({changed:paint});
window.P2Remote={setSong(song){selected=song&&/^[1-9][0-9]{0,4}$/.test(String(song.code))?{code:String(song.code),title:song.title}:null;result.textContent='';paint();}};
open.onclick=()=>{panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'start'});byId('p2Room').focus();};
byId('p2JoinForm').onsubmit=async e=>{e.preventDefault();if(connecting||client.busy)return;connecting=true;paint();byId('p2ControlResult').textContent='연결 중…';try{await client.join(byId('p2Room').value.trim());byId('p2ControlResult').textContent='';}catch(e){byId('p2ControlResult').textContent=e.message;}finally{connecting=false;paint();}};
byId('p2Leave').onclick=async()=>{try{await client.leave();}catch{byId('p2ControlResult').textContent='이 휴대폰의 연결을 해제했습니다.';}};
const resultText={sent:'송신 장치가 응답했습니다. P2 화면에서 예약·재생 여부를 확인하세요.',failed:'신호를 보내지 못했습니다. PC와 P2 화면을 확인하세요.',expired:'요청 시간이 지나 전송하지 않았습니다. 연결 상태를 확인하세요.',unknown:'전송 결과를 확인할 수 없습니다. 중복 예약을 피하려면 P2 화면을 먼저 확인하세요. 자동으로 다시 보내지 않습니다.'};
async function send(command,target,label){target.textContent=label+' · 전송 결과 확인 중…';try{const status=await client.send(command);target.textContent=label+' · '+(resultText[status]||resultText.unknown);}catch(e){target.textContent=e.message;}}
reserve.onclick=()=>{if(!selected||client.busy)return;const song={...selected};send({action:'reserve',number:song.code},result,`${song.title} (${song.code})`);};
for(const b of keys)b.onclick=()=>{if(b.dataset.p2Key==='cancel'&&!confirm('현재 곡을 취소하는 신호를 보낼까요?'))return;send({action:'key',key:b.dataset.p2Key},byId('p2ControlResult'),b.textContent);};
const qr=new URL(location.href).searchParams.get('p2');if(qr&&/^[0-9]{8}$/.test(qr)){byId('p2Room').value=qr;panel.open=true;}
let refreshing=false;async function heartbeat(){if(refreshing||!client.state||client.busy)return;refreshing=true;try{await client.refresh();}catch(e){byId('p2ControlResult').textContent=e.message||'인터넷 연결을 확인해 주세요.';}finally{refreshing=false;}}
setInterval(heartbeat,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)heartbeat();});paint();

}
