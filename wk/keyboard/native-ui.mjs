import {KEYBOARD_TEXT, NATIVE_KEYBOARD_HELP} from '../ui-text.mjs?v=3.8';

// The phone owns its IME and language switching. lang is a language hint,
// never a promise that the browser can select or install an OS keyboard.
export function createNativeKeyboard({getLanguage, blocked=()=>false, $=id=>document.getElementById(id), doc=document}) {
  const bindings = ['query', 'favorites-query'].map(id => ({
    field: $(id),
    button: $(id === 'query' ? 'query-keyboard' : 'favorites-keyboard'),
    help: $(id === 'query' ? 'query-keyboard-help' : 'favorites-keyboard-help'),
    id
  }));
  const available = b => b && !b.field.disabled && !blocked() &&
    (b.id !== 'favorites-query' || !$('favorites-panel').hidden);

  function refresh() {
    const language = getLanguage(), words = KEYBOARD_TEXT[language] || KEYBOARD_TEXT['ko-KR'];
    for (const b of bindings) {
      if (b.field.lang !== language) b.field.lang = language;
      b.button.disabled = !available(b);
      b.button.title = words.native;
      b.button.setAttribute('aria-label', words.native);
      b.help.lang = language;
      b.help.textContent = NATIVE_KEYBOARD_HELP[language] || NATIVE_KEYBOARD_HELP['ko-KR'];
    }
  }

  function native(field) {
    const b = bindings.find(b => b.field === field);
    if (!available(b)) return;
    refresh();
    const {selectionStart: start, selectionEnd: end} = field;
    // Android can keep the input focused after Back dismisses its keyboard.
    // Refocus in the SAME tap, without a timer/await, also for iPhone Safari.
    if (doc.activeElement === field) field.blur();
    field.focus();
    if (start != null && end != null) field.setSelectionRange(start, end);
  }

  function close() {
    const b = bindings.find(b => b.field === doc.activeElement);
    b?.field.blur();
  }

  for (const b of bindings) {
    b.field.readOnly = false;
    b.field.setAttribute('inputmode', 'text');
    b.button.addEventListener('click', () => native(b.field));
    b.field.addEventListener('focus', () => { b.help.hidden = false; });
  }
  refresh();
  return {refresh, native, close};
}
