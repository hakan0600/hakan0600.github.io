/* Çevrimdışı çalışma: kabuk önce ağ, model ve tf.js önce önbellek (16 MB bir kez iner). */
const SHELL = 'odin-shell-v6', BIG = 'odin-model-v1';
const SHELL_FILES = ['./', 'sesler/index.json', 'sesler/play-1.mp3', 'sesler/play-2.mp3', 'sesler/attn-1.mp3', 'sesler/attn-2.mp3', 'sesler/laugh-1.mp3', 'sesler/sigh-1.mp3', 'sesler/sigh-3.mp3', 'index.html', 'app.js', 'sounds.js', 'talk.js', 'install.js', 'capture.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const BIG_FILES = ['tf.min.js', 'model/model.json', 'model/anlam.json', 'model/group1-shard1of4.bin', 'model/group1-shard2of4.bin', 'model/group1-shard3of4.bin', 'model/group1-shard4of4.bin'];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    await (await caches.open(SHELL)).addAll(SHELL_FILES);
    const big = await caches.open(BIG);
    await Promise.allSettled(BIG_FILES.map(async u => { if (!(await big.match(u))) await big.add(u); }));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('odin-') && k !== SHELL && k !== BIG) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/model/') || url.pathname.includes('/sesler/') || url.pathname.endsWith('/tf.min.js')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(BIG).then(x => x.put(req, c)); } return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(SHELL).then(x => x.put(req, c)); } return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
});
