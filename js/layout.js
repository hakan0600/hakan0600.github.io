/* Tablo düzenli sayfalar (yan yana İngilizce | Türkçe sütun çiftleri): OCR sözcük kutularından kelime çiftleri çıkarır.
   Tesseract düz metinde yan yana sütunları aynı satıra karıştırdığı için sütunları konumdan kendimiz ayırırız. */
const Layout = (() => {
  const TR_CHAR = /[çğıöşüÇĞİÖŞÜ]/;

  const median = a => {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const quantile = (a, q) => {
    const s = a.slice().sort((x, y) => x - y);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0;
  };
  const cy = w => (w.y0 + w.y1) / 2;
  const cx = w => (w.x0 + w.x1) / 2;

  function usable(words) {
    return words
      .filter(w => w.t && w.t.trim() && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(w.t) && w.c >= 25 && w.x1 > w.x0 && w.y1 > w.y0)
      .map(w => Object.assign({}, w, { t: w.t.trim() }));
  }

  /** Sözcüklerin x ekseninde hiç örtüşmediği boşlukları bulur; aralarındaki bantlar sütunlardır. */
  function bands(words, width) {
    const strong = words.filter(w => w.c >= 60); // filigran/çizgi artıkları sütun boşluklarını kapatmasın
    const src = strong.length >= 20 ? strong : words;
    const bin = 3;
    const n = Math.ceil(width / bin) + 1;
    const cover = new Uint16Array(n);
    for (const w of src) {
      const a = Math.max(0, Math.floor(w.x0 / bin));
      const b = Math.min(n - 1, Math.floor(w.x1 / bin));
      for (let i = a; i <= b; i++) cover[i]++;
    }
    const sorted = Array.from(cover).filter(v => v > 0).sort((x, y) => x - y);
    const typical = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 1;
    const thr = typical >= 25 ? Math.round(typical * 0.04) : 0; // küçük listelerde tek sözcüklük uzantı da sütunun parçasıdır
    const minGap = Math.max(2, Math.round((width * 0.005) / bin));
    const out = [];
    let start = -1;
    let gapRun = 0;
    let lastInk = -1;
    for (let i = 0; i <= n; i++) {
      const ink = i < n && cover[i] > thr;
      if (ink) {
        if (start < 0) start = i;
        lastInk = i;
        gapRun = 0;
      } else if (start >= 0) {
        gapRun++;
        if (gapRun >= minGap || i >= n) {
          out.push([start * bin, (lastInk + 1) * bin]);
          start = -1;
        }
      }
    }
    const wide = out.filter(([a, b]) => b - a >= width * 0.03);
    // Çok az sözcük içeren bantlar (kenar gölgesi, cilt payı) sütun sayılmaz
    const counts = wide.map(([a, b]) => src.filter(w => cx(w) >= a && cx(w) <= b).length);
    const ref = median(counts);
    return wide.filter((_, i) => counts[i] >= Math.max(4, ref * 0.25));
  }

  /** Bir sütunun sözcüklerini y'ye göre satırlara böler. Düşük güvenli artık sözcükler atılır. */
  function lines(colWords, hMed) {
    const good = colWords.filter(w => w.c >= 45);
    const use = good.length >= colWords.length * 0.5 ? good : colWords;
    const sorted = use.slice().sort((a, b) => cy(a) - cy(b));
    const out = [];
    for (const w of sorted) {
      const last = out[out.length - 1];
      if (last && Math.abs(cy(w) - last.y) < hMed * 0.6) {
        last.words.push(w);
        last.y = (last.y * (last.words.length - 1) + cy(w)) / last.words.length;
      } else out.push({ y: cy(w), words: [w] });
    }
    for (const l of out) {
      l.words.sort((a, b) => a.x0 - b.x0);
      l.text = l.words.map(w => w.t).join(' ');
      l.conf = l.words.reduce((s, w) => s + w.c, 0) / l.words.length;
      l.box = { x0: Math.min(...l.words.map(w => w.x0)), y0: Math.min(...l.words.map(w => w.y0)), x1: Math.max(...l.words.map(w => w.x1)), y1: Math.max(...l.words.map(w => w.y1)) };
    }
    return out;
  }

  /** Sık aralıklı satırlar aynı hücrenin alt satırlarıdır (Türkçe anlam iki satıra taşabilir). */
  function cells(ls, gap) {
    const out = [];
    const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
    for (const l of ls) {
      const last = out[out.length - 1];
      if (last && l.y - last.lastY <= gap) {
        last.text += ` ${l.text}`;
        last.confs.push(l.conf);
        last.lastY = l.y;
        last.box = union(last.box, l.box);
      } else out.push({ y: l.y, lastY: l.y, text: l.text, confs: [l.conf], box: l.box });
    }
    return out.map(c => ({ y: c.y, text: c.text, box: c.box, conf: c.confs.reduce((a, b) => a + b, 0) / c.confs.length }));
  }

  const turkishScore = ls => ls.reduce((s, l) => s + (TR_CHAR.test(l.text) ? 1 : 0), 0) / Math.max(1, ls.length);

  /** İngilizce hücrelerini en yakın Türkçe hücreyle eşler (sayfa eğimi/kıvrımı için sabit kayma düzeltilir).
   *  Her satır, "büyütüp yeniden okuma" için hücre kutularını (enBox, trBox) taşır. engBand/trBand: sütun x aralıkları. */
  function pair(engLines, trLines, hMed, engBand, trBand) {
    if (!engLines.length) return [];
    const gaps = engLines.slice(1).map((l, i) => l.y - engLines[i].y).filter(g => g > 0);
    const rowH = quantile(gaps, 0.25) || hMed * 1.6; // tek satırlık normal satır yüksekliği
    const gap = Math.max(hMed * 1.15, rowH * 0.78);
    const eng = cells(engLines, gap);
    const tr = cells(trLines, gap);
    if (!eng.length) return [];

    const shifts = [];
    for (const e of eng) {
      let best = null;
      for (const t of tr) if (!best || Math.abs(t.y - e.y) < Math.abs(best.y - e.y)) best = t;
      if (best && Math.abs(best.y - e.y) < rowH * 0.5) shifts.push(best.y - e.y);
    }
    const shift = median(shifts);
    const pad = hMed * 0.5;

    const rows = eng.map(e => ({ en: e.text, tr: null, conf: e.conf, d: Infinity, y: e.y, enBox: e.box }));
    const orphans = [];
    for (const t of tr) {
      let bi = -1;
      let bd = Infinity;
      for (let i = 0; i < eng.length; i++) {
        const d = Math.abs(t.y - shift - eng[i].y);
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi < 0 || bd > rowH * 0.7) { orphans.push(t); continue; } // hizalı İngilizce karşılığı yok
      if (bd < rows[bi].d) { rows[bi].tr = t; rows[bi].d = bd; }
    }
    const out = rows.map(r => {
      // Türkçe hücre okunamadıysa: aynı satırın Türkçe sütunundaki şeridi kutu olarak ver
      const trBox = r.tr ? r.tr.box : { x0: trBand[0], y0: r.enBox.y0 + shift - pad, x1: trBand[1], y1: r.enBox.y1 + shift + pad };
      return { en: r.en, tr: r.tr ? r.tr.text : '', conf: r.tr ? (r.conf + r.tr.conf) / 2 : r.conf, y: r.y, enBox: r.enBox, trBox };
    });
    // İngilizce hücresi hiç okunamamış satırlar: Türkçesi elde, İngilizce kutusu sütun şeridi (yeniden okunacak)
    for (const t of orphans) {
      if (t.text.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length < 3) continue;
      out.push({ en: '', tr: t.text, conf: 0, y: t.y, trBox: t.box,
        enBox: { x0: engBand[0], y0: t.box.y0 - shift - pad, x1: engBand[1], y1: t.box.y1 - shift + pad } });
    }
    return out.sort((a, b) => a.y - b.y);
  }

  /**
   * words: [{t, c, x0, y0, x1, y1}], width: görüntü genişliği (dik hâle getirilmiş).
   * Dönen: { ok, rows: [{en, tr, conf}], columns }  ok=false ise tablo düzeni bulunamadı (düz metne dön).
   */
  function pairs(words, width) {
    const ws = usable(words);
    if (ws.length < 12) return { ok: false, rows: [], columns: 0 };
    const hMed = median(ws.map(w => w.y1 - w.y0));
    const cols = bands(ws, width);
    if (cols.length < 4 || cols.length % 2) return { ok: false, rows: [], columns: cols.length }; // tek çift: düz metin ayrıştırıcısı daha iyi

    const rows = [];
    for (let i = 0; i < cols.length; i += 2) {
      const inCol = c => ws.filter(w => cx(w) >= c[0] && cx(w) <= c[1]);
      let eng = lines(inCol(cols[i]), hMed);
      let tr = lines(inCol(cols[i + 1]), hMed);
      const swapped = turkishScore(eng) > turkishScore(tr) + 0.3;
      const [engBand, trBand] = swapped ? [cols[i + 1], cols[i]] : [cols[i], cols[i + 1]];
      rows.push(...pair(swapped ? tr : eng, swapped ? eng : tr, hMed, engBand, trBand));
    }
    const done = finish(rows);
    const trShare = done.filter(r => TR_CHAR.test(r.tr)).length / Math.max(1, done.length);
    return { ok: done.length >= 8 && trShare >= 0.05, rows: done, columns: cols.length };
  }

  const CAPS = /^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ.]*$/;

  /**
   * Eş anlamlı tabloları: siyah hücrelerdeki BÜYÜK HARFLİ Türkçe başlığın altında sıralanan İngilizce kelimeler.
   * Tesseract beyaz-siyah başlık yazısını da okuyor; başlıkları büyük harfli sözcüklerden kurup gövde sözcüklerini
   * aynı sütundaki, üstündeki en yakın başlığa bağlarız. Başlığı okunamayan sütunların kelimeleri atlanır (yanlış anlam yazmayalım).
   */
  function grid(words) {
    const valid = words.filter(w => w.t && w.t.trim() && w.x1 > w.x0).map(w => Object.assign({}, w, { t: w.t.trim() }));
    const ws = valid.filter(w => w.c >= 45);
    if (ws.length < 40) return { ok: false, rows: [] };
    const hMed = median(ws.map(w => w.y1 - w.y0));
    // Başlıklar ters renkte olduğu için güveni düşük çıkabilir; ama BÜYÜK HARFLİ olmaları onları ele verir.
    const isCap = w => w.c >= 25 && w.t.replace(/[^A-ZÇĞİÖŞÜa-zçğıöşü]/g, '').length >= 3 && CAPS.test(w.t.replace(/[&\-–—]/g, ''));
    const isConn = w => w.c >= 25 && /^[&\-–—]+$/.test(w.t); // "&", "-" bağlayıcıları başlığın parçasıdır
    const capWords = valid.filter(w => isCap(w) || isConn(w));
    if (capWords.filter(isCap).length < 8) return { ok: false, rows: [] };
    const capSet = new Set(capWords);

    // Başlık sözcüklerini hücrelere kümele: aynı satırda yakın olanlar + alt satıra taşan (x'te örtüşen) sözcükler
    const link = (a, b) => {
      const dy = Math.abs(cy(a) - cy(b));
      const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      if (dy < hMed * 0.7 && gap < hMed * 1.3) return true;
      const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      return dy >= hMed * 0.7 && dy < hMed * 2.2 && overlap > 0.25 * Math.min(a.x1 - a.x0, b.x1 - b.x0);
    };
    const parent = capWords.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < capWords.length; i++) {
      for (let j = i + 1; j < capWords.length; j++) if (link(capWords[i], capWords[j])) parent[find(i)] = find(j);
    }
    const groups = new Map();
    capWords.forEach((w, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(w); });
    const heads = [...groups.values()].filter(g => g.some(isCap)).map(g => {
      const ordered = lines(g, hMed).map(l => l.text).join(' ').replace(/\s+/g, ' ').replace(/\s*&\s*/g, ' & ');
      return {
        text: ordered,
        cx: g.reduce((s, w) => s + cx(w), 0) / g.length,
        cy: g.reduce((s, w) => s + cy(w), 0) / g.length,
        x0: Math.min(...g.map(w => w.x0)),
        x1: Math.max(...g.map(w => w.x1)),
      };
    });
    if (heads.length < 5) return { ok: false, rows: [] };

    // Başlık satırları (bloklar): y'ye göre kümeler; eğim yüzünden aynı satırda y biraz oynayabilir
    heads.sort((a, b) => a.cy - b.cy);
    const rowsOfHeads = [];
    for (const h of heads) {
      const last = rowsOfHeads[rowsOfHeads.length - 1];
      if (last && h.cy - last.cy < hMed * 4.5) { last.items.push(h); last.cy = last.items.reduce((s, x) => s + x.cy, 0) / last.items.length; }
      else rowsOfHeads.push({ cy: h.cy, items: [h] });
    }
    const pitchOf = items => {
      const xs = items.map(i => i.cx).sort((a, b) => a - b);
      return median(xs.slice(1).map((x, i) => x - xs[i])) || Infinity;
    };
    const allPitch = median(rowsOfHeads.filter(r => r.items.length > 2).map(r => pitchOf(r.items)));
    if (!Number.isFinite(allPitch) || !allPitch) return { ok: false, rows: [] };

    // Gövde: başlık olmayan, harfle başlayan sözcükler
    const body = ws.filter(w => !capSet.has(w) && /^[A-Za-zÇĞİÖŞÜçğıöşü(]/.test(w.t) && w.c >= 50);
    const cols = new Map(); // başlık -> gövde sözcükleri
    for (const w of body) {
      // sözcüğün üstündeki en yakın başlık satırı
      let row = null;
      for (const r of rowsOfHeads) if (r.cy < cy(w) - hMed * 0.3) row = r;
      if (!row) continue;
      let best = null;
      for (const h of row.items) {
        const dx = Math.abs(cx(w) - h.cx);
        if (dx < allPitch * 0.5 && (!best || dx < best.dx)) best = { h, dx };
      }
      if (!best) continue; // bu sütunun başlığı okunamadı: yanlış anlam yazmamak için atla
      if (!cols.has(best.h)) cols.set(best.h, []);
      cols.get(best.h).push(w);
    }

    const rows = [];
    for (const [h, col] of cols) {
      // Başlığın başında/sonunda bağlayıcı kalmışsa ilk/son sözcüğü okunamamış demektir: kullanıcı kontrol etsin
      const suspicious = /^[\s&\-–—]|[&\-–—]\s*$/.test(h.text);
      const meaning = trCase(h.text.replace(/^[\s&\-–—]+|[\s&\-–—]+$/g, ''));
      let prev = null;
      for (const l of lines(col, hMed)) {
        if (/^[(\[]/.test(l.text)) continue; // "(tartışma)" gibi açıklamalar
        if (prev && /^[a-zçğıöşü]/.test(l.text)) { prev.en += ` ${l.text}`; continue; } // alt satıra taşan ifade
        prev = { en: l.text, tr: meaning, conf: suspicious ? 40 : l.conf };
        rows.push(prev);
      }
    }
    const done = finish(rows);
    return { ok: done.length >= 15, rows: done, columns: heads.length, heads: heads.map(h => h.text) };
  }

  const trCase = s => {
    const t = s.toLocaleLowerCase('tr');
    return t.charAt(0).toLocaleUpperCase('tr') + t.slice(1);
  };

  const SHORT_EN = new Set(['to', 'of', 'in', 'on', 'at', 'by', 'up', 'as', 'be', 'do', 'go', 'so', 'no', 'it', 'if', 'or', 'an', 'a', 'i', 'sb', 'sth']);
  const SHORT_TR = new Set(['ve', 'ne', 'ya', 'bu', 'de', 'da', 'ki', 'mi', 'mı', 'e', 'a', 'i', 'ı', 'o', 'ö', 'u', 'ü', 'ek', 'ön', 'öz', 'çok', 'az', 'at', 'ay', 'el', 'ev', 'iş', 'us', 'en', 'şu', 'mu', 'mü', 'ol', 'it', 'ip', 'iz', 'ok', 'on', 'un', 'uç', 'üç']);

  /** Makul bir İngilizce kelime/ifade mi? OCR çöpünü ("rofo und ÇT", "ae") eler. */
  const plausibleEn = en => {
    if (!/^[A-Za-z][A-Za-z'’.\-\/() ]*$/.test(en)) return false;
    return en.split(' ').every(t => {
      if (t.length <= 2) return SHORT_EN.has(t.toLowerCase());
      return !/[a-z][A-Z]/.test(t) && !/[^aeiouy\W]{5,}/i.test(t) && /[aeiouy]/i.test(t);
    });
  };

  /** Makul bir Türkçe anlam mı? Boş anlam sorun sayılmaz (kullanıcı ayrıca uyarılır). */
  const plausibleTr = tr => {
    if (!tr) return true;
    const toks = tr.split(/[\s,;\/]+/).filter(Boolean);
    const anyLower = toks.some(t => /[a-zçğıöşü]/.test(t));
    return toks.every(t => {
      const bare = t.replace(/^-+|[().]+$/g, '');
      if (!bare) return true;
      if (/\d/.test(bare)) return false;
      if (/[a-zçğıöşü][A-ZÇĞİÖŞÜ]/.test(bare)) return false;                    // kelime ortasında büyük harf
      if (anyLower && bare.length >= 2 && bare === bare.toLocaleUpperCase('tr')) return false; // "DE svam eden"
      if (bare.length <= 2 && !SHORT_TR.has(bare.toLocaleLowerCase('tr'))) return false;
      if (bare.length >= 3 && !/[aeıioöuüAEIİOÖUÜ]/.test(bare)) return false;   // ünlüsüz
      return true;
    });
  };

  /** Metinleri temizler, çöp satırları eler, aynı kelimeyi birleştirir, güvensiz satırları `low` işaretler. */
  function finish(rows, final) {
    const out = [];
    const seen = new Map();
    for (const r of rows) {
      const en = Parser.cleanEn(r.en);
      const tr = Parser.cleanTr(r.tr);
      if (!en && r.enBox && tr && !final) { out.push({ en: '', tr, conf: 0, guess: false, low: true, enBox: r.enBox, trBox: r.trBox }); continue; }
      if (en.length < 2 || /^(unit|page|test|lesson|exercise|ünite|sayfa)\b/i.test(en)) continue;
      const key = en.toLowerCase();
      const dup = seen.get(key);
      if (dup) {
        if (tr && !dup.tr.toLowerCase().includes(tr.toLowerCase())) dup.tr = dup.tr ? `${dup.tr}; ${tr}` : tr;
        continue;
      }
      const row = { en, tr, conf: r.conf, guess: !!r.guess, enBox: r.enBox, trBox: r.trBox, zoomEn: r.zoomEn, zoomTr: r.zoomTr, low: r.conf < 55 || !plausibleEn(en) || !plausibleTr(tr) || !tr };
      seen.set(key, row);
      out.push(row);
    }
    return out;
  }

  return { pairs, grid, finish, bands, usable, plausibleEn, plausibleTr };
})();
