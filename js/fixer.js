/* Okunamayan / şüpheli satırları İNTERNETSİZ düzeltir: gömülü sözlük (vendor/lex) ile
   - İngilizcesi okunamayan satır: Türkçe anlamından ve bozuk yazımının benzerliğinden doğru kelime bulunur,
   - Türkçesi okunamayan/boş satır: İngilizce kelimenin sözlükteki anlamı yazılır,
   - "dogru" gibi harf işareti kayıpları sözlükteki yazımla onarılır. */
const Fixer = (() => {
  let L = null;
  let loading = null;

  const foldTr = s => String(s || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase().replace(/ı/g, 'i')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '');
  const lowTr = s => String(s || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr');
  const SHORT_TR = new Set(['ve', 'ne', 'ya', 'bu', 'de', 'da', 'ki', 'mi', 'mı', 'e', 'a', 'i', 'ı', 'o', 'ö', 'u', 'ü', 'ek', 'ön', 'öz', 'az', 'at', 'ay', 'el', 'ev', 'iş', 'us']);

  async function load() {
    if (L) return L;
    if (loading) return loading;
    const base = new URL('vendor/lex/', location.href).href;
    loading = (async () => {
      const [gl, en, tr] = await Promise.all([
        fetch(base + 'en-tr.json').then(r => r.json()),
        fetch(base + 'en.txt').then(r => r.text()),
        fetch(base + 'tr.txt').then(r => r.text()),
      ]);
      const enList = en.split('\n');
      const trList = tr.split('\n');
      const byLen = list => {
        const m = new Map();
        list.forEach((w, rank) => { if (!m.has(w.length)) m.set(w.length, []); m.get(w.length).push([w, rank]); });
        return m;
      };
      const trFold = new Map();
      trList.forEach(w => { const f = foldTr(w); if (!trFold.has(f)) trFold.set(f, []); trFold.get(f).push(w); });
      // Sözlükten: başlık -> anlam sözcükleri (aşağı harf, harf işaretli) ve ters dizin (anlam sözcüğü -> başlıklar)
      const glossTok = new Map();
      const rev = new Map();
      for (const [head, gls] of Object.entries(gl)) {
        const toks = new Set();
        for (const g of gls) for (const t of g.match(/[a-zçğıöşü]+/g) || []) if (t.length >= 3) toks.add(t);
        glossTok.set(head, toks);
        for (const t of toks) {
          const k = foldTr(t);
          if (!rev.has(k)) rev.set(k, []);
          if (rev.get(k).length < 60) rev.get(k).push(head);
        }
      }
      L = { gl, glossTok, rev, enSet: new Set(enList), enLen: byLen(enList), trSet: new Set(trList), trFold, trLen: byLen(trList) };
      return L;
    })();
    return loading;
  }

  /** Düzenleme uzaklığı; max'ı aşarsa max+1 döner. */
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        cur.push(v);
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  function near(s, buckets, max) {
    const out = [];
    for (let l = s.length - max; l <= s.length + max; l++) {
      for (const [w, rank] of buckets.get(l) || []) {
        const d = lev(s, w, max);
        if (d <= max) out.push({ w, d, rank });
      }
    }
    return out.sort((a, b) => a.d - b.d || a.rank - b.rank);
  }

  const sameStem = (a, b) => { const n = Math.min(5, a.length, b.length); return n >= 3 && a.slice(0, n) === b.slice(0, n); };

  /** Türkçe belirteçlerin (0..1) ne kadarı bu İngilizce başlığın sözlük anlamlarıyla örtüşüyor. */
  function consistency(head, trToks) {
    const g = L.glossTok.get(head);
    if (!g || !trToks.length) return 0;
    let hit = 0;
    for (const t of trToks) for (const x of g) if (foldTr(x) === t || sameStem(foldTr(x), t)) { hit++; break; }
    return hit / trToks.length;
  }

  const trTokensOf = tr => (lowTr(tr).match(/[a-zçğıöşü]+/g) || []).map(foldTr).filter(t => t.length >= 3);

  /** Bozuk Türkçe metni onarır: harf işareti geri gelir, çöp belirteçler atılır. head varsa sözlük anlamları öncelikli. */
  function cleanTr(tr, head) {
    const gtoks = head ? L.glossTok.get(head) : null;
    const gFold = new Map();
    if (gtoks) for (const t of gtoks) gFold.set(foldTr(t), t);
    const segs = String(tr || '').split(/\s*[,;]\s*/);
    const out = [];
    for (const seg of segs) {
      const words = [];
      for (const raw of seg.split(/\s+/)) {
        const lead = /^-/.test(raw) ? '-' : '';
        const tok = lowTr(raw.replace(/[^A-Za-zÇĞİÖŞÜçğıöşüı]/g, ''));
        if (!tok) continue;
        if (tok.length === 1) { if (lead) words.push(lead + tok); continue; }
        if (tok.length === 2) { if (SHORT_TR.has(tok)) words.push(lead + tok); continue; }
        const f = foldTr(tok);
        if (gFold.has(f)) { words.push(lead + gFold.get(f)); continue; }        // sözlükteki yazımı
        if (L.trSet.has(tok)) { words.push(lead + tok); continue; }
        const alt = L.trFold.get(f);
        if (alt) { words.push(lead + alt[0]); continue; }                       // harf işareti geri
        if (tok.length >= 5) {
          const n = near(f, L.trLen, 1).find(c => foldTr(c.w) !== f || true);
          if (n) { words.push(lead + n.w); continue; }
        }
        if (/[aeıioöuü]/.test(tok) && tok.length >= 4) words.push(lead + tok);   // bilinmeyen ama sözcük gibi: dokunma
      }
      if (words.length) out.push(words.join(' '));
    }
    return out.join(', ');
  }

  /** Harfler arasındaki farkı yalnızca sözlükteki anlamla doğrulayarak onarır ("Kalitsal" -> "Kalıtsal"); başka hiçbir şeye dokunmaz. */
  function restoreDiacritics(tr, head) {
    const g = L.glossTok.get(head);
    if (!g) return tr;
    const map = new Map();
    for (const t of g) map.set(foldTr(t), t);
    return tr.replace(/[A-Za-zÇĞİÖŞÜçğıöşüı]+/g, w => {
      const lw = lowTr(w);
      if (lw.length < 3 || g.has(lw) || /[çğıöşü]/.test(lw)) return w; // zaten işaretli yazılmış: dokunma (sözlükte yazım hatası olabilir)
      const alt = map.get(foldTr(lw));
      if (!alt || alt === lw || !/[çğıöşü]/.test(alt)) return w;
      return /^[A-ZÇĞİÖŞÜ]/.test(w) ? cap(alt) : alt;
    });
  }

  /** Bilinmeyen Türkçe sözcük sayısı. Uzun (7+ harf) tek sözcükler çekimli/birleşik olabilir; minLen ile sayılmaz. */
  const unknownCount = (tr, head, ignoreFrom = 99) => {
    const g = head ? L.glossTok.get(head) : null;
    return (lowTr(tr).match(/[a-zçğıöşü]{3,}/g) || []).filter(t => t.length < ignoreFrom && !L.trSet.has(t) && !(g && g.has(t))).length;
  };

  /** Sözlükten en fazla 3 kısa anlam (uzun açıklama cümleleri atılır). */
  const shortGlosses = head => {
    const g = L.gl[head].filter(x => x.length <= 22 && x.split(' ').length <= 3);
    return (g.length ? g : L.gl[head]).slice(0, 3).join(', ');
  };

  const cap = s => (s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s);

  /** Tek satırı düzeltir; satırı yerinde günceller. Dönüş: değişti mi. */
  function fixRow(row) {
    const enRaw = String(row.en || '').toLowerCase().replace(/[^a-z' \-]/g, ' ').replace(/\s+/g, ' ').trim();
    const trToks = trTokensOf(row.tr);
    const variants = [...new Set([enRaw, enRaw.replace(/ /g, '')])].filter(v => v.length >= 2);
    // "divine ivi": ilk sözcük uzun ve bilinen, kalanlar 1-3 harflik artıksa ilk sözcük asıl kelimedir
    const parts = enRaw.split(' ');
    if (parts.length > 1 && parts[0].length >= 4 && parts.slice(1).every(t => t.length <= 3)) variants.push(parts[0]);
    const known = v => L.gl[v] || L.enSet.has(v);
    let en = variants.find(known) || null;
    let fixedEn = false;

    if (!en) {
      const plausible = Layout.plausibleEn(row.en);
      const cands = new Map();
      for (const v of variants) {
        const max = v.length <= 4 ? 1 : v.length <= 7 ? 2 : 3;
        for (const c of near(v, L.enLen, max)) {
          const sim = 1 - c.d / Math.max(v.length, c.w.length);
          if (!cands.has(c.w) || cands.get(c.w).sim < sim) cands.set(c.w, { w: c.w, sim, rank: c.rank });
        }
      }
      // Türkçe anlamı dayanak: anlam sözcüklerinden başlıklara ters arama
      const v0 = variants[variants.length - 1] || '';
      for (const t of trToks) {
        for (const h of L.rev.get(t) || []) {
          if (!/^[a-z]+$/.test(h)) continue;
          const d = lev(v0, h, 4);
          if (d <= 4 && !cands.has(h)) cands.set(h, { w: h, sim: 1 - d / Math.max(v0.length, h.length), rank: 9e5 });
        }
      }
      let best = null;
      for (const c of cands.values()) {
        const cons = consistency(c.w, trToks);
        const score = 0.6 * c.sim + 0.8 * cons - c.rank * 1e-7;
        const ok = plausible ? (c.sim >= 0.8 && cons > 0) : (c.sim >= 0.5 || (cons > 0 && c.sim >= 0.3));
        if (ok && (!best || score > best.score)) best = { w: c.w, score };
      }
      if (best) { en = best.w; fixedEn = true; }
    }

    const finalEn = en || row.en;
    let tr = row.tr || '';
    let fixedTr = false;
    const head = en && L.gl[en] ? en : null;
    const cleaned = cleanTr(tr, head);
    if (cleaned && cleaned !== tr) { tr = cleaned; fixedTr = true; }

    // Bilinmeyen (okunamamış) parçalar içeren anlam öbekleri: en yakın sözlük anlamıyla değiştir, bulunamazsa at
    if (head) {
      const gl = L.gl[head].filter(x => x.length <= 22);
      const gTok = L.glossTok.get(head);
      const parts = [];
      for (const seg of tr.split(/\s*,\s*/).filter(Boolean)) {
        const toks = lowTr(seg).match(/[a-zçğıöşü]{3,}/g) || [];
        if (!toks.some(t => !L.trSet.has(t) && !gTok.has(t))) { parts.push(seg); continue; }
        if (toks.length === 1 && toks[0].length >= 7) { parts.push(seg); continue; } // tek uzun sözcük (birleşik/çekimli olabilir): doğru say
        const f = foldTr(seg).replace(/ /g, '');
        const lim = Math.max(3, Math.floor(f.length / 3));
        let best = null;
        for (const g of gl) {
          const d = lev(f, foldTr(g).replace(/ /g, ''), lim);
          if (d <= lim && (!best || d < best.d)) best = { g, d };
        }
        if (best) parts.push(best.g);
      }
      const joined = [...new Set(parts)].join(', ');
      if (joined !== tr) { tr = joined; fixedTr = true; }
    }

    // Okunan Türkçe sözlük anlamlarıyla hiç örtüşmüyor ve kısa/bozuksa: sözlükteki anlamı yaz
    if (head) {
      const cons = consistency(head, trTokensOf(tr));
      const letters = tr.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length;
      const broken = !tr || !Layout.plausibleTr(tr) || letters < 3 || (cons === 0 && letters < 8);
      if (broken) { tr = shortGlosses(head); fixedTr = true; row.fromDict = true; }
    }
    if (finalEn === row.en && tr === (row.tr || '')) return false;
    row.en = finalEn;
    row.tr = cap(tr);
    if (fixedEn) row.fixedEn = true;
    if (fixedTr) row.fixedTr = true;
    return true;
  }

  /**
   * rows: [{en, tr, low, conf...}]. Şüpheli (low) veya anlamsız satırları düzeltir; diğerlerine yalnızca güvenli
   * harf-işareti onarımı yapar. low=false olan (düzelen) satırlar seçili gelir.
   */
  async function fixRows(rows, onStatus) {
    try { await load(); } catch (e) { return { fixed: 0, unavailable: true }; }
    onStatus?.('Şüpheli satırlar sözlükle düzeltiliyor…');
    let fixed = 0;
    for (const row of rows) {
      const suspicious = row.low || !row.tr;
      if (suspicious) {
        const before = `${row.en}|${row.tr}`;
        const orig = { en: row.en, tr: row.tr };
        if (fixRow(row)) {
          const good = Layout.plausibleEn(row.en) && row.tr && (row.fromDict || (Layout.plausibleTr(row.tr) && unknownCount(row.tr, String(row.en).toLowerCase(), 7) === 0));
          if (good) { row.low = false; if (`${row.en}|${row.tr}` !== before) fixed++; }
          else { Object.assign(row, orig); delete row.fixedEn; delete row.fixedTr; delete row.fromDict; } // düzelmedi: uydurma değil, okunanı göster
        }
      } else if (row.tr) {
        // emin olunan satırlara yalnızca sözlükle doğrulanan harf işareti onarımı
        const head = L.gl[String(row.en).toLowerCase()] ? String(row.en).toLowerCase() : null;
        if (head) row.tr = restoreDiacritics(row.tr, head);
      }
    }
    return { fixed };
  }

  /** Anlamı boş satırların anlamını sözlükten doldurur (İngilizce kelime sözlükte varsa). */
  async function fillMissing(rows) {
    try { await load(); } catch (e) { return 0; }
    let n = 0;
    for (const r of rows) {
      const head = String(r.en || '').toLowerCase().trim();
      if (r.include && !String(r.tr || '').trim() && L.gl[head]) { r.tr = cap(shortGlosses(head)); r.auto = true; n++; }
    }
    return n;
  }

  return { load, fixRows, fillMissing, fixRow, _lev: lev };
})();
