import { LANGUAGES } from './labels.mjs?v=2.1';
import { MESSAGES } from './network-text.mjs?v=2.1';
import { KaraokeConnection } from './relay-client.mjs?v=2.9';
import { createQueueUi } from './queue-ui.mjs?v=2.9';
import { needsChrome, readHandoff, chromeLinks } from './chrome-handoff.mjs?v=2.3';
import { CHROME_TEXT } from './chrome-text.mjs?v=2.2';
import { NEXT_SEARCH } from './search-text.mjs?v=2.3';
import { VoiceInput, isAppleMobile, openVoiceDialog, closeVoiceDialog } from './voice-input.mjs?v=2.7';
import { MIC_TEXT } from './mic-text.mjs?v=2.7';
import { PERMISSION_TEXT } from './permission-text.mjs?v=2.8';
import { VOICE_TEXT } from './voice-text.mjs?v=2.4';
import { safariLinks, safariArrival } from './safari-handoff.mjs?v=2.6';
import { SAFARI_TEXT } from './safari-text.mjs?v=2.6';

const $ = id => document.getElementById(id);
const handoff = readHandoff(location.hash), showChromeHandoff = needsChrome(navigator);
let currentLanguage = LANGUAGES[0], voice = null, serverName = '', busy = false, connectionError = null, connectionAttempt = 0;
let feedbackState = { key:'queryHint', error:false };
let searchComplete = false;
let queueUi;
let voiceState = 'idle', voiceError = 'unavailable';
// A successful start in this page is UI history, never a stored permission grant.
let permissionConfirmed = false;
const appleMobile = isAppleMobile(navigator);
let safariCopyState = '', safariPending = false;
function voiceWords() { return VOICE_TEXT[currentLanguage.code]; }
function renderVoice() {
  const words = voiceWords(), mic = MIC_TEXT[currentLanguage.code], permission = PERMISSION_TEXT[currentLanguage.code], failed = voiceState === 'error';
  const permissionFailure = appleMobile && failed && voiceError === 'permission';
  const listening = ['listening','hearing'].includes(voiceState);
  const stateLabel = mic[voiceState] || mic.off;
  for (const id of ['voice','listening']) $(id).setAttribute('data-mic-state', voiceState);
  $('voice-text').textContent = appleMobile && !permissionConfirmed ? permission.action : currentLanguage.text[0].replace('🎙 ', '');
  $('voice-hint').textContent = appleMobile && !permissionConfirmed ? permission.hint : mic.tap;
  $('mic-state').textContent = stateLabel;
  $('dialog-mic-state').textContent = stateLabel;
  $('voice-empty').textContent = mic.empty;
  $('voice-empty').hidden = Boolean($('interim').textContent) || failed || voiceState === 'starting';
  $('keyboard-voice').textContent = $('voice-keyboard').textContent = words.keyboard;
  $('voice-retry').textContent = permissionFailure ? permission.retry : words.retry; $('voice-close').textContent = failed ? words.close : mic.cancel;
  $('stop-label').textContent = mic.stop;
  $('stop-voice').disabled = voiceState === 'processing';
  $('voice-help').hidden = !failed;
  $('voice-help').textContent = (appleMobile ? words.iphoneHelp + '\n' : '') + words.keyboardHelp;
  $('voice-status').textContent = failed ? words[voiceError] + (appleMobile ? '\n' + words.iphoneHelp : '') : voiceState === 'starting' ? words.starting : voiceState === 'processing' ? mic.processingHelp : currentLanguage.text[5];
  $('voice-status').hidden = listening;
  $('listening-title').textContent = failed ? words.failed : voiceState === 'starting' ? mic.starting : voiceState === 'processing' ? mic.processing : currentLanguage.text[5];
  if (permissionFailure) { $('listening-title').textContent = permission.blocked; $('voice-status').textContent = permission.blockedHelp; }
  $('permission-prompt').hidden = !appleMobile || voiceState !== 'starting';
  $('listening').classList.toggle('permission-start', appleMobile && voiceState === 'starting');
  $('listening').classList.toggle('permission-blocked', permissionFailure);
  $('permission-prompt-title').textContent = permission.prompt;
  $('permission-prompt-help').textContent = permission.promptHelp;
  $('permission-guide').hidden = !appleMobile || !['starting','error'].includes(voiceState);
  $('permission-guide-title').textContent = permission.guide;
  for (let i=1;i<=3;i++) $('permission-step-'+i).textContent = permission['step'+i];
  $('permission-missing').textContent = permission.missing;
  $('permission-note').textContent = permission.note;
  $('permission-safari').textContent = permission.safari;
  $('permission-safari').hidden = !appleMobile || !failed;
  $('listening').classList.toggle('voice-error', failed);
  $('voice-retry').hidden = !failed; $('voice-close').hidden = false; $('stop-voice').hidden = failed || voiceState === 'starting';
}
const countryButtons = new Map();
const actionKeys = {queryHint:3, connected:6, disconnected:7, sent:8, sending:9};
function message(key, error = false) {
  if (error) return MESSAGES[currentLanguage.code].errors[key] || MESSAGES[currentLanguage.code].errors.connect;
  if (key === 'connected') return currentLanguage.text[6] + ' · ' + serverName;
  return key in actionKeys ? currentLanguage.text[actionKeys[key]] : MESSAGES[currentLanguage.code][key];
}
function renderFeedback() {
  $('feedback').textContent = message(feedbackState.key, feedbackState.error);
  $('feedback').classList.toggle('error', feedbackState.error);
}
function feedback(key, error = false) { feedbackState = {key,error}; renderFeedback(); }
function showError(error) { feedback(error?.code || error || 'connect', true); }
function renderConnection() {
  const state = connection.state;
  $('connection-state').classList.toggle('error', Boolean(connectionError));
  $('connection-state').textContent = connectionError ? message(connectionError, true) : message(['ready','sending'].includes(state) ? 'connected' : ['choosing','connecting'].includes(state) ? 'connecting' : 'disconnected');
}
function renderChromeHandoff() {
  $('chrome-handoff').hidden = !showChromeHandoff;
  if (!showChromeHandoff) return;
  const words = CHROME_TEXT[currentLanguage.code];
  ['chrome-title','chrome-description','chrome-open','chrome-feedback','chrome-default','chrome-install'].forEach((id,i) => $(id).textContent = words[i]);
  $('chrome-open').href = chromeLinks({room:$('code').value.trim(),language:currentLanguage.code,query:$('query').value}).intent;
  const blocked = ['choosing','connecting','sending'].includes(connection.state) || Boolean(voice?.active);
  $('chrome-open').setAttribute('aria-disabled', String(blocked));
  $('chrome-open').tabIndex = blocked ? -1 : 0;
}
function handoffBlocked() {
  return ['choosing','connecting','sending'].includes(connection.state) || Boolean(voice?.active);
}
function renderSafariHandoff() {
  $('safari-handoff').hidden = !appleMobile;
  if (!appleMobile) return;
  const words = SAFARI_TEXT[currentLanguage.code];
  const labels = { 'safari-title':'title', 'safari-description':'description', 'safari-open-label':'open',
    'safari-continue':'continue', 'safari-help-title':'help', 'safari-copy':'copy', 'safari-manual':'manual' };
  for (const [id,key] of Object.entries(labels)) $(id).textContent = words[key];
  const links = safariLinks({room:$('code').value.trim(),language:currentLanguage.code,query:$('query').value});
  $('safari-open').href = links.safari;
  if ($('safari-url').value !== links.page) safariCopyState = '';
  $('safari-url').value = links.page;
  $('safari-url').setAttribute('aria-label', words.copy);
  const blocked = handoffBlocked();
  $('safari-open').setAttribute('aria-disabled', String(blocked));
  $('safari-open').tabIndex = blocked ? -1 : 0;
  $('safari-copy').disabled = blocked;
  $('safari-continue').disabled = blocked;
  $('safari-copy-feedback').hidden = !safariCopyState;
  $('safari-copy-feedback').textContent = safariCopyState ? words[safariCopyState] : '';
}
function refreshControls() {
  queueUi?.render();
  const state = connection.state;
  const active = ['choosing','connecting','ready','sending'].includes(state);
  busy = state === 'sending';
  $('connect').disabled = !supported || active;
  $('connect').textContent = state === 'connecting' ? message('connecting') : currentLanguage.text[2];
  $('code').disabled = active;
  $('disconnect').hidden = !active;
  $('send').disabled = state !== 'ready' || !supported || Boolean(voice?.active) || !$('query').value.trim();
  $('send').textContent = searchComplete ? NEXT_SEARCH[currentLanguage.code] : currentLanguage.text[1];
  $('query').disabled = busy;
  for (const button of countryButtons.values()) button.disabled = busy || Boolean(voice?.active);
  $('voice').disabled = busy || Boolean(voice?.active) || !secure;
  $('keyboard-voice').disabled = busy;
  renderChromeHandoff();
  renderSafariHandoff();
}
const connection = new KaraokeConnection(undefined, (state, detail) => {
  connectionError = state === 'error' ? detail : null;
  if (state === 'ready' && detail) serverName = detail;
  renderConnection();
  if (state === 'error') showError(detail);
  if (state === 'ready' && detail) feedback('connected');
  if (state === 'idle') feedback('disconnected');
  refreshControls();
});
const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const supported = secure && window.isSecureContext && Boolean(window.fetch && window.crypto?.getRandomValues);
queueUi=createQueueUi({connection,getLanguage:()=>currentLanguage.code,blocked:()=>!supported||Boolean(voice?.active)||connection.state==='sending'});
for (const language of LANGUAGES) {
  const words = MESSAGES[language.code], button = document.createElement('button');
  button.type = 'button'; button.className = 'country'; button.lang = language.code;
  button.setAttribute('aria-pressed', 'false');
  const flag = document.createElement('img');
  flag.src = 'flags/' + words.flag + '.png'; flag.alt = ''; flag.width = 40; flag.height = 28;
  const name = document.createElement('span'); name.textContent = language.name;
  const country = document.createElement('small'); country.textContent = words.country;
  button.append(flag, name, country);
  button.addEventListener('click', () => {
    if (button.disabled) return;
    selectLanguage(language.code);
    $('country-picker').open = false;
    $('country-summary').focus();
    try { localStorage.setItem('wk-bt-language', language.code); } catch {}
  });
  countryButtons.set(language.code, button); $('countries').append(button);
}
function selectLanguage(code) {
  currentLanguage = LANGUAGES.find(x => x.code === code) || LANGUAGES[0];
  document.documentElement.lang = currentLanguage.code;
  const t = currentLanguage.text, words = MESSAGES[currentLanguage.code];
  document.title = 'WORLD KARAOKE · ' + words.title;
  $('title').textContent = words.title;
  const labels = {
    subtitle:'subtitle', 'language-label':'languageLabel', 'language-help':'languageHelp',
    'pair-help':'pairHelp', 'confirm-help':'confirmHelp', disconnect:'disconnect',
    'help-title':'helpTitle', 'shared-help':'sharedHelp',
    'browser-help':'browserHelp', 'network-help':'networkHelp', 'privacy-help':'privacyHelp', 'shortcut-help':'shortcutHelp'
  };
  for (const [id,key] of Object.entries(labels)) $(id).textContent = words[key];
  $('selected-language').textContent = currentLanguage.name;
  $('selected-flag').src = 'flags/' + words.flag + '.png';
  for (const [locale,button] of countryButtons) button.setAttribute('aria-pressed', String(locale === currentLanguage.code));
  $('connection-title').textContent = t[2]; $('connect').textContent = t[2]; $('code-label').textContent = t[4];
  $('search-title').textContent = t[0].replace('🎙 ', ''); $('voice-text').textContent = t[0].replace('🎙 ', '');
  $('query-label').textContent = t[3]; $('query').placeholder = t[3]; $('send').textContent = searchComplete ? NEXT_SEARCH[currentLanguage.code] : t[1]; $('listening-title').textContent = t[5];
  $('help-list').replaceChildren(...words.steps.map(step => { const li=document.createElement('li'); li.textContent=step; return li; }));
  $('compatibility').hidden = supported;
  $('compatibility').textContent = supported ? '' : message(secure ? 'unsupported' : 'insecure', true);
  renderConnection(); renderFeedback(); renderChromeHandoff(); renderSafariHandoff(); renderVoice(); queueUi?.render();
}
let savedLanguage;
try { savedLanguage = localStorage.getItem('wk-bt-language'); } catch {}
const validSaved = LANGUAGES.some(x => x.code === savedLanguage);
const browserLanguage = (navigator.language || '').toLowerCase();
$('code').value = handoff.room; $('query').value = handoff.query;
selectLanguage(handoff.language || (validSaved ? savedLanguage : LANGUAGES.find(x => x.code.toLowerCase().split('-')[0] === browserLanguage.split('-')[0] || x.code === 'fil-PH' && browserLanguage.startsWith('tl'))?.code));
if (handoff.language) { try { localStorage.setItem('wk-bt-language',handoff.language); } catch {} }
$('country-picker').open = !validSaved && !handoff.language;
$('safari-handoff').open = appleMobile && !safariArrival(location.search || '');
$('safari-open').addEventListener('click', event => {
  if (!appleMobile || handoffBlocked()) { event.preventDefault(); return; }
  // A real link follows the user's tap synchronously. No automatic scheme launch,
  // timer, permission bypass, or claim that the external browser actually opened.
  renderSafariHandoff();
  $('safari-help').open = true;
  safariPending = true;
});
$('safari-continue').addEventListener('click', () => {
  if (!appleMobile || handoffBlocked()) return;
  safariPending = false;
  $('safari-handoff').open = false;
  (connection.state === 'ready' ? $('voice') : $('connect')).focus();
});
$('safari-copy').addEventListener('click', async () => {
  if (!appleMobile || handoffBlocked()) return;
  renderSafariHandoff();
  const input = $('safari-url'), url = input.value;
  let copied = false;
  try {
    if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {
    // Legacy iOS and QR webviews may deny Clipboard API. Keep a selectable URL
    // even when the old copy command is absent, denied or returns false.
    input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
    try { copied = Boolean(document.execCommand?.('copy')); } catch {}
  }
  if (input.value !== url) return;
  safariCopyState = copied ? 'copied' : 'select';
  renderSafariHandoff();
});
window.addEventListener('visibilitychange', () => {
  // Release this page's relay slot only when the handoff actually backgrounds it.
  // A blocked/cancelled browser launch keeps the current PC connection usable.
  if (safariPending && document.hidden) {
    safariPending = false; connectionAttempt++; closeVoice(); void connection.disconnect();
  }
});
$('chrome-feedback').hidden = !new URLSearchParams(location.search || '').has('chromeFallback');
$('chrome-open').addEventListener('click', event => {
  if (!showChromeHandoff || ['choosing','connecting','sending'].includes(connection.state) || voice?.active) { event.preventDefault(); return; }
  // Preserve the trusted tap: the browser follows this anchor without a timer or awaited work.
  renderChromeHandoff();
  $('chrome-feedback').hidden = false;
  connectionAttempt++; void connection.disconnect();
});
$('code').addEventListener('input', () => { $('code').value = $('code').value.replace(/\D/g,'').slice(0,8); renderChromeHandoff(); renderSafariHandoff(); });
$('connect').addEventListener('click', () => {
  if ($('connect').disabled) return;
  const attempt = ++connectionAttempt;
  feedback('connecting');
  connection.connect($('code').value.trim(), currentLanguage.name).catch(error => {
    if (attempt !== connectionAttempt) return;
    connectionError = error?.code || 'connect'; renderConnection(); showError(error); refreshControls();
  });
});
$('disconnect').addEventListener('click', () => { connectionAttempt++; void connection.disconnect(); });
$('query').addEventListener('input', () => { searchComplete = false; refreshControls(); });
$('send').addEventListener('click', async () => {
  if ($('send').disabled) return;
  if (searchComplete) {
    searchComplete = false; $('query').value = ''; $('interim').textContent = '';
    feedback('queryHint'); refreshControls(); $('query').focus();
    return;
  }
  feedback('sending');
  try { const result = await connection.search($('query').value, currentLanguage.code); if (result.ok) { searchComplete = true; feedback('sent'); } else showError(result.code); }
  catch (error) { showError(error); }
  finally { refreshControls(); }
});
function voiceErrorKey(reason) {
  if (['not-allowed','service-not-allowed','audio-capture'].includes(reason)) return 'permission';
  if (reason === 'language-not-supported') return 'language';
  if (reason === 'network') return 'network';
  if (reason === 'no-speech') return 'noSpeech';
  if (reason === 'timeout') return 'timeout';
  return 'unavailable';
}
voice = new VoiceInput({
  getRecognition: () => window.SpeechRecognition || window.webkitSpeechRecognition,
  onState(state) {
    voiceState = state;
    if (['listening','hearing'].includes(state)) permissionConfirmed = true;
    if (state === 'starting') $('permission-guide').open = false;
    renderVoice(); openVoiceDialog($('listening')); refreshControls();
  },
  onResult({text, preview}) {
    $('interim').textContent = preview;
    renderVoice();
    // Dictation is a draft only: the user still presses Search to send it to the PC.
    if (text) { $('query').value = text; searchComplete = false; }
  },
  onFinish(reason) {
    if (reason !== 'error') {
      voiceState = reason === 'result' ? 'result' : 'idle'; closeVoiceDialog($('listening'));
      if (reason === 'result') feedback('confirmHelp');
    }
    renderVoice();
    refreshControls();
  },
  onError(reason) {
    voiceState = 'error'; voiceError = voiceErrorKey(reason);
    if (voiceError === 'permission') permissionConfirmed = false;
    showError(voiceError === 'permission' ? 'microphone' : voiceError === 'language' ? 'language' : 'speech');
    renderVoice(); openVoiceDialog($('listening')); refreshControls();
    if (appleMobile && ['permission','timeout'].includes(voiceError)) $('permission-guide').open = true;
  }
});
function startVoice() {
  if (busy || voice.active || !secure) return;
  $('interim').textContent = '';
  // Keep this synchronous inside the trusted button click, including Safari retries.
  voice.start(currentLanguage.code);
}
function useKeyboardVoice() {
  if (busy) return;
  voice.cancel(); voiceState = 'idle'; closeVoiceDialog($('listening'));
  if (searchComplete) { searchComplete = false; $('query').value = ''; }
  feedback('queryHint'); renderVoice(); refreshControls();
  // iPhone only opens the software keyboard when focus remains in this direct tap.
  $('query').focus();
}
function closeVoice() { voice.cancel(); voiceState = 'idle'; closeVoiceDialog($('listening')); renderVoice(); refreshControls(); }
$('voice').addEventListener('click', startVoice);
$('voice-retry').addEventListener('click', startVoice);
$('keyboard-voice').addEventListener('click', useKeyboardVoice);
$('voice-keyboard').addEventListener('click', useKeyboardVoice);
$('voice-close').addEventListener('click', closeVoice);
$('permission-safari').addEventListener('click', () => {
  if (!appleMobile) return;
  closeVoice(); $('safari-handoff').open = true; $('safari-open').focus();
});
$('stop-voice').addEventListener('click', () => voice.stop());
$('listening').addEventListener('cancel', event => { event.preventDefault(); closeVoice(); });
$('listening').addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeVoice(); }
  // Focus containment also works on older Safari without native dialog support.
  if (event.key === 'Tab' && $('listening').classList.contains('fallback-modal')) {
    const buttons = [...$('listening').querySelectorAll('button')].filter(button => !button.hidden && !button.disabled);
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
window.addEventListener('pagehide', () => { closeVoice(); void connection.disconnect(); });
refreshControls();

// A scoped worker keeps this app separate from the repository's existing root app cache.
if (secure && navigator.serviceWorker?.register) navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(()=>{});


