const CACHE='neutinamu-p2-v9-20261020-wk';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('neutinamu-p2-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()]));});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 // WORLD KARAOKE has its own scope and must not overwrite the song-number app shell.
 if(url.pathname.startsWith(new URL('./wk/',self.location).pathname))return;
 // Always fetch the recovery page fresh, even when the app shell is cached.
 if(url.pathname.endsWith('/refresh.html')){event.respondWith(fetch(req,{cache:'no-store'}));return}
 if(req.mode==='navigate'){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   try{const response=await fetch(req,{cache:'no-cache'});if(!response.ok)throw Error('Offline');await cache.put('./index.html',response.clone());return response}
   catch(error){const saved=await cache.match('./index.html');if(saved)return saved;throw error}
  })());return;
 }
 event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const hit=await cache.match(req);
   if(hit)return hit;
   const response=await fetch(req);
   if(response.ok&&url.pathname===new URL('./catalog-20261018.csv',self.location).pathname){
     await cache.put(req,response.clone());
   }
   return response;
 })());
});
