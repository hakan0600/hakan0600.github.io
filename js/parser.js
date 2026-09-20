/* Kelime listesi metnini (fotoğraf OCR çıktısı veya yapıştırılan metin) İngilizce–Türkçe çiftlerine ayırır. */
const Parser = (() => {
  const TR_CHAR = /[çğıöşüÇĞİÖŞÜ]/;
  const TR_ENDING = /\w(mak|mek)\b/i;
  // Ayırıcı yokken "carry out yerine getirmek" gibi satırlarda İngilizce kısma eklenen edat/zamirler.
  const PARTICLES = new Set([
    'to', 'of', 'up', 'out', 'on', 'off', 'in', 'into', 'onto', 'with', 'without', 'by', 'for', 'at', 'over',
    'down', 'away', 'from', 'about', 'after', 'back', 'through', 'against', 'along', 'around', 'across',
    'under', 'upon', 'sb', 'sth', 'oneself', 'someone', 'something',
  ]);
  const POS_WORDS = 'v|n|adj|adv|prep|conj|pron|phr|vt|vi|noun|verb|adjective|adverb|phr\\.?\\s*v';
  const POS_BRACKET = new RegExp(`[\\(\\[\\{]\\s*(?:${POS_WORDS})\\.?\\s*[\\)\\]\\}]`, 'ig');
  const POS_BARE = new RegExp(`(^|\\s)(?:${POS_WORDS})\\.(?=\\s|$)`, 'ig');
  const HEADER = /^(unit|page|test|lesson|exercise|ünite|sayfa|bölüm|alıştırma|kelime listesi|word list)\b/i;
  const BULLET = /^\s*(?:\d{1,4}\s*[.)\]]\s*|[A-Za-z]\s*\)\s+|[•*·▪●■□○◦▶►]+\s*|-\s+)/;

  // Sırayla denenen ayırıcılar: ilk eşleşen, İngilizce tarafı geçerli olanı kazanır.
  const SEPARATORS = [
    /\s*(?::|=>|->|=|→|\|)\s*/,
    /\s+[-–—]+\s+/,
    /\s*[\(\[\{]\s*(?:v|n|adj|adv|prep|conj|pron|phr|vt|vi|noun|verb|adjective|adverb|phr\.?\s*v)\.?\s*[\)\]\}]\s*/i,
    /\s(?:v|n|adj|adv|prep|conj)\.\s+/i,
    /\t+|\s{2,}/,
  ];

  // OCR "(adj.)" yerine "(adi.)", "(V.)" gibi okuyabilir: kısa parantezli her etiketi sözcük türü sayarız ("sb/sth" hariç).
  const SHORT_BRACKET = /[\(\[\{]\s*([A-Za-z]{1,5})\.?\s*[\)\]\}]/g;
  const stripPos = s => s
    .replace(POS_BRACKET, ' ')
    .replace(SHORT_BRACKET, (m, w) => (/^(sb|sth|one)$/i.test(w) ? m : ' '))
    .replace(POS_BARE, ' ');
  const tidy = s => s.replace(/\s+/g, ' ').trim();

  function cleanEn(s) {
    s = tidy(stripPos(s)).replace(/\s+[b-hj-z]$/i, ''); // ayırıcıdan önce sızan tek harflik OCR artığı ("consequently o")
    s = s.replace(/^[^A-Za-z]+|[\s.,;:'’"“”]+$/g, '');
    if (!/\(/.test(s)) s = s.replace(/[\s.)\]}]+$/, ''); // OCR'ın bıraktığı yetim ". )" artığı
    if (/^[A-Z][a-z]/.test(s)) s = s[0].toLowerCase() + s.slice(1);
    return s;
  }

  function cleanTr(s) {
    s = tidy(stripPos(s)).replace(/^[\s.,;:\-–—=|)\]}]+|[\s,;:\-–—|]+$/g, '');
    return s;
  }

  function isEnglish(s) {
    s = tidy(stripPos(s));
    if (!s || TR_CHAR.test(s) || TR_ENDING.test(s)) return false;
    if (!/^[A-Za-z][A-Za-z'’\-.\/() ]*$/.test(s)) return false;
    return s.split(' ').length <= 6;
  }

  const hasTurkish = s => TR_CHAR.test(s) || TR_ENDING.test(s);

  function trySplit(line) {
    for (const sep of SEPARATORS) {
      const m = sep.exec(line);
      if (!m) continue;
      const left = line.slice(0, m.index);
      const right = line.slice(m.index + m[0].length);
      if (!left.trim() || !right.trim()) continue;
      if (isEnglish(left)) return { en: left, tr: right };
      // "terk etmek : abandon" gibi ters sıralı listeler
      if (hasTurkish(left) && isEnglish(right)) return { en: right, tr: left };
    }
    return null;
  }

  // Ayırıcısız satır: ilk sözcük (+ edatlar) İngilizce, kalanı Türkçe kabul edilir. Kullanıcı onay ekranında görür.
  function guessSplit(line) {
    const tokens = line.split(' ');
    if (!/^[A-Za-z][A-Za-z'’\-]*$/.test(tokens[0])) return null;
    let i = 1;
    while (i < tokens.length - 1 && PARTICLES.has(tokens[i].toLowerCase())) i++;
    if (i >= tokens.length) return { en: line, tr: '', guess: true };
    return { en: tokens.slice(0, i).join(' '), tr: tokens.slice(i).join(' '), guess: true };
  }

  function parse(text) {
    const entries = [];
    const seen = new Map();
    let skipped = 0;

    for (let raw of String(text || '').split(/\r?\n/)) {
      let line = raw.replace(/[‐-―−]/g, '-').replace(/[ ​]/g, ' ');
      line = line.replace(BULLET, '');
      if (!/[A-Za-zÇĞİÖŞÜçğıöşü]{2}/.test(line) || HEADER.test(line.trim())) { skipped++; continue; }
      const tidyLine = line.replace(/^\s+|\s+$/g, '');

      let pair = trySplit(tidyLine);
      if (!pair) {
        const prev = entries[entries.length - 1];
        // Bir önceki anlamın alt satıra taşan devamı
        if (prev && prev.tr && /^[a-zçğıöşü]/.test(tidyLine) && hasTurkish(tidyLine) && !isEnglish(tidyLine)) {
          prev.tr = cleanTr(`${prev.tr}${prev.open ? ', ' : ' '}${tidyLine}`);
          prev.open = /[,;]\s*$/.test(tidyLine);
          continue;
        }
        pair = guessSplit(tidy(tidyLine));
      }
      if (!pair) { skipped++; continue; }

      const en = cleanEn(pair.en);
      const tr = cleanTr(pair.tr);
      if (en.length < 2) { skipped++; continue; }

      const key = en.toLowerCase();
      if (seen.has(key)) {
        const first = seen.get(key);
        if (tr && first.tr && !first.tr.includes(tr)) first.tr = `${first.tr}, ${tr}`;
        else if (tr && !first.tr) first.tr = tr;
        continue;
      }
      const entry = { en, tr, guess: !!pair.guess, open: /[,;]\s*$/.test(pair.tr) };
      seen.set(key, entry);
      entries.push(entry);
    }
    for (const e of entries) delete e.open;
    return { entries, skipped };
  }

  return { parse, isEnglish, hasTurkish, cleanEn, cleanTr };
})();
