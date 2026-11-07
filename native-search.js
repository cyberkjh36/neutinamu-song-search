(function(){
  'use strict';
  if(!window.NeutiP2)return;
  var native=window.NeutiP2,selected=null,busy=false,voiceRevision=null;
  var $=id=>document.getElementById(id);
  function send(command,number){native.command(JSON.stringify({command:command,number:number||''}));}
  document.documentElement.classList.add('p2-native');
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelector('h1').textContent='느티나무 노래검색';
    var credit=document.createElement('p');credit.className='hint';credit.textContent='made by cyberkjh';
    credit.style.margin='0 0 12px';document.querySelector('h1').after(credit);
    document.querySelector('.lead').textContent='음성 또는 제목·가수·초성으로 검색하고, 선택한 곡을 P2에서 시작하세요.';
    var panel=document.createElement('section');panel.className='panel native-connection';
    panel.innerHTML='<div id="nativeState" role="status">○ P2 연결 전</div><button id="nativeConnect" type="button">P2 연결 · 설정</button><p id="nativeStatus" class="hint" role="status">검색은 연결 전에도 사용할 수 있습니다.</p>';
    $('query').closest('section').before(panel);
    $('nativeConnect').onclick=()=>send('connection');
    var controls=document.createElement('div');controls.className='native-controls';
    controls.innerHTML='<button id="nativePlay" type="button" disabled>▶ 이 곡 시작</button><button id="nativeCancel" type="button">■ 곡 취소</button><p id="nativeAction" class="hint" role="status"></p>';
    $('hero').append(controls);
    // Cancel remains reachable even after the user starts a new search.
    var stop=document.createElement('button');stop.type='button';stop.id='nativeStop';stop.textContent='■ 현재 곡 취소';panel.append(stop);
    stop.onclick=$('nativeCancel').onclick=()=>send('cancel');
    $('nativePlay').onclick=()=>{if(selected&&!busy){busy=true;$('nativePlay').disabled=true;send('play',selected.code);}};
    var clear=document.createElement('button');clear.id='nativeNew';clear.textContent='새 검색';clear.type='button';
    $('searchBtn').after(clear);clear.onclick=()=>{
      ++searchRevision;voiceRevision=null;resetVoiceButton();$('query').value='';$('results').replaceChildren();$('hero').classList.remove('show');
      window.P2Remote.setSong(null);setMessage('새 노래 제목·가수 또는 초성을 입력해 주세요.');$('query').focus();
    };
    $('fileInput').addEventListener('click',e=>{e.preventDefault();send('import');});
    document.querySelector('.footer').textContent='음성·키보드·초성 검색 + P2 직접연결 · 0.8.2\n음성 인식은 휴대폰의 음성 서비스와 인터넷 연결이 필요할 수 있습니다.\n공식 TJ 앱이 아닙니다. 수록곡은 반주기 업데이트 상태에 따라 다를 수 있습니다.';
    document.querySelector('.footer').style.whiteSpace='pre-line';
    send('status');
  });
  window.P2Remote={setSong(song){selected=song&&/^[1-9][0-9]{0,7}$/.test(String(song.code))?song:null;
    if($('nativePlay'))$('nativePlay').disabled=!selected||busy;
  }};
  window.onP2NativeState=function(state){
    busy=!!state.busy;
    if($('nativeState'))$('nativeState').textContent=state.label;
    if($('nativeStatus'))$('nativeStatus').textContent=state.message;
    if($('nativeAction'))$('nativeAction').textContent=state.message;
    if($('nativePlay'))$('nativePlay').disabled=!selected||busy;
  };
  window.Android={startVoice(){voiceRevision=searchRevision;$('voiceBtn').disabled=true;$('voiceBtn').textContent='마이크를 여는 중…';send('voice');}};
  window.onP2NativeVoice=function(texts,error){
    var revision=voiceRevision;voiceRevision=null;resetVoiceButton();
    if(revision===null||revision!==searchRevision)return;
    if(error){setMessage(error,true);return;}
    useSpeechAlternatives(texts,revision);
  };
  window.onP2NativeImport=async function(text,error){
    if(error){setMessage(error,true);return;}
    try{var n=await importCSVText(text);renderCount(await countSongs());setMessage(n.toLocaleString()+'곡을 불러왔습니다.');}
    catch(e){setMessage('곡 데이터 파일을 읽지 못했습니다. CSV 형식을 확인해 주세요.',true);}
  };
  window.onP2NativeFile=function(message){setMessage(message);};
})();
