// Never cache authenticated requests or user data. Offline data is device-local only.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('shared-todo-')).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
