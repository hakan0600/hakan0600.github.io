/* Fotoğraftan yazı okuma (Tesseract.js, tamamen cihaz içinde; internet gerekmez). Motor ilk kullanımda yüklenir.
   Kitap fotoğrafları için: yönü otomatik bulur (baş aşağı/yan çekimler), filigranı bastırır, sütunlu tabloları ve başlıklı eş anlamlı tablolarını konumdan çözer. Sonuç kelime çiftleri olarak döner. */
const OCR = (() => {
  const base = new URL('vendor/tesseract/', location.href).href;
  const LONGEST = 2900;   // asıl okuma için hedef uzun kenar (px)
  const PROBE = 1400;     // yön araması için küçük kopya
  const LEVEL_K = 0.72;   // arka plan düzlendikten sonra beyaz nokta (kâğıdın %72'si); filigran bunun üstünde kalır
  let worker = null;
  let progress = () => {};
  let dirty = false;      // hücre okumasından sonra işçi temiz başlasın diye yenilenir
  let lastRot = 0;        // aynı kitaptan art arda çekimler genelde aynı yönde olur

  function loadScript() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = base + 'tesseract.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('OCR motoru yüklenemedi'));
      document.head.appendChild(s);
    });
  }

  async function getWorker() {
    if (worker) return worker;
    await loadScript();
    // Sıra önemli: Türkçe önde olunca "ğ, ı, ş" gibi harf işaretleri daha az kayboluyor.
    worker = await Tesseract.createWorker(['tur', 'eng'], 1, {
      workerPath: base + 'worker.min.js',
      corePath: base,
      langPath: base + 'lang',
      gzip: false,
      logger: m => { if (m.status === 'recognizing text') progress(m.progress); },
    });
    return worker;
  }

  /** deg kadar döndürülmüş, uzun kenarı `longest` olan tuval. */
  function toCanvas(bmp, deg, longest, crop) {
    const sideways = deg % 180 !== 0;
    const w0 = sideways ? bmp.height : bmp.width;
    const h0 = sideways ? bmp.width : bmp.height;
    const scale = longest / Math.max(w0, h0);
    const W = Math.round(w0 * scale);
    const H = Math.round(h0 * scale);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(W / 2, H / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(bmp, (-bmp.width * scale) / 2, (-bmp.height * scale) / 2, bmp.width * scale, bmp.height * scale);
    if (!crop) return c;
    // yön araması için orta şerit
    const cw = Math.round(W * 0.9);
    const ch = Math.round(H * 0.32);
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    out.getContext('2d', { willReadFrequently: true }).drawImage(c, Math.round(W * 0.05), Math.round(H * 0.34), cw, ch, 0, 0, cw, ch);
    return out;
  }

  const pct = (g, q) => {
    const h = new Uint32Array(256);
    for (let i = 0; i < g.length; i++) h[g[i]]++;
    let a = 0;
    const t = g.length * q;
    for (let i = 0; i < 256; i++) { a += h[i]; if (a >= t) return i; }
    return 255;
  };

  function grayOf(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const g = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    return { g, img, ctx };
  }

  /** Ortalama filtresi (ayrılabilir, kenarlar sabitlenir): küçük arka plan haritasını yumuşatır. */
  function boxBlur(a, w, h, r) {
    const tmp = new Float32Array(a.length);
    const out = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += a[y * w + Math.min(w - 1, Math.max(0, x + k))];
        tmp[y * w + x] = s / (2 * r + 1);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
        out[y * w + x] = s / (2 * r + 1);
      }
    }
    return out;
  }

  /**
   * Gri tona çevirir ve arka planı düzler: her bölgenin kâğıt parlaklığı (küçük blokların en açığı, yazıyı yok sayar)
   * hesaplanıp piksel ona bölünür. Gölge ve filigran birlikte silinir; kalan beyaz noktayı aşağı çekmek yazıyı netleştirir.
   */
  function clean(canvas) {
    const W = canvas.width;
    const H = canvas.height;
    const { g, img, ctx } = grayOf(canvas);
    const f = 8;
    const w = Math.ceil(W / f);
    const h = Math.ceil(H / f);
    let bg = new Float32Array(w * h);
    for (let by = 0; by < h; by++) {
      for (let bx = 0; bx < w; bx++) {
        let m = 0;
        for (let y = by * f; y < Math.min(H, by * f + f); y++) {
          for (let x = bx * f; x < Math.min(W, bx * f + f); x++) if (g[y * W + x] > m) m = g[y * W + x];
        }
        bg[by * w + bx] = m;
      }
    }
    bg = boxBlur(boxBlur(bg, w, h, 3), w, h, 3); // ~ 48px yarıçaplı yumuşatma
    const norm = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const row = ((y / f) | 0) * w;
      for (let x = 0; x < W; x++) {
        const b = Math.max(40, bg[row + ((x / f) | 0)]);
        const v = (g[y * W + x] * 255) / b;
        norm[y * W + x] = v > 255 ? 255 : v;
      }
    }
    const lo = pct(norm, 0.01);
    const white = LEVEL_K * 255 + (1 - LEVEL_K) * lo; // yazı ile kâğıt arasında bir nokta; üstü beyaz
    const span = Math.max(1, white - lo);
    const d = img.data;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const v = Math.max(0, Math.min(255, ((norm[j] - lo) * 255) / span));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  }

  const goodWords = words => words.filter(q => q.confidence > 70 && /^[A-Za-zÇĞİÖŞÜçğıöşü]{3,}$/.test(q.text)).length;

  /** 0/90/180/270 içinden metnin doğru okunduğu yönü bulur (doğru yönde güvenilir sözcük sayısı ~10 kat fazla olur). */
  async function findRotation(w, bmp, onStatus) {
    const order = [lastRot, (lastRot + 180) % 360, (lastRot + 90) % 360, (lastRot + 270) % 360];
    let best = { deg: lastRot, good: -1 };
    for (const deg of order) {
      onStatus?.('Fotoğrafın yönü aranıyor…');
      const c = toCanvas(bmp, deg, PROBE, true);
      clean(c);
      const { data } = await w.recognize(c);
      const good = goodWords(data.words);
      if (good > best.good) best = { deg, good };
      if (good >= 25) break; // yanlış yönlerde bu sayı ~5'i geçmez
    }
    lastRot = best.deg;
    return best.deg;
  }

  /** Sayfadan bir hücreyi kırpıp 2-4 kat büyüterek tek başına okur (küçük yazı hatalarını giderir). */
  async function readBox(w, canvas, box, psm) {
    const pad = 8;
    const x0 = Math.max(0, Math.floor(box.x0 - pad));
    const y0 = Math.max(0, Math.floor(box.y0 - pad));
    const x1 = Math.min(canvas.width, Math.ceil(box.x1 + pad));
    const y1 = Math.min(canvas.height, Math.ceil(box.y1 + pad));
    const cw = x1 - x0;
    const ch = y1 - y0;
    if (cw < 20 || ch < 12) return null;
    const scale = Math.max(2, Math.min(4, 140 / ch));
    const m = 24; // Tesseract kenara yapışık yazıyı sevmez: beyaz çerçeve
    const c = document.createElement('canvas');
    c.width = Math.round(cw * scale) + 2 * m;
    c.height = Math.round(ch * scale) + 2 * m;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, x0, y0, cw, ch, m, m, Math.round(cw * scale), Math.round(ch * scale));
    await w.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await w.recognize(c);
    return { text: data.text.replace(/\s*\n\s*/g, ' ').trim(), conf: data.confidence };
  }

  /** Şüpheli / eksik satırların hücrelerini büyütüp yeniden okur ("zoom"). Düzelenler sonradan sözlükle de doğrulanır. */
  async function refine(w, canvas, rows, onStatus) {
    const todo = rows.filter(r => (r.low || !r.tr || !r.en) && (r.enBox || r.trBox));
    let n = 0;
    for (const r of todo) {
      onStatus?.(`Şüpheli satırlar büyütülüp yeniden okunuyor… ${++n}/${todo.length}`);
      const enBad = !r.en || !Layout.plausibleEn(r.en) || r.conf < 55;
      const trBad = !r.tr || !Layout.plausibleTr(r.tr) || r.conf < 55;
      if (enBad && r.enBox) {
        const t = await readBox(w, canvas, r.enBox, '7');
        const en = t && Parser.cleanEn(t.text);
        if (en && Layout.plausibleEn(en) && t.conf >= 60) { r.en = en; r.zoomEn = true; }
      }
      if (trBad && r.trBox) {
        const t = await readBox(w, canvas, r.trBox, '6');
        const tr = t && Parser.cleanTr(t.text);
        if (tr && Layout.plausibleTr(tr) && t.conf >= 60) { r.tr = tr; r.zoomTr = true; }
      }
      if ((r.zoomEn || !enBad) && (r.zoomTr || !trBad)) r.conf = Math.max(r.conf, 80);
    }
    await w.setParameters({ tessedit_pageseg_mode: '6' });
    dirty = true;
    return rows;
  }

  const wordsOf = data => data.words.map(q => ({
    t: q.text, c: Math.round(q.confidence), x0: q.bbox.x0, y0: q.bbox.y0, x1: q.bbox.x1, y1: q.bbox.y1,
  }));

  /**
   * Bir fotoğrafı okur. Dönen: { rows: [{en, tr, conf, guess}], text, mode: 'table'|'grid'|'text', rotation }
   * onStatus(metin) ilerleme mesajı; onProgress(0..1) asıl okuma ilerlemesi.
   */
  async function readPage(file, onStatus, onProgress) {
    onStatus?.('OCR motoru hazırlanıyor… (ilk seferde biraz sürer)');
    const w = await getWorker();
    await w.setParameters({ tessedit_pageseg_mode: '6' }); // önceki sayfanın hücre okumasından kalan modu sıfırla
    const bmp = await createImageBitmap(file);
    try {
      const rotation = await findRotation(w, bmp, onStatus);
      const canvas = toCanvas(bmp, rotation, LONGEST, false);
      clean(canvas);
      onStatus?.('Yazı okunuyor…');
      progress = onProgress || (() => {});
      await w.setParameters({ tessedit_pageseg_mode: '6' });
      const { data } = await w.recognize(canvas);
      const words = wordsOf(data);

      const grid = Layout.grid(words);
      if (grid.ok) return { rows: grid.rows, text: data.text, mode: 'grid', rotation };
      const table = Layout.pairs(words, canvas.width);
      if (table.ok) {
        const refined = await refine(w, canvas, table.rows, onStatus);
        return { rows: Layout.finish(refined, true), text: data.text, mode: 'table', rotation };
      }
      const { entries } = Parser.parse(data.text);
      const rows = Layout.finish(entries.map(e => ({ en: e.en, tr: e.tr, conf: e.guess ? 70 : 90, guess: e.guess })));
      return { rows, text: data.text, mode: 'text', rotation };
    } finally {
      bmp.close?.();
      if (dirty) { dirty = false; const old = worker; worker = null; try { await old.terminate(); } catch (e) { /* zaten kapalı */ } }
    }
  }

  return { readPage };
})();
