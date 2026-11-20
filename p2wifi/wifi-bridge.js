(function(){
'use strict';
let pending=[];window.NeutiP2={command(json){pending.push(['command',json]);},saveCsv(name,text){pending.push(['save',name,text]);}};
Promise.all([import('./wifi-client.mjs?v=1.3.0-rooms'),new Promise(resolve=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',()=>setTimeout(resolve,0),{once:true}):setTimeout(resolve,0))]).then(([{WifiClient,mergePersonal}])=>{
 const $=id=>document.getElementById(id), personalKey='p2wifi-personal-v1';let statusText='',lastQueueVersion='';
 let storage;try{storage=localStorage;}catch{storage={getItem(){return null;},setItem(){throw Error('이 브라우저에서는 저장 공간을 사용할 수 없습니다.');},removeItem(){}};}
 function personal(events=[]){try{let old=JSON.parse(storage.getItem(personalKey)||'{}'),next=mergePersonal(old,events);if(JSON.stringify(old)!==JSON.stringify(next))storage.setItem(personalKey,JSON.stringify(next));window.onP2NativePersonalSongs?.({songs:Object.values(next.songs).sort((a,b)=>b.lastPlayed-a.lastPlayed)});}catch{window.onP2NativePersonalSongs?.({error:'내 애창곡 저장 공간을 사용할 수 없습니다. 브라우저의 일반 탭에서 열어 주세요.'});}}
 function paint(){const d=client.data,s=d?.state||{},q=s.queue;window.onP2NativeState?.({connected:!!d?.online&&!!s.connected,busy:client.busy||!!s.busy,reconnecting:false,label:d?.online&&s.connected?'● '+d.name+' 연결됨':'○ P2 연결 전',message:statusText||s.message||'PC에서 P2를 연결한 뒤 연결번호를 입력해 주세요.'});lastQueueVersion=q?.valid?q.version:'';window.onP2NativeQueue?.({songs:q?.songs||[],version:q?.version||'',valid:!!d?.online&&!!q?.valid,message:q?.valid?'P2 예약곡 '+q.songs.length+'곡 · 반주기에서 받은 순서입니다.':'P2 연결 후 목록을 새로고침해 주세요.'});window.onP2NativePlayback?.(s.playback||{number:0,known:false});if(d?.events)personal(d.events);const hint=$('wifiJoinState');if(hint)hint.textContent=statusText||s.message||'연결 전';}
 window.addEventListener('hashchange', () => location.reload());
 const link = new URL(location.href);
 const fragment = new URLSearchParams(link.hash.slice(1));
 const code = fragment.has('room') ? fragment.get('room') : link.searchParams.get('room');
 const label = fragment.get('label') || link.searchParams.get('label') || '';
 const roomLabel = /^[1-9][0-9]?$/.test(label) ? label + '번방' : '';
 const ticket=fragment.get('ticket');
 const printed=code===null && (label!=='' || ticket!==null);
 const staffDisplay=link.searchParams.get('display')==='pc';
 let joiningPrint=false, pausedPrint=false, nextAttempt=0;
 const explicit = code !== null || label !== '';
 if(roomLabel) document.querySelector('.native-connection .connection-caption').textContent = roomLabel;
 const client=new WifiClient({storage,changed:paint});
 async function connectPrint(force=false){
  if(joiningPrint || client.busy || pausedPrint || (!force && (document.hidden || Date.now()<nextAttempt)))return;
  joiningPrint=true;
  if(!statusText){statusText=roomLabel+' 반주기에 연결 중…';paint();}
  try{await client.joinPrinted(label,ticket);statusText='';}
  catch(e){statusText=e.message;nextAttempt=Date.now()+12000;if(['bad_ticket','unknown_label'].includes(e.code)||!/^[1235678]$/.test(label))pausedPrint=true;}
  finally{joiningPrint=false;paint();}
 }
 function showHelp(){if(printed){pausedPrint=false;nextAttempt=0;connectPrint(true);return;}const modal=$('wifiConnection');if(!modal.open){if(typeof modal.showModal==='function')modal.showModal();else modal.setAttribute('open','');}$('wifiRoom').value=client.room||(explicit ? '' : storage.getItem('p2wifi-last-room'))||'';$('wifiRoom').focus();paint();}
 async function command(text){try{
  const c=JSON.parse(text);statusText='';
  if(['connection','find'].includes(c.command)){showHelp();paint();return;}
  if(c.command==='connect'){if(client.data?.online && client.data.state?.connected){pausedPrint=printed;await client.leave();statusText='연결을 해제했습니다.';}else showHelp();paint();return;}
  if(c.command==='status'){paint();return;}
  if(c.command==='personalSongs'){personal();return;}
  if(c.command==='personalRemove'){const record=JSON.parse(storage.getItem(personalKey)||'{}');if(record.songs)delete record.songs[Number(c.number)];storage.setItem(personalKey,JSON.stringify(record));personal();return;}
  if(c.command==='import'){$('wifiImport').click();return;}
  const payload={action:c.command};if(c.number)payload.number=Number(c.number);
  if(['queuePlay','queueCancel','queueMove'].includes(c.command)){payload.index=Number(c.index);payload.version=c.version||lastQueueVersion;if(c.command==='queueMove')payload.to=Number(c.to);}
  const result=await client.send(payload);statusText=result.message||'';
  if(result.status==='unknown')statusText='결과를 확인하지 못했습니다. 중복 실행을 피하려면 P2 화면과 예약 목록을 확인하세요. 자동으로 다시 보내지 않습니다.';
  if(result.status==='expired')statusText='요청 시간이 지나 실행하지 않았습니다. 연결 상태를 확인하세요.';
 }catch(e){statusText=e.message||'요청을 처리하지 못했습니다.';}finally{paint();}}
 function save(name,text){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);window.onP2NativeFile?.('CSV 내보내기를 요청했습니다. 브라우저의 다운로드 또는 공유 메뉴에서 저장하세요.');}
 window.NeutiP2.command=command;window.NeutiP2.saveCsv=save;
 const dialog=document.createElement('dialog');dialog.id='wifiConnection';dialog.innerHTML='<form id="wifiJoin"><h2>내 방 P2 연결</h2><p>PC의 <b>휴대폰 리모컨 QR</b>에 나온 전용 연결번호를 입력하세요.</p><label for="wifiRoom">연결번호 8자리</label><input id="wifiRoom" inputmode="numeric" autocomplete="off" pattern="[0-9]{8}" maxlength="8" required placeholder="00000000"><p id="wifiJoinState" role="status"></p><button id="wifiJoinButton" type="submit">이 방에 연결</button><button id="wifiClose" type="button">닫기</button></form><details><summary>연결 도움말 · 진단</summary><p>① PC에서 ‘반주기 찾기’ → 사용할 P2 선택 → 연결합니다.<br>② 반주기의 연결 승인을 확인합니다.<br>③ PC의 ‘휴대폰 리모컨 QR’을 스캔하거나 위에 8자리를 입력합니다.</p><p>주변 반주기 검색·Wi-Fi Direct 연결·암호 설정은 PC에서 진행합니다. PC의 인터넷 연결도 유지해 주세요. 기존 월드유튜브 연결번호와 구분됩니다.</p><button type="button" id="wifiDiagnostic">진단 내용 복사</button><p id="wifiDiagnosticResult"></p></details>';
 function closeJoin(){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}
 document.body.append(dialog);$('wifiClose').onclick=()=>closeJoin();dialog.onclick=e=>{if(e.target===dialog)closeJoin();};
 $('wifiJoin').onsubmit=async e=>{e.preventDefault();if(client.busy)return;$('wifiJoinButton').disabled=true;statusText='연결 중…';paint();try{await client.join($('wifiRoom').value.trim());statusText='';closeJoin();}catch(error){statusText=error.message;}finally{$('wifiJoinButton').disabled=false;paint();}};
 $('wifiDiagnostic').onclick=async()=>{const d=client.data;const info='느티나무 P2 웹 리모컨 1.3.1\nPC_ONLINE='+!!d?.online+'\nP2_CONNECTED='+!!d?.state?.connected+'\nQUEUE_VALID='+!!d?.state?.queue?.valid+'\nMESSAGE='+(statusText||d?.state?.message||'연결 전');try{await navigator.clipboard.writeText(info);$('wifiDiagnosticResult').textContent='진단 내용을 복사했습니다.';}catch{$('wifiDiagnosticResult').textContent=info;}};
 const input=document.createElement('input');input.type='file';input.accept='.csv,text/csv';input.id='wifiImport';input.hidden=true;input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>20000000)throw Error('20MB 이하의 CSV 파일을 선택해 주세요.');await window.onP2NativeImport?.(await file.text(),'');}catch(e){window.onP2NativeImport?.('',e.message);}finally{input.value='';}};document.body.append(input);
 const extra=document.createElement('div');extra.className='wifi-extra';extra.innerHTML='<h3>재생 · TV 연결</h3><div class="wifi-buttons"><button data-wifi="pause">일시정지 / 계속</button><button data-wifi="video">영상선택</button><button data-wifi="left">◀ 왼쪽</button><button data-wifi="right">오른쪽 ▶</button><button data-wifi="select">선택</button></div><p>TV 전환 버튼은 누른 뒤 TV 화면에서 확인하세요.</p><details><summary>홈 화면에 추가</summary><p>아이폰은 Safari 공유 메뉴, 안드로이드는 브라우저 메뉴에서 ‘홈 화면에 추가’를 선택하세요.</p></details><button id="wifiUpdate">최신 버전 불러오기</button><p class="wifi-version">P2 웹 리모컨 1.3.1 · made by cyberkjh</p>';
 $('nativeTools')?.append(extra);extra.querySelectorAll('[data-wifi]').forEach(b=>{b.onclick=()=>command(JSON.stringify({command:b.dataset.wifi}));});
 if($('nativeFind'))$('nativeFind').textContent='방 연결번호 입력 · PC 연결 안내';
 document.querySelector('.footer').textContent='made by cyberkjh · P2 웹 리모컨 1.3.1\n공식 TJ 앱이 아닙니다. PC의 P2 연결과 인터넷 연결이 필요합니다.';

 $('wifiUpdate').onclick=async()=>{statusText='최신 버전을 확인하고 있습니다…';paint();try{const registration=await navigator.serviceWorker?.getRegistration();await registration?.update();registration?.waiting?.postMessage('SKIP_WAITING');setTimeout(()=>location.reload(),800);}catch{location.reload();}};
 const mine=$('personalHint');if(mine)mine.textContent='이 휴대폰에서 실행하거나 예약한 곡 중 P2의 재생이 확인된 곡을 이 기기에 저장합니다. 제어 요청과 재생 결과는 중계 서버를 거치며 전달을 위해 임시 보관됩니다. 브라우저 사이트 데이터를 지우면 내 애창곡도 지워집니다. 같은 곡을 여러 사람이 동시에 예약해 구분이 어려운 경우 기록을 생략할 수 있습니다.';
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
 const list=$('nativeQueueList');if(list)new MutationObserver(()=>{Array.from(list.children).forEach((row,index)=>{if(row.querySelector('.wifi-order'))return;const q=client.data?.state?.queue;if(!q?.valid||index>=q.songs.length)return;const box=document.createElement('div');box.className='wifi-order';for(const [delta,label] of [[-1,'위로'],[1,'아래로']]){const to=index+delta;if(to<0||to>=q.songs.length)continue;const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label',(index+1)+'번째 예약곡 '+label);button.onclick=()=>command(JSON.stringify({command:'queueMove',number:q.songs[index],index,to,version:q.version}));box.append(button);}row.append(box);});}).observe(list,{childList:true});
 for(const task of pending){if(task[0]==='save')save(task[1],task[2]);else command(task[1]);}pending=[];
 let initial=code;if(!explicit){try{initial=storage.getItem('p2wifi-last-room');}catch{}}
 if(printed){connectPrint(true);}else if(initial&&/^\d{8}$/.test(initial)){client.join(initial).catch(e=>{statusText=e.message;paint();});}else {
   if(code !== null) statusText='QR의 연결번호를 읽을 수 없습니다. 해당 방의 QR을 다시 찍어 주세요.';
   paint();
   if(!initial || explicit) showHelp();
 }
 async function tick(){
  if(printed && !pausedPrint && (!client.data || !client.data.online || !client.data.state?.connected)){
   await connectPrint();return;
  }
  await client.refresh().catch(()=>{});
 }
 setInterval(tick,3000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
}).catch(()=>{const p=document.createElement('p');p.textContent='리모컨을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.';document.body?.prepend(p);});
})();
