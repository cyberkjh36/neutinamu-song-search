import { LANGUAGES } from './labels.mjs?v=2.1';
import { MESSAGES } from './network-text.mjs?v=2.1';
import { KaraokeConnection } from './relay-client.mjs?v=2.1';
import { needsChrome, readHandoff, chromeLinks } from './chrome-handoff.mjs?v=2.3';
import { CHROME_TEXT } from './chrome-text.mjs?v=2.2';
import { NEXT_SEARCH } from './search-text.mjs?v=2.3';

const $ = id => document.getElementById(id);
const handoff = readHandoff(location.hash), showChromeHandoff = needsChrome(navigator);
let currentLanguage = LANGUAGES[0], recognition = null, voiceGeneration = 0, serverName = '', busy = false, connectionError = null, connectionAttempt = 0;
let feedbackState = { key:'queryHint', error:false };
let searchComplete = false;
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
  const blocked = ['choosing','connecting','sending'].includes(connection.state) || Boolean(recognition);
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
  $('send').disabled = state !== 'ready' || !supported || Boolean(recognition) || !$('query').value.trim();
  $('send').textContent = searchComplete ? NEXT_SEARCH[currentLanguage.code] : currentLanguage.text[1];
  $('query').disabled = busy;
  for (const button of countryButtons.values()) button.disabled = busy || Boolean(recognition);
  $('voice').disabled = busy || Boolean(recognition) || !secure;
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
  renderConnection(); renderFeedback(); renderChromeHandoff();
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
  if (!showChromeHandoff || ['choosing','connecting','sending'].includes(connection.state) || recognition) { event.preventDefault(); return; }
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
function finishVoice(instance, generation) {
  if (recognition !== instance || voiceGeneration !== generation) return;
  recognition = null; $('listening').close(); refreshControls();
}
$('voice').addEventListener('click', () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showError('speech'); $('query').focus(); return; }
  const instance = new SpeechRecognition(), generation = ++voiceGeneration;
  recognition = instance;
  instance.lang = currentLanguage.code; instance.continuous = false; instance.interimResults = true; instance.maxAlternatives = 1;
  $('interim').textContent = ''; $('listening').showModal(); refreshControls();
  let finalText = '', voiceFailed = false;
  instance.onresult = event => {
    if (recognition !== instance || voiceGeneration !== generation) return;
    const interim = [];
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += text + ' '; else interim.push(text);
    }
    $('interim').textContent = finalText || interim.join(' ');
    // Dictation fills the input only. No search is sent until the user taps Send.
    if (finalText.trim()) { $('query').value = finalText.trim().slice(0,300); searchComplete = false; }
  };
  instance.onerror = event => {
    if (recognition !== instance || voiceGeneration !== generation) return;
    voiceFailed = true;
    showError(['not-allowed','service-not-allowed','audio-capture'].includes(event.error) ? 'microphone' : event.error === 'language-not-supported' ? 'language' : 'speech');
    finishVoice(instance, generation);
  };
  instance.onend = () => {
    if (recognition !== instance || voiceGeneration !== generation) return;
    if (finalText.trim()) feedback('confirmHelp'); else if (!voiceFailed) showError('speech');
    finishVoice(instance, generation);
  };
  try { instance.start(); } catch { showError('speech'); finishVoice(instance, generation); }
});
function stopVoice() {
  const instance = recognition, generation = voiceGeneration;
  if (!instance) return;
  try { instance.stop(); } catch { finishVoice(instance, generation); }
  setTimeout(() => { if (recognition === instance && voiceGeneration === generation) { try { instance.abort(); } catch {} finishVoice(instance, generation); } }, 2500);
}
$('stop-voice').addEventListener('click', stopVoice);
$('listening').addEventListener('cancel', event => { event.preventDefault(); stopVoice(); });
window.addEventListener('pagehide', () => { try { recognition?.abort(); } catch {} void connection.disconnect(); });
refreshControls();

// A scoped worker keeps this app separate from the repository's existing root app cache.
if (secure && navigator.serviceWorker?.register) navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(()=>{});
