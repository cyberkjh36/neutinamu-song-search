import { LANGUAGES } from './labels.mjs?v=2.1';
import { MESSAGES } from './network-text.mjs?v=2.1';
import { KaraokeConnection } from './relay-client.mjs?v=2.1';
import { needsChrome, readHandoff, chromeLinks } from './chrome-handoff.mjs?v=2.3';
import { CHROME_TEXT } from './chrome-text.mjs?v=2.2';
import { NEXT_SEARCH } from './search-text.mjs?v=2.3';
import { VoiceInput, isAppleMobile, openVoiceDialog, closeVoiceDialog } from './voice-input.mjs?v=2.4';
import { VOICE_TEXT } from './voice-text.mjs?v=2.4';

const $ = id => document.getElementById(id);
const handoff = readHandoff(location.hash), showChromeHandoff = needsChrome(navigator);
let currentLanguage = LANGUAGES[0], voice = null, serverName = '', busy = false, connectionError = null, connectionAttempt = 0;
let feedbackState = { key:'queryHint', error:false };
let searchComplete = false;
let voiceState = 'idle', voiceError = 'unavailable';
const appleMobile = isAppleMobile(navigator);
function voiceWords() { return VOICE_TEXT[currentLanguage.code]; }
function renderVoice() {
  const words = voiceWords(), failed = voiceState === 'error';
  $('keyboard-voice').textContent = $('voice-keyboard').textContent = words.keyboard;
  $('voice-retry').textContent = words.retry; $('voice-close').textContent = words.close;
  $('voice-help').hidden = !appleMobile && !failed;
  $('voice-help').textContent = (appleMobile ? words.iphoneHelp + '\n' : '') + words.keyboardHelp;
  $('voice-status').textContent = failed ? words[voiceError] + (appleMobile ? '\n' + words.iphoneHelp : '') : voiceState === 'starting' ? words.starting : currentLanguage.text[5];
  $('listening-title').textContent = failed ? words.failed : currentLanguage.text[5];
  $('listening').classList.toggle('voice-error', failed);
  $('voice-retry').hidden = !failed; $('voice-close').hidden = !failed; $('stop-voice').hidden = failed;
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
function refreshControls() {
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
    'stop-voice':'done', 'help-title':'helpTitle', 'shared-help':'sharedHelp',
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
  renderConnection(); renderFeedback(); renderChromeHandoff(); renderVoice();
}
let savedLanguage;
try { savedLanguage = localStorage.getItem('wk-bt-language'); } catch {}
const validSaved = LANGUAGES.some(x => x.code === savedLanguage);
const browserLanguage = (navigator.language || '').toLowerCase();
$('code').value = handoff.room; $('query').value = handoff.query;
selectLanguage(handoff.language || (validSaved ? savedLanguage : LANGUAGES.find(x => x.code.toLowerCase().split('-')[0] === browserLanguage.split('-')[0] || x.code === 'fil-PH' && browserLanguage.startsWith('tl'))?.code));
if (handoff.language) { try { localStorage.setItem('wk-bt-language',handoff.language); } catch {} }
$('country-picker').open = !validSaved && !handoff.language;
$('chrome-feedback').hidden = !new URLSearchParams(location.search || '').has('chromeFallback');
$('chrome-open').addEventListener('click', event => {
  if (!showChromeHandoff || ['choosing','connecting','sending'].includes(connection.state) || voice?.active) { event.preventDefault(); return; }
  // Preserve the trusted tap: the browser follows this anchor without a timer or awaited work.
  renderChromeHandoff();
  $('chrome-feedback').hidden = false;
  connectionAttempt++; void connection.disconnect();
});
$('code').addEventListener('input', () => { $('code').value = $('code').value.replace(/\D/g,'').slice(0,8); renderChromeHandoff(); });
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
    renderVoice(); openVoiceDialog($('listening')); refreshControls();
  },
  onResult({text, preview}) {
    $('interim').textContent = preview;
    // Dictation is a draft only: the user still presses Search to send it to the PC.
    if (text) { $('query').value = text; searchComplete = false; }
  },
  onFinish(reason) {
    if (reason !== 'error') {
      voiceState = 'idle'; closeVoiceDialog($('listening'));
      if (reason === 'result') feedback('confirmHelp');
    }
    refreshControls();
  },
  onError(reason) {
    voiceState = 'error'; voiceError = voiceErrorKey(reason);
    showError(voiceError === 'permission' ? 'microphone' : voiceError === 'language' ? 'language' : 'speech');
    renderVoice(); openVoiceDialog($('listening')); refreshControls();
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
function closeVoice() { voice.cancel(); voiceState = 'idle'; closeVoiceDialog($('listening')); refreshControls(); }
$('voice').addEventListener('click', startVoice);
$('voice-retry').addEventListener('click', startVoice);
$('keyboard-voice').addEventListener('click', useKeyboardVoice);
$('voice-keyboard').addEventListener('click', useKeyboardVoice);
$('voice-close').addEventListener('click', closeVoice);
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
