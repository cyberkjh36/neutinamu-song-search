import { chromeLinks } from './chrome-handoff.mjs?v=2.3';

// The QR reader chooses the first browser. A website cannot change that default,
// or reliably distinguish Safari from SFSafariViewController by user agent.
// Offer an explicit tap on Apple mobile devices; never redirect on page load.
export function safariLinks(fields = {}) {
  const target = new URL(chromeLinks(fields).page);
  target.searchParams.set('v', '2.6');
  target.searchParams.set('safariHandoff', '1');
  // Only change the leading scheme. Room, language and draft remain in the hash.
  // iOS/browser support varies, so the ordinary HTTPS URL is always available.
  return { page: target.href, safari: target.href.replace(/^https:/, 'x-safari-https:') };
}

export function safariArrival(search = '') {
  // An arrival hint is not proof of Safari or microphone permission. It merely
  // collapses the optional help so reopening the URL cannot create a loop.
  return new URLSearchParams(search).get('safariHandoff') === '1';
}
