// SE LLAMA A GANO · funciona sin señal: guarda la app en el equipo.
const CACHE = 'sellamaagano-v2';
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    // primero la red (para recibir actualizaciones); si no hay señal, la copia guardada
    e.respondWith(Promise.race([
      fetch(req).then(r => {
        // si Netlify está pausado o falla, usa la copia guardada
        if (!r.ok) return caches.match('index.html').then(h => h || r);
        const c = r.clone(); caches.open(CACHE).then(k => k.put('index.html', c)); return r;
      }),
      new Promise((_, rej) => setTimeout(rej, 4000))
    ]).catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && (url.origin === location.origin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com'))) { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); }
    return r;
  }).catch(() => hit)));
});
