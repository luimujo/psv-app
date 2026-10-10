/* PSV Wesel-Lackhausen – Service Worker (App-Hülle offline). Version 2.3 · f75a43f603 */
const CACHE = 'psv-app-2.3-f75a43f603';
const SHELL = ['./', './index.html','./style.css','./app.js','./engine.js','./model.js','./data.js','./praes.js','./firebase.js','./cloud-core.js','./sync.js','./xlsx.js','./import.js','./taktik.js','./pwa.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); });
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('psv-app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;   // Firebase, Liga usw. direkt ans Netz
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(n => { if (n.ok && e.request.mode === 'navigate') c.put('./', n.clone()); return n; }).catch(() => e.request.mode === 'navigate' ? c.match('./') : Response.error()))));
});
