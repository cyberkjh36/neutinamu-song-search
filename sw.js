/* Keep the installation worker parseable by older Android browsers. */
var CACHE='neutinamu-p2-v10-20261022-shortcuts';
var ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon.svg'];
self.addEventListener('install',function(event){
 event.waitUntil(caches.open(CACHE).then(function(cache){return cache.addAll(ASSETS)}).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(event){
 event.waitUntil(Promise.all([
  caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key.indexOf('neutinamu-p2-')===0&&key!==CACHE}).map(function(key){return caches.delete(key)}))}),
  self.clients.claim()
 ]));
});
self.addEventListener('fetch',function(event){
 var req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 // WORLD KARAOKE owns its separate scope.
 if(url.pathname.indexOf(new URL('./wk/',self.location).pathname)===0)return;
 if(url.pathname.slice(-13)==='/refresh.html'){event.respondWith(fetch(req,{cache:'no-store'}));return}
 if(req.mode==='navigate'){
  event.respondWith(caches.open(CACHE).then(function(cache){
   return fetch(req,{cache:'no-cache'}).then(function(response){
    if(!response.ok)throw Error('Offline');
    return cache.put('./index.html',response.clone()).then(function(){return response},function(){return response});
   }).catch(function(error){return cache.match('./index.html').then(function(saved){if(saved)return saved;throw error})});
  }));return;
 }
 event.respondWith(caches.open(CACHE).then(function(cache){
  return cache.match(req).then(function(hit){
   if(hit)return hit;
   return fetch(req).then(function(response){
    if(response.ok&&url.pathname===new URL('./catalog-20261018.csv',self.location).pathname){
     return cache.put(req,response.clone()).then(function(){return response},function(){return response});
    }
    return response;
   });
  });
 }));
});
