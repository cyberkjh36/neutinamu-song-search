// Recognition must start in the original tap, without permission probes, fetches or timers.
// Some WebKit versions expose the API but never send start/error/end. Bound every session.
export class VoiceInput {
  constructor({ getRecognition, onState = () => {}, onResult = () => {}, onError = () => {}, onFinish = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
    Object.assign(this, { getRecognition, onState, onResult, onError, onFinish, setTimer, clearTimer });
    this.session = null;
  }
  get active() { return Boolean(this.session); }
  start(language) {
    if (this.active) return false;
    const session = { instance:null, timers:new Set(), final:'', preview:'' };
    this.session = session;
    this.onState('starting');
    const current = () => this.session === session;
    const later = (fn, ms) => {
      const timer = this.setTimer(() => { session.timers.delete(timer); if (current()) fn(); }, ms);
      session.timers.add(timer); return timer;
    };
    try {
      const Constructor = this.getRecognition();
      if (!Constructor) { this.fail(session, 'unsupported'); return false; }
      const instance = session.instance = new Constructor();
      instance.lang = language;
      instance.continuous = false;
      instance.interimResults = true;
      instance.maxAlternatives = 1;
      const startup = later(() => this.fail(session, 'timeout'), 12000);
      later(() => this.complete(session), 45000);
      const started = () => {
        if (!current()) return;
        this.clearTimer(startup); session.timers.delete(startup);
        this.onState('listening');
      };
      instance.onstart = started;
      instance.onaudiostart = started;
      instance.onresult = event => {
        if (!current()) return;
        started();
        const final = [], interim = [];
        // Rebuild the complete result list: Safari can revise/repeat the same result index.
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i], text = result?.[0]?.transcript?.trim();
          if (text) (result.isFinal ? final : interim).push(text);
        }
        session.final = final.join(' ').slice(0,300);
        session.preview = [...final, ...interim].join(' ').slice(0,300);
        this.onResult({ text:session.final, preview:session.preview });
      };
      instance.onerror = event => { if (current()) this.fail(session, event.error || 'unknown'); };
      instance.onend = () => { if (current()) this.complete(session); };
      instance.start();
      return true;
    } catch (error) {
      if (current()) this.fail(session, ['NotAllowedError','SecurityError'].includes(error?.name) ? 'not-allowed' : 'unavailable');
      return false;
    }
  }
  release(session) {
    if (this.session !== session) return false;
    this.session = null;
    for (const timer of session.timers) this.clearTimer(timer);
    session.timers.clear();
    const instance = session.instance;
    if (instance) {
      instance.onstart = instance.onaudiostart = instance.onresult = instance.onerror = instance.onend = null;
      try { instance.abort(); } catch {}
    }
    return true;
  }
  complete(session) {
    const text = session.final || session.preview;
    if (!text) { this.fail(session, 'no-speech'); return; }
    if (!this.release(session)) return;
    // Even interim-only dictation is a draft; the user must still press Search to send it.
    this.onResult({ text, preview:text });
    this.onFinish('result');
  }
  fail(session, reason) {
    if (!this.release(session)) return;
    this.onFinish('error');
    this.onError(reason);
  }
  stop() {
    const session = this.session;
    if (!session) return;
    try { session.instance?.stop(); } catch { this.complete(session); }
    if (this.session !== session) return;
    for (const timer of session.timers) this.clearTimer(timer);
    session.timers.clear();
    session.timers.add(this.setTimer(() => { if (this.session === session) this.complete(session); }, 2500));
  }
  cancel() {
    if (this.session && this.release(this.session)) this.onFinish('cancel');
  }
}

export function isAppleMobile(navigator = {}) {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
    (/Mac/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1);
}

// iOS 14.5–15.3 can have recognition without HTMLDialogElement.showModal().
export function openVoiceDialog(dialog) {
  if (dialog.open) return;
  if (typeof dialog.showModal === 'function') {
    try { dialog.showModal(); return; } catch {}
  }
  dialog.classList.toggle('fallback-modal', true);
  dialog.setAttribute('open', '');
  dialog.open = true;
  dialog.querySelector?.('button:not([hidden]):not([disabled])')?.focus();
}

export function closeVoiceDialog(dialog) {
  if (typeof dialog.close === 'function') { try { dialog.close(); } catch {} }
  dialog.removeAttribute('open');
  dialog.open = false;
  dialog.classList.toggle('fallback-modal', false);
}
