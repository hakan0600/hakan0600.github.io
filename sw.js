/* Çevrimdışı çalışma.
   - Kabuk (küçük dosyalar): her sürümde yenilenir, önce ağ (güncel kalsın), ağ yoksa önbellek.
   - Vendor (OCR motoru, dil dosyaları, sözlük; ~21 MB): ayrı, kalıcı önbellek. Kurulurken bir kez iner,
     sürüm güncellemelerinde yeniden indirilmez (telefon verisi harcanmasın). */
const SHELL_CACHE = 'yokdil-shell-v10';
const VENDOR_CACHE = 'yokdil-vendor-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/gate.js', 'js/store.js', 'js/parser.js', 'js/tts.js', 'js/layout.js', 'js/fixer.js', 'js/ocr.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];
const VENDOR = [
  'vendor/tesseract/tesseract.min.js', 'vendor/tesseract/worker.min.js',
  'vendor/tesseract/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/tesseract-core-lstm.wasm.js',
  'vendor/tesseract/lang/eng.traineddata', 'vendor/tesseract/lang/tur.traineddata',
  'vendor/lex/en-tr.json', 'vendor/lex/en.txt', 'vendor/lex/tr.txt',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL);
    // Büyük dosyalar en iyi çabayla: biri inmezse kurulum bozulmaz, ilk kullanımda yine önbelleğe girer.
    const vendor = await caches.open(VENDOR_CACHE);
    await Promise.allSettled(VENDOR.map(async u => { if (!(await vendor.match(u))) await vendor.add(u); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== VENDOR_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.includes('/vendor/')) {
    // Büyük, değişmeyen dosyalar: önce önbellek
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VENDOR_CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // version.json (güncelleme denetimi) ve /__ uçları (bilgisayar↔telefon aktarımı) hiç önbelleğe alınmaz
  if (url.pathname.endsWith('/version.json') || url.pathname.includes('/__')) return;

  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});
