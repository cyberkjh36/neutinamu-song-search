const CACHE = 'neutinamu-webremote-1.4.16-manager-device';
const FILES = ['index.html','light.css','voice-search.js','native-search.js','favorites-ui.js','favorites-data.js','favorites.css',
  'manager.html','manager.sealed.json','manager.webmanifest','../manager/unlock.mjs','../manager/crypto.mjs','../manager/device.mjs','../manager/rooms.css','vendor/qrcode.js','wifi-client.mjs','room-connection.mjs','wifi-bridge.js','sound-controls.mjs','wifi.css','manifest.webmanifest','../catalog-sync.js','../chosung.js','../p2.css','../icon.svg',
  '../icon-192.png','../icon-512.png'];
const catalogUrls = new Set(['../catalog-20261018.csv','../catalog-update-20261104.csv','../catalog-update-20261120.csv'].map(file => new URL(file,self.registration.scope).href));
const urls = new Set(FILES.map(file => new URL(file, self.registration.scope).href));
async function installAssets() {
  const cache = await caches.open(CACHE);
  await cache.addAll(FILES.map(file => new Request(new URL(file,self.registration.scope),{cache:'reload'})));
  // Dated catalogs are immutable. Carry forward the previous download before rotating this cache.
  for (const url of catalogUrls) {
    const saved = await caches.match(url);
    if (saved?.ok) await cache.put(url,saved);
    else await cache.add(url);
  }
  await self.skipWaiting();
}
self.addEventListener('install', event => event.waitUntil(installAssets()));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('neutinamu-webremote-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())
));
self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  url.search = ''; url.hash = '';
  if (url.href === self.registration.scope) url.pathname += 'index.html';
  if (catalogUrls.has(url.href)) {
    event.respondWith(caches.match(url.href).then(hit => hit || fetch(event.request)));
    return;
  }
  if (!urls.has(url.href)) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.open(CACHE)).match(url.href).then(hit => hit || Response.error())));
});
