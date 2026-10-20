import { LANGUAGES } from './labels.mjs';
import { MESSAGES } from './network-text.mjs';
import { KaraokeConnection } from './relay-client.mjs';

const $ = id => document.getElementById(id);
let currentLanguage = LANGUAGES[0], recognition = null, voiceGeneration = 0, serverName = '', busy = false;
let feedbackState = { key:'queryHint', error:false };
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
  $('connection-state').textContent = message(['ready','sending'].includes(state) ? 'connected' : ['choosing','connecting'].includes(state) ? 'connecting' : 'disconnected');
}
function refreshControls() {
  const state = connection.state;
  const active = ['choosing','connecting','ready','sending'].includes(state);
  busy = state === 'sending';
  $('connect').disabled = !supported || active;
  $('code').disabled = active;
  $('disconnect').hidden = !active;
  $('send').disabled = state !== 'ready' || !supported || Boolean(recognition) || !$('query').value.trim();
  $('query').disabled = busy;
  for (const button of countryButtons.values()) button.disabled = busy || Boolean(recognition);
  $('voice').disabled = busy || Boolean(recognition) || !secure;
}
const connection = new KaraokeConnection(undefined, (state, detail) => {
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
  $('query-label').textContent = t[3]; $('query').placeholder = t[3]; $('send').textContent = t[1]; $('listening-title').textContent = t[5];
  $('help-list').replaceChildren(...words.steps.map(step => { const li=document.createElement('li'); li.textContent=step; return li; }));
  $('compatibility').hidden = supported;
  $('compatibility').textContent = supported ? '' : message(secure ? 'unsupported' : 'insecure', true);
  renderConnection(); renderFeedback();
}
let savedLanguage;
try { savedLanguage = localStorage.getItem('wk-bt-language'); } catch {}
const validSaved = LANGUAGES.some(x => x.code === savedLanguage);
const browserLanguage = (navigator.language || '').toLowerCase();
selectLanguage(validSaved ? savedLanguage : LANGUAGES.find(x => x.code.toLowerCase().split('-')[0] === browserLanguage.split('-')[0] || x.code === 'fil-PH' && browserLanguage.startsWith('tl'))?.code);
$('country-picker').open = !validSaved;
if (/^#\d{8}$/.test(location.hash)) $('code').value = location.hash.slice(1);
$('code').addEventListener('input', () => { $('code').value = $('code').value.replace(/\D/g,'').slice(0,8); });
$('connect').addEventListener('click', () => {
  feedback('connecting');
  connection.connect($('code').value, currentLanguage.name).catch(showError);
});
$('disconnect').addEventListener('click', () => { void connection.disconnect(); });
$('query').addEventListener('input', refreshControls);
$('send').addEventListener('click', async () => {
  if ($('send').disabled) return;
  feedback('sending');
  try { const result = await connection.search($('query').value, currentLanguage.code); if (result.ok) feedback('sent'); else showError(result.code); }
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
    if (finalText.trim()) $('query').value = finalText.trim().slice(0,300);
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
