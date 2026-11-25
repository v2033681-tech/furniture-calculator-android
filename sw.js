const CACHE_NAME='furniture-calc-pwa-v6';
const CORE=['/','/index.html','/voice-plugin.js','/voice-input.js','/voice-input-ui.js','/photo-gallery.js','/manifest.json','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const c=await caches.open(CACHE_NAME);await c.addAll(CORE);await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys()){if(key.startsWith('furniture-calc-')&&key!==CACHE_NAME)await caches.delete(key);}await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return; // Do not cache Supabase/CDN requests
 event.respondWith((async()=>{try{const res=await fetch(req);if(res.ok){const cache=await caches.open(CACHE_NAME);cache.put(req,res.clone());}return res;}catch(err){return await caches.match(req)||await caches.match('/index.html');}})());
});
