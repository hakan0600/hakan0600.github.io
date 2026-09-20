/* Otomatik eşitleme. Ana kaynak BİLGİSAYAR:
   - Bilgisayardaki uygulama (127.0.0.1) kelime içeriği değişince birkaç saniye sonra kendiliğinden başlatıcıya gönderir;
     başlatıcı GitHub'da GİZLİ bir dosyaya yazar (her ağdan okunabilir).
   - Telefon / başka cihaz (bir kez eşleştirilince) o dosyayı açılışta, geri gelince ve düzenli aralıklarla kendiliğinden okuyup yansıtır. */
const Sync = (() => {
  const role = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? 'pc' : 'device';
  const st = { last: 0, error: '' };
  let timer = 0;
  let busy = false;
  let etag = '';
  let etagFor = '';

  const hashOf = text => { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return String(h); };
  const words = () => Store.all().map(w => ({ en: w.en, tr: w.tr, list: w.list }));
  const info = () => ({ role, last: st.last, error: st.error, pairId: Store.settings().pairId || '', cloudId: Store.settings().cloudId || '' });

  /** Bilgisayar: değişen kelimeleri başlatıcıya (dolayısıyla buluta) gönder. force: içerik aynı olsa da gönder. */
  async function push(force) {
    if (role !== 'pc' || busy) return;
    busy = true;
    try {
      const list = words();
      const h = hashOf(JSON.stringify(list.map(w => [w.en, w.tr, w.list])));
      const s = Store.settings();
      if (!force && s.pairId && s.pushHash === h) return;
      const r = await fetch('__sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: 2, t: Date.now(), words: list }) });
      if (!r.ok) throw new Error(`başlatıcı yanıt vermedi (${r.status})`);
      const j = await r.json();
      if (j.gist) {
        Store.setSetting('pairId', j.gist);
        Store.setSetting('pushHash', h);
        st.last = Date.now();
        st.error = '';
      } else st.error = j.gistError ? `bulut: ${j.gistError}` : 'bulut bağlantısı yok';
    } catch (e) {
      st.error = String(e.message || e);
    } finally {
      busy = false;
    }
    if (st.error) { clearTimeout(timer); timer = setTimeout(() => push(), 60000); } // yeniden dene
  }

  function pushSoon() {
    if (role !== 'pc') return;
    clearTimeout(timer);
    timer = setTimeout(() => push(), 4000);
  }

  /** Telefon / başka cihaz: buluttaki listeyi oku ve yansıt. quiet=false ise sonuç bildirilir. */
  async function pull(loud) {
    const id = Store.settings().cloudId;
    if (role === 'pc' || !id || busy) return;
    busy = true;
    try {
      // GitHub yanıtları tarayıcıda 60 sn önbelleklenir: önbelleği atla, ETag ile koşullu iste (304 kotadan düşmez)
      const headers = { Accept: 'application/vnd.github+json' };
      if (etag && etagFor === id && !loud) headers['If-None-Match'] = etag;
      const r = await fetch(`https://api.github.com/gists/${id}`, { headers, cache: 'no-store' });
      if (r.status === 304) { st.last = Date.now(); st.error = ''; return; }
      if (!r.ok) throw new Error(r.status === 404 ? 'bağlantı geçersiz' : (r.status === 403 ? 'GitHub istek sınırı doldu, biraz sonra denenecek' : `GitHub yanıtı ${r.status}`));
      etag = r.headers.get('ETag') || '';
      etagFor = id;
      const g = await r.json();
      const f = g.files && (g.files['yokdil-kelimeler.json'] || Object.values(g.files)[0]);
      if (!f) throw new Error('bağlantıda kelime dosyası yok');
      const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
      const res = Store.mirror(JSON.parse(text).words);
      st.last = Date.now();
      st.error = '';
      const n = res.added + res.updated + res.removed;
      if (n) {
        const parts = [res.added && `${res.added} yeni`, res.updated && `${res.updated} güncellenen`, res.removed && `${res.removed} silinen`].filter(Boolean);
        toast(`Bilgisayardan ${parts.join(', ')} kelime (toplam ${Store.all().length})`, 4500);
        if (typeof route === 'function') route();
      } else if (loud) toast(`Güncel: ${Store.all().length} kelime`, 3000);
    } catch (e) {
      st.error = String(e.message || e);
      if (loud) toast(`Eşitlenemedi: ${st.error}`, 5000);
    } finally {
      busy = false;
    }
  }

  function start() {
    if (role === 'pc') {
      Store.onChange(pushSoon);
      setTimeout(() => push(), 3000);
      setInterval(() => push(), 10 * 60000);
      return;
    }
    setTimeout(() => pull(), 1500);
    setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 2 * 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  }

  return { role, info, push, pull, start };
})();
