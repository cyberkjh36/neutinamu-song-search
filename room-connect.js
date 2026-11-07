(function(){
 'use strict';
 var allowed=['1','2','3','5','6','7','8'];
 var params=new URLSearchParams(location.search),room=params.get('room');
 var title=document.getElementById('roomTitle'),status=document.getElementById('roomStatus'),button=document.getElementById('connectRoom');
 if(allowed.indexOf(room)<0||params.getAll('room').length!==1||Array.from(params.keys()).some(function(key){return key!=='room'})){
  title.textContent='QR을 다시 확인해 주세요';document.getElementById('roomIntro').textContent='등록된 방번호가 아닙니다.';
  status.textContent='해당 방에 붙어 있는 QR을 다시 스캔하거나 직원에게 문의해 주세요.';return;
 }
 var label=room+'번방';
 document.title=label+' 반주기 연결 · 느티나무';document.getElementById('roomBadge').textContent=label;
 title.textContent=label+' 반주기 연결';document.getElementById('roomIntro').textContent='아래 버튼을 누르면 설치된 앱이 '+label+' 반주기를 찾아 직접 연결을 시작합니다.';
 document.getElementById('connectedLabel').textContent=label+' 연결됨';
 if(!/Android/i.test(navigator.userAgent)){
  status.textContent='이 직접 연결 기능은 현재 안드로이드 앱에서 사용할 수 있습니다. 아이폰 또는 PC에서는 직원에게 문의해 주세요.';return;
 }
 var fallback='https://cyberkjh36.github.io/neutinamu-song-search/p2-room.html?room='+room+'#app-required';
 button.href='intent://connect?room='+room+'#Intent;scheme=neutinamu-p2;package=kr.neutinamu.p2.direct;S.browser_fallback_url='+encodeURIComponent(fallback)+';end';
 button.textContent=label+' 연결하기';button.hidden=false;
 status.textContent=location.hash==='#app-required'?'직접연결 앱을 열지 못했습니다. 앱 0.8 이상이 설치되어 있는지 직원에게 확인해 주세요.':'휴대폰의 Wi-Fi를 켜 주세요. 앱에서 요청하는 권한과 연결 승인이 필요할 수 있습니다.';
 button.addEventListener('click',function(){status.textContent='앱에서 연결 상태를 확인해 주세요. 앱이 열리지 않으면 직원에게 문의해 주세요.';});
 // No timer, redirect, or fetch can claim an app launch or radio connection succeeded.
})();
