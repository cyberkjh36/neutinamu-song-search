// The QR remote runs in a browser on both platforms. Start recognition inside
// the original tap, and use its own audio events without opening a second mic.
let currentVoice = null;
const voiceStates = {
  starting: '마이크를 여는 중… 권한 요청이 뜨면 허용해 주세요.',
  listening: '노래 제목이나 가수 이름을 말씀해 주세요.',
  hearing: '듣고 있어요…',
  processing: '말씀하신 내용을 확인하고 있어요…'
};
const voiceErrors = {
  'not-allowed': '이 사이트의 마이크·음성 인식 권한을 허용한 뒤 다시 눌러 주세요.',
  'service-not-allowed': '브라우저에서 음성 인식을 허용해 주세요. 키보드의 마이크로도 입력할 수 있어요.',
  'audio-capture': '마이크를 열 수 없어요. 다른 앱의 마이크 사용을 마치고 다시 눌러 주세요.',
  'no-speech': '인식하지 못했습니다. 다시 말씀해 주세요.',
  network: '음성 인식 서비스에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.',
  timeout: '음성 인식이 응답하지 않아요. 권한을 확인하고 다시 눌러 주세요.',
  unsupported: '이 브라우저에서는 음성 인식을 사용할 수 없어요. 글자로 검색을 누르고 키보드의 마이크로 입력해 주세요.'
};

function setVoiceState(phase, error) {
  const dialog = $('voiceDialog');
  const failed = phase === 'error';
  dialog.dataset.phase = phase;
  $('voiceDialogStatus').textContent = failed ? error : voiceStates[phase];
  $('voiceRetryBtn').hidden = !failed || !(window.SpeechRecognition || window.webkitSpeechRecognition);
  $('voiceTypeBtn').hidden = !failed;
}

function releaseVoice() {
  const session = currentVoice;
  currentVoice = null;
  if (!session) return;
  clearTimeout(session.timer);
  const rec = session.rec;
  if (rec) {
    rec.onstart = rec.onaudiostart = rec.onsoundstart = rec.onsoundend = null;
    rec.onspeechstart = rec.onspeechend = rec.onaudioend = rec.onresult = rec.onnomatch = rec.onerror = rec.onend = null;
    try { rec.abort(); } catch {}
  }
  resetVoiceButton();
}

function closeVoiceDialog() {
  releaseVoice();
  const dialog = $('voiceDialog');
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  dialog.removeAttribute('open');
  dialog.classList.remove('fallback-open');
}

function startVoice() {
  if (currentVoice) return;
  const revision = ++searchRevision;
  const dialog = $('voiceDialog');
  const preview = $('voicePreview');
  preview.hidden = true;
  preview.textContent = '';
  setVoiceState('starting');
  if (!dialog.open) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.setAttribute('open', ''); dialog.classList.add('fallback-open'); }
  }
  $('voiceCancelBtn').focus();
  $('voiceBtn').disabled = true;
  const session = currentVoice = { rec:null, timer:null };
  let heard = [], audioEnded = false;
  const active = () => currentVoice === session;
  function fail(code) {
    if (!active()) return;
    releaseVoice();
    const message = voiceErrors[code] || '음성을 인식하지 못했어요. 다시 시도를 누르거나 글자로 검색해 주세요.';
    setVoiceState('error', message);
  }
  function arm(ms, onTimeout) {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => { if (active()) onTimeout(); }, ms);
  }
  function searchHeard() {
    if (!active()) return;
    if (!heard.length) { fail('no-speech'); return; }
    closeVoiceDialog();
    if (revision === searchRevision) {
      setMessage('말씀하신 노래를 찾고 있어요…');
      useSpeechAlternatives(heard, revision);
    }
  }
  function listening() {
    if (!active() || audioEnded) return;
    if (dialog.dataset.phase === 'starting') {
      setVoiceState('listening');
      arm(30000, searchHeard);
    }
  }
  function hearing() {
    if (!active() || audioEnded) return;
    listening();
    if (dialog.dataset.phase !== 'hearing') setVoiceState('hearing');
  }
  function quiet() {
    if (active() && !audioEnded && dialog.dataset.phase === 'hearing') setVoiceState('listening');
  }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { fail('unsupported'); return; }
  try {
    const rec = session.rec = new Recognition();
    rec.lang = 'ko-KR';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.onstart = rec.onaudiostart = listening;
    rec.onsoundstart = rec.onspeechstart = hearing;
    rec.onsoundend = rec.onspeechend = quiet;
    rec.onaudioend = () => {
      if (!active()) return;
      audioEnded = true;
      setVoiceState('processing');
      arm(6000, searchHeard);
    };
    rec.onresult = event => {
      if (!active()) return;
      const chunks = Array.from(event.results).filter(row => row[0]?.transcript?.trim());
      if (!chunks.length) { heard = []; preview.hidden = true; preview.textContent = ''; return; }
      const prefix = chunks.slice(0, -1).map(row => row[0].transcript.trim());
      heard = Array.from(chunks[chunks.length - 1])
        .map(alt => [...prefix, alt.transcript.trim()].join(' ').trim()).filter(Boolean);
      if (chunks.every(row => row.isFinal)) { searchHeard(); return; }
      hearing();
      preview.textContent = heard[0] || '';
      preview.hidden = !preview.textContent;
    };
    rec.onnomatch = () => fail('no-speech');
    rec.onerror = event => fail(event.error);
    rec.onend = searchHeard;
    arm(15000, () => fail('timeout'));
    rec.start();
  } catch (error) {
    fail(['NotAllowedError','SecurityError'].includes(error.name) ? 'not-allowed' : 'audio-capture');
  }
}
$('voiceCancelBtn').onclick = closeVoiceDialog;
$('voiceRetryBtn').onclick = startVoice;
$('voiceTypeBtn').onclick = () => { closeVoiceDialog(); $('query').focus(); };
$('voiceDialog').addEventListener('cancel', event => { event.preventDefault(); closeVoiceDialog(); });
// Android can briefly hide this page while the system recognition or permission UI is open.
// Let the recognizer, timeout, or an actual navigation finish the session.
window.addEventListener('pagehide', closeVoiceDialog);
