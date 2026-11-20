const CACHE = 'neutinamu-webremote-1.3.1-voice';
const FILES = ['index.html','voice-search.js','native-search.js','favorites-ui.js','favorites-data.js','favorites.css',
  'vendor/qrcode.js','wifi-client.mjs','wifi-bridge.js','wifi.css','manifest.webmanifest','../chosung.js','../p2.css','../icon.svg',
  '../icon-192.png','../icon-512.png','../catalog-20261018.csv','../catalog-update-20261104.csv'];
const urls = new Set(FILES.map(file => new URL(file, self.registration.scope).href));
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file => new Request(new URL(file,self.registration.scope),{cache:'reload'})))).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('neutinamu-webremote-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())
));
self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  url.search = ''; url.hash = '';
  if (url.href === self.registration.scope) url.pathname += 'index.html';
  if (!urls.has(url.href)) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.open(CACHE)).match(url.href).then(hit => hit || Response.error())));
});
