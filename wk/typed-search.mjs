// Keep accents (including Vietnamese tone marks). Normalize only at submission,
// never while the phone's keyboard is composing or positioning the caret.
export function normalizeTypedQuery(value) {
  return value.normalize('NFC').replace(/[\r\n\t\u2028\u2029]+/g, ' ').trim();
}

// Typing and IME composition remain local. Search is an explicit action from
// the app button or the phone keyboard's Search/Enter key.
export function bindTypedSearch({field, submit, canSubmit, onDraft}) {
  let composing = false, allowLineBreak = false, lastValue = field.value;
  field.addEventListener('input', () => {
    lastValue = field.value; allowLineBreak = false; onDraft();
  });
  field.addEventListener('change', () => {
    // A delayed blur/change after Enter is not a new draft. Otherwise tapping
    // Next Search could accidentally resend the song that just succeeded.
    if (normalizeTypedQuery(field.value) !== normalizeTypedQuery(lastValue)) onDraft();
    lastValue = field.value;
  });
  field.addEventListener('compositionstart', () => { composing = true; });
  field.addEventListener('compositionend', () => { composing = false; onDraft(); });

  function search(event) {
    event.preventDefault();
    if (canSubmit()) void submit();
  }
  field.addEventListener('keydown', event => {
    allowLineBreak = false;
    if (event.key !== 'Enter') return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      allowLineBreak = true;
      return;
    }
    // Android/iOS may use keyCode 229 even when isComposing is false.
    if (composing || event.isComposing || event.keyCode === 229) {
      allowLineBreak = true;
      return;
    }
    if (event.repeat) { event.preventDefault(); return; }
    search(event);
  });
  field.addEventListener('beforeinput', event => {
    if (!['insertLineBreak', 'insertParagraph'].includes(event.inputType)) return;
    if (allowLineBreak) { allowLineBreak = false; return; }
    if (composing || event.isComposing) return;
    // Some phone keyboards emit beforeinput without an Enter keydown.
    search(event);
  });
}
