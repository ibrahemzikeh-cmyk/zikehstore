/* ZIKEH STORE — بيخلي الموقع يشتغل كتطبيق وبدون إنترنت.
   - الصفحة نفسها: من الإنترنت أول شي (حتى تبين آخر نسخة)، وإذا ما في إنترنت من النسخة المحفوظة.
   - باقي الملفات (بيانات، ستايل، سكربتات): من المحفوظ فوراً وبتتحدّث بالخلفية.
     الملفات إلها رقم نسخة (?v=...)، فلما تتغيّر البيانات بيتنزّل الملف الجديد لحالو. */
const CACHE = 'zikeh-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'core.js', 'votes.js', 'logo.jpg', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function fromNetwork(req, cache) {
  return fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !fonts) return;

  if (req.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then(cache =>
      fromNetwork(req, cache).catch(() =>
        cache.match(req, { ignoreSearch: true }).then(r => r || cache.match('index.html')))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(cache => cache.match(req).then(hit => {
    const net = fromNetwork(req, cache).catch(() => hit);
    return hit || net;
  })));
});
