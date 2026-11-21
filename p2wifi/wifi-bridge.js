(function(){
'use strict';
let pending=[];window.NeutiP2={command(json){pending.push(['command',json]);},saveCsv(name,text){pending.push(['save',name,text]);}};
Promise.all([import('./wifi-client.mjs?v=1.4.7'),import('./room-connection.mjs?v=1.3.4'),new Promise(resolve=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',()=>setTimeout(resolve,0),{once:true}):setTimeout(resolve,0))]).then(([{WifiClient,mergePersonal,token,playSearchResult},{RoomConnection}])=>{
 const $=id=>document.getElementById(id), personalKey='p2wifi-personal-v1';let statusText='',lastQueueVersion='';
 let storage;try{storage=localStorage;}catch{storage={getItem(){return null;},setItem(){throw Error('이 브라우저에서는 저장 공간을 사용할 수 없습니다.');},removeItem(){}};}
 let exactInProgress=false,checkingPause=false;
 let serverOffset=0, lastEvents=null, activeHistory='', loadingHistory=new Map();
 function personal(events=[],edit){
  try{
   const old=JSON.parse(storage.getItem(personalKey)||'{}');
   const next=mergePersonal(old,events);
   if(edit)edit(next);
   if(JSON.stringify(old)!==JSON.stringify(next))storage.setItem(personalKey,JSON.stringify(next));
   window.onP2NativePersonalSongs?.({songs:Object.values(next.songs).sort((a,b)=>b.lastPlayed-a.lastPlayed)});
   return true;
  }catch{
   window.onP2NativePersonalSongs?.({error:'이 브라우저에 내 애창곡을 저장할 수 없습니다. 일반 탭에서 열어 주세요.'});
   return false;
  }
 }
 function syncHistory(room){
  let key;
  try{
   room=room || client.data && client.room || storage.getItem('p2wifi-last-room');
   key=room===client.room && client.key || storage.getItem('p2wifi-key-'+room);
  }catch{return;}
  if(!/^\d{8}$/.test(room)||!key||loadingHistory.has(room))return;
  loadingHistory.set(room,true);
  return client.call('personalHistory',{room,key}).then(reply=>{
   if(Number.isSafeInteger(reply.serverTime))serverOffset=reply.serverTime-Date.now();
   if(Array.isArray(reply.events)&&reply.events.length)personal(reply.events);
  }).catch(()=>{}).finally(()=>loadingHistory.delete(room));
 }
 async function syncPersonalRooms(){
  const rooms=new Set();
  const current=syncHistory();
  try{
   for(let i=0;i<storage.length;i++){
    const match=/^p2wifi-key-(\d{8})$/.exec(storage.key(i));
    if(match)rooms.add(match[1]);
   }
  }catch{}
  // A room key already stored on this phone can read its history without opening a control session.
  await Promise.all([current,...Array.from(rooms,room=>syncHistory(room))]);
 }
 let closeAfterJoin=false;
 function paint(){
  const d=client.data,s=d?.state||{},ready=connection.ready,waiting=!!connection.target&&!ready;
  const fallback=ready?'곡을 검색한 뒤 예약하거나 재생하세요.':waiting?'같은 방의 PC와 반주기 연결을 확인하고 있습니다.':'PC에서 P2를 연결한 뒤 연결번호를 입력해 주세요.';
  const message=(waiting||!connection.target ? connection.message : '')||statusText||s.message||fallback;
  const title=ready?'● '+d.name+' 연결됨':waiting?(roomLabel?roomLabel+' ':'')+'자동 연결 중…':'○ P2 연결 전';
  window.onP2NativeState?.({connected:ready,busy:exactInProgress||checkingPause||client.busy||!!s.busy,reconnecting:waiting,label:title,message});
  const q=ready?s.queue:null;
  lastQueueVersion=q?.valid?q.version:'';
  window.onP2NativeQueue?.({songs:q?.songs||[],version:q?.version||'',valid:!!q?.valid,message:q?.valid?'P2 예약곡 '+q.songs.length+'곡 · 반주기에서 받은 순서입니다.':'P2 연결 후 목록을 새로고침해 주세요.'});
  window.onP2NativePlayback?.(ready&&s.playback||{number:0,known:false});
  if(d?.events?.length && lastEvents!==d.events){lastEvents=d.events;personal(d.events);}
  const identity=d?.online ? client.room+'/'+d.session : '';
  if(identity!==activeHistory){activeHistory=identity;if(identity)syncHistory();}
  const hint=$('wifiJoinState');if(hint)hint.textContent=message;
  document.querySelectorAll('[data-wifi]').forEach(button=>{button.disabled=!ready||exactInProgress||checkingPause||client.busy||!!s.busy;});
  if(closeAfterJoin&&d?.online){closeAfterJoin=false;closeJoin();}
 }
 window.addEventListener('hashchange', () => location.reload());
 const link = new URL(location.href);
 const fragment = new URLSearchParams(link.hash.slice(1));
 const code = fragment.has('room') ? fragment.get('room') : link.searchParams.get('room');
 const label = fragment.get('label') || link.searchParams.get('label') || '';
 const roomLabel = /^[1-9][0-9]?$/.test(label) ? label + '번방' : '';
 const ticket=fragment.get('ticket');
 const printed=code===null && (label!=='' || ticket!==null);
 const staffDisplay=link.searchParams.get('display')==='pc';
 const explicit = code !== null || label !== '';
 if(roomLabel) document.querySelector('.native-connection .connection-caption').textContent = roomLabel;
 const client=new WifiClient({storage,changed:paint});
 const connection=new RoomConnection(client,paint,()=>!document.hidden && navigator.onLine!==false);
 function showHelp(){
  statusText='';connection.message='';
  if(printed){connection.start({label,ticket});return;}
  const modal=$('wifiConnection');
  if(!modal.open){if(typeof modal.showModal==='function')modal.showModal();else modal.setAttribute('open','');}
  let previous='';try{previous=storage.getItem('p2wifi-last-room')||'';}catch{}
  $('wifiRoom').value=connection.target?.room||client.room||(explicit ? code : previous)||'';
  $('wifiRoom').focus();paint();
 }
 async function command(text){try{
  const c=JSON.parse(text);statusText='';
  if(['connection','find'].includes(c.command)){showHelp();paint();return;}
  if(c.command==='connect'){if(connection.target||connection.ready){
    connection.stop();closeAfterJoin=false;await client.leave().catch(()=>{});statusText='연결을 해제했습니다.';
   }else showHelp();paint();return;}
  if(c.command==='queueView'){connection.wake();return;}
  if(c.command==='status'){paint();return;}
  if(c.command==='personalSongs'){personal();return syncPersonalRooms();}
  if(c.command==='personalAdd'){
   const number=Number(c.number);
   if(!Number.isInteger(number)||number<1||number>99999999)return false;
   return personal([],record=>{
    delete record.removed[number];
    const now=Date.now()+serverOffset,id=token(16);
    Object.assign(record,mergePersonal(record,[{id,number,created:now}]));
   });
  }
  if(c.command==='personalRemove'){
   return personal([],record=>{
    const n=Number(c.number);
    if(record.songs[n]){
     record.removed[n]=Math.max(Date.now()+serverOffset,record.songs[n].lastPlayed);
     delete record.songs[n];
    }
   });
  }
  if(c.command==='import'){$('wifiImport').click();return;}
  if(checkingPause)throw Error('일시정지 상태를 확인하고 있습니다.');
  if(exactInProgress)throw Error('이전 실행 요청을 확인하고 있습니다.');
  if(c.command==='reserve' && client.data?.state?.busy)throw Error('이전 요청을 처리하고 있습니다. 잠시 후 예약을 다시 눌러 주세요.');
  const payload={action:c.command};if(c.number)payload.number=Number(c.number);
  if(['queuePlay','queueCancel','queueMove'].includes(c.command)){payload.index=Number(c.index);payload.version=c.version||lastQueueVersion;if(c.command==='queueMove')payload.to=Number(c.to);}
  let result;
  const exact=c.command==='playExact';
  if(c.command==='next')statusText='첫 번째 예약곡을 확인하고 있습니다…';
  if(c.command==='pause'){checkingPause=true;statusText='반주기의 일시정지 상태를 확인하고 있습니다…';}
  const requestLabels={queue:'예약 목록 확인 중…',queueCancel:'예약 취소 중…',queueMove:'예약 순서 변경 중…',queuePlay:'예약곡 실행 중…',cancel:'정지 요청 중…',video:'영상선택 전송 중…',left:'왼쪽 버튼 전송 중…',right:'오른쪽 버튼 전송 중…',select:'선택 버튼 전송 중…'};
  if(requestLabels[c.command])statusText=requestLabels[c.command];
  if(c.command==='reserve')statusText=payload.number+'번 예약 요청 중…';
  if(exact){exactInProgress=true;statusText=c.number+'번 실행을 준비합니다…';paint();}
  try {
   result=exact ? await playSearchResult(client,payload.number) : await client.send(payload,message=>{statusText=message;paint();});
   if(c.command==='pause'&&result.status==='confirmed'&&!result.playbackApplied){
    // Read the room-wide state after the ACK, even if a previous poll is in flight.
    if(client.refreshing)await client.refreshing;
    await client.refresh().catch(()=>{});
   }
  } finally {if(c.command==='pause')checkingPause=false;if(exact)exactInProgress=false;connection.wake();}
  statusText=result.message||'';
  if(result.status==='unknown')statusText='결과를 확인하지 못했습니다. 중복 실행을 피하려면 P2 화면과 예약 목록을 확인하세요. 자동으로 다시 보내지 않습니다.';
  if(result.status==='expired')statusText='요청 시간이 지나 실행하지 않았습니다. 연결 상태를 확인하세요.';
  if(result.status==='confirmed' && ['play','playExact','next','queuePlay'].includes(c.command)){
   const m=/^([1-9]\d{0,7})번 (?:재생을 확인했습니다\.$|재생 확인 · 남은 예약곡은 원래 순서대로 진행합니다\.$)/u.exec(statusText);
   if(m && result.requestId)personal([{id:result.requestId,number:Number(m[1]),created:Date.now()+serverOffset}]);
   syncHistory();
  }
  return {status:result.status,message:statusText};
 }catch(e){statusText=e.message||'요청을 처리하지 못했습니다.';return {status:'failed',message:statusText};}finally{paint();}}
 function save(name,text){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);window.onP2NativeFile?.('CSV 내보내기를 요청했습니다. 브라우저의 다운로드 또는 공유 메뉴에서 저장하세요.');}
 window.NeutiP2.command=command;window.NeutiP2.saveCsv=save;
 const dialog=document.createElement('dialog');dialog.id='wifiConnection';dialog.innerHTML='<form id="wifiJoin"><h2>내 방 P2 연결</h2><p>PC의 <b>휴대폰 리모컨 QR</b>에 나온 전용 연결번호를 입력하세요.</p><label for="wifiRoom">연결번호 8자리</label><input id="wifiRoom" inputmode="numeric" autocomplete="off" pattern="[0-9]{8}" maxlength="8" required placeholder="00000000"><p id="wifiJoinState" role="status"></p><button id="wifiJoinButton" type="submit">이 방에 연결</button><button id="wifiClose" type="button">닫기</button></form><details><summary>연결 도움말 · 진단</summary><p>① PC에서 ‘반주기 찾기’ → 사용할 P2 선택 → 연결합니다.<br>② 반주기의 연결 승인을 확인합니다.<br>③ PC의 ‘휴대폰 리모컨 QR’을 스캔하거나 위에 8자리를 입력합니다.</p><p>주변 반주기 검색·Wi-Fi Direct 연결·암호 설정은 PC에서 진행합니다. PC의 인터넷 연결도 유지해 주세요. 기존 월드유튜브 연결번호와 구분됩니다.</p><button type="button" id="wifiDiagnostic">진단 내용 복사</button><p id="wifiDiagnosticResult"></p></details>';
 function closeJoin(){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}
 document.body.append(dialog);$('wifiClose').onclick=()=>closeJoin();dialog.onclick=e=>{if(e.target===dialog)closeJoin();};
 $('wifiJoin').onsubmit=e=>{e.preventDefault();if(client.busy)return;const room=$('wifiRoom').value.trim();if(!/^\d{8}$/.test(room))return;statusText='';closeAfterJoin=true;connection.start({room});};
 $('wifiDiagnostic').onclick=async()=>{const d=client.data;const info='느티나무 P2 웹 리모컨 1.4.8\nPC_ONLINE='+!!d?.online+'\nP2_CONNECTED='+!!d?.state?.connected+'\nQUEUE_VALID='+!!d?.state?.queue?.valid+'\nMESSAGE='+($('nativeStatus')?.textContent||statusText||d?.state?.message||'연결 전');try{await navigator.clipboard.writeText(info);$('wifiDiagnosticResult').textContent='진단 내용을 복사했습니다.';}catch{$('wifiDiagnosticResult').textContent=info;}};
 const input=document.createElement('input');input.type='file';input.accept='.csv,text/csv';input.id='wifiImport';input.hidden=true;input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>20000000)throw Error('20MB 이하의 CSV 파일을 선택해 주세요.');await window.onP2NativeImport?.(await file.text(),'');}catch(e){window.onP2NativeImport?.('',e.message);}finally{input.value='';}};document.body.append(input);
 const extra=document.createElement('div');extra.className='wifi-extra';extra.innerHTML='<h3>재생 · TV 연결</h3><div class="wifi-buttons"><button data-wifi="pause">일시정지</button><button data-wifi="video">영상선택</button><button data-wifi="left">◀ 왼쪽</button><button data-wifi="right">오른쪽 ▶</button><button data-wifi="select">선택</button></div><p>TV 전환 버튼은 누른 뒤 TV 화면에서 확인하세요.</p><details><summary>홈 화면에 추가</summary><p>아이폰은 Safari 공유 메뉴, 안드로이드는 브라우저 메뉴에서 ‘홈 화면에 추가’를 선택하세요.</p></details><button id="wifiUpdate">최신 버전 불러오기</button><p class="wifi-version">P2 웹 리모컨 1.4.8 · made by cyberkjh</p>';
 $('nativeTools')?.append(extra);const tvFeedback=document.createElement('p');tvFeedback.setAttribute('role','status');extra.querySelector('.wifi-buttons').after(tvFeedback);
 extra.querySelectorAll('[data-wifi]').forEach(b=>{b.onclick=async()=>{if(b.disabled)return;tvFeedback.textContent=b.textContent+' 요청 중…';const reply=await command(JSON.stringify({command:b.dataset.wifi}));if(reply?.message)tvFeedback.textContent=reply.message;};});
 if($('nativeFind'))$('nativeFind').textContent='방 연결번호 입력 · PC 연결 안내';

 $('wifiUpdate').onclick=async()=>{statusText='최신 버전을 확인하고 있습니다…';paint();try{const registration=await navigator.serviceWorker?.getRegistration();await registration?.update();registration?.waiting?.postMessage('SKIP_WAITING');setTimeout(()=>location.reload(),800);}catch{location.reload();}};
 const mine=$('personalHint');if(mine)mine.textContent='이 휴대폰에서 실행하거나 예약한 뒤 재생이 확인된 곡이 저장됩니다. 실물 리모컨으로 부른 곡은 노래를 검색한 뒤 ‘내 애창곡에 저장’을 누르세요. 목록은 이 브라우저에 보관됩니다.';
 if(staffDisplay && roomLabel){
  const panel=document.createElement('section');panel.className='desk-qr';panel.setAttribute('aria-label','손님용 QR');
  const picture=document.createElement('div');picture.className='desk-qr-picture';
  const info=document.createElement('div'),heading=document.createElement('h2'),help=document.createElement('p');
  heading.textContent=roomLabel+' 손님용 QR';help.textContent='휴대폰 카메라로 찍으면 이 방의 리모컨이 열립니다.';
  info.append(heading,help);panel.append(picture,info);
  const guest=new URL('index.html',location.href);guest.searchParams.set('label',label);
  if(ticket) guest.hash=new URLSearchParams({ticket}).toString();
  else if(code) guest.hash=new URLSearchParams({room:code}).toString();
  const qr=window.qrcode(0,'M');qr.addData(guest.href,'Byte');qr.make();
  picture.innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});
  const header=document.querySelector('header');header.after(panel);
 }
 for(const task of pending){if(task[0]==='save')save(task[1],task[2]);else command(task[1]);}pending=[];
 let initial=code;if(!explicit){try{initial=storage.getItem('p2wifi-last-room');}catch{}}
 if(printed){connection.start({label,ticket});}else if(initial&&/^\d{8}$/.test(initial)){connection.start({room:initial});}else {
   if(!initial || explicit) showHelp();
   if(code !== null) statusText='QR의 연결번호를 읽을 수 없습니다. 해당 방의 QR을 다시 찍어 주세요.';
   paint();
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)connection.suspend();else connection.wake();});
 window.addEventListener('pagehide',()=>connection.suspend());
 window.addEventListener('pageshow',()=>connection.wake());
 window.addEventListener('offline',()=>connection.suspend());
 window.addEventListener('online',()=>connection.wake());
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
}).catch(()=>{const p=document.createElement('p');p.textContent='리모컨을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.';document.body?.prepend(p);});
})();
