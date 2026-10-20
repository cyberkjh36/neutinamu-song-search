// Use a real, user-activated intent link. Loading a QR must not launch apps in a loop.
const PAGE = 'https://cyberkjh36.github.io/neutinamu-song-search/wk/';
const LOCALES = new Set(['ko-KR','th-TH','fil-PH','vi-VN','ne-NP','mn-MN','id-ID','lo-LA','my-MM','zh-CN','ja-JP']);

export function needsChrome(navigator = {}) {
  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua) && navigator.userAgentData?.platform !== 'Android') return false;
  const otherBrowser = /SamsungBrowser|EdgA|OPR\/|OPX\/|Opera|Firefox|FxiOS|Whale|UCBrowser|MiuiBrowser|YaBrowser|Vivaldi|DuckDuckGo|Brave|;\s*wv\)|Version\/.*Chrome\//i.test(ua);
  const chrome = /Chrome\/\d/i.test(ua) || navigator.userAgentData?.brands?.some(x => x.brand === 'Google Chrome');
  return otherBrowser || !chrome;
}

export function readHandoff(hash = '') {
  if (/^#\d{8}$/.test(hash)) return {room:hash.slice(1),language:'',query:''};
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : '');
  return {
    room:/^\d{8}$/.test(params.get('room') || '') ? params.get('room') : '',
    language:LOCALES.has(params.get('language')) ? params.get('language') : '',
    query:(params.get('query') || '').replace(/[\u0000-\u001f\u007f-\u009f]/g,'').slice(0,300)
  };
}

export function chromeLinks({room = '', language = '', query = ''} = {}) {
  const target = new URL(PAGE);
  target.searchParams.set('v','2.3');
  const state = new URLSearchParams();
  if (/^\d{8}$/.test(room)) state.set('room',room);
  if (LOCALES.has(language)) state.set('language',language);
  if (query) state.set('query',String(query).replace(/[\u0000-\u001f\u007f-\u009f]/g,'').slice(0,300));
  // Keep the room and draft in the fragment so they are not sent to GitHub Pages.
  target.hash = state.toString();
  const fallback = new URL(target);
  fallback.searchParams.set('chromeFallback','1');
  // Android Intent.parseUri uses the final #Intent delimiter, preserving the data fragment.
  return {page:target.href, fallback:fallback.href,
    intent:target.href.replace(/^https:/,'intent:') + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(fallback.href) + ';end'};
}
