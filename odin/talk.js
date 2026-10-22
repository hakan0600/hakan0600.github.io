/* İnsan dilinden Odin diline.
   Köpekler cümle anlamaz; sesleri olaylarla eşleştirir (tasma şıngırtısı = gezme, mama kabı = mama).
   Her konunun kendine ait bir ses imzası var. Çalma önceliği:
   1) senin o konu için kaydettiğin gerçek ses (tasma, mama kabı, oyuncak, ıslık),
   2) Odin'in dinlerken yakalanan kendi sesi,
   3) Barkopedia veri setinden seçilmiş gerçek köpek kayıtları. */
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const INTENTS = {
    praise: { label: 'Övgü',    words: /aferin|aferim|akıll?ı|güzel (oğlum|kızım|köpek|çocuk)|iyi (köpek|oğlan|kız|çocuk)|bravo|süpersin|tebrik/, dog: ['play'], cue: 'klik sesi ya da hep aynı "aferin" sözün', tip: 'Ödülü davranıştan sonraki 2 saniye içinde ver.' },
    love:   { label: 'Sevgi',   words: /sev|canım|tatlı|bebe|özle|kuzu|yakışıklı|öp/, dog: ['whine'], cue: 'öpücük sesi', tip: 'Okşamayla birleştir; ses ile dokunuş eşleşir.' },
    play:   { label: 'Oyun',    words: /oyna|oyun|top|koş|yakala|getir|hadi/, dog: ['pant', 'play'], cue: 'en sevdiği oyuncağın gıcırtısı', tip: 'Kayıttan sonra gerçekten oyna; ses oyunla eşleşir.' },
    calm:   { label: 'Sakin',   words: /sakin|geçti|korkma|yolunda|şşş|sus artık/, dog: ['sigh'], cue: 'yavaş bir "şşşş"', tip: 'Sesten sonra hareketlerini yavaşlat.' },
    come:   { label: 'Gel',     words: /\bgel\b|\bgel gel|buraya|yanıma/, dog: ['attn'], cue: 'ıslığın ya da dil şaklatman', tip: 'Geldiğinde hep ödül ver; bu ses ona "gelince güzel şey olur" demek olur.' },
    no:     { label: 'Hayır',   words: /hayır|yapma|\bdur\b|bırak|olmaz|yasak|in aşağı|kes şunu/, dog: ['sharp'], cue: 'parmak şıklatma ya da kısa "eh!"', tip: 'Kısa tut, sonra doğru davranışı göster.' },
    food:   { label: 'Mama',    words: /mama|yemek|ödül|acık|kemik/, dog: ['food'], cue: 'mama kabının ya da mama paketinin sesi', tip: 'Mamayı bu sesten hemen sonra ver; birkaç günde sesi tanır.' },
    walk:   { label: 'Gezme',   words: /gez|dışarı|yürü|tasma|park|sokak|tuvalet|çiş/, dog: ['excited'], cue: 'tasmanın ya da anahtarların şıngırtısı', tip: 'Sesten sonra gerçekten gezmeye çık.' },
    sleep:  { label: 'Uyku',    words: /uyu|iyi geceler|yat(ağa|alım)|dinlen|uykun/, dog: ['snore'], cue: 'yatağına vururken çıkan ses ya da sakin "şşş"', tip: 'Her gece aynı saatte, aynı ses.' },
    leave:  { label: 'Çıkış',   words: /gidiyorum|çıkıyorum|birazdan|geleceğim|dönerim|işe gid|evde kal/, dog: ['grunt'], cue: 'çıkarken hep söylediğin kısa söz', tip: 'Çıkışı abartma; sakin ayrılık kaygıyı azaltır.' },
    greet:  { label: 'Dönüş',   words: /geldim|günaydın|merhaba|selam|döndüm|özledin mi/, dog: ['woof', 'pant'], cue: 'kapının ya da anahtarının sesi', tip: 'Sakinleşince sev.' },
    water:  { label: 'Su',      words: /\bsu\b|susa|içmek/, dog: ['woof', 'food'], cue: 'su kabına su doldururken çıkan ses', tip: 'Pomeranian\'lar sıcağa hassastır; su hep dolu olsun.' },
    vet:    { label: 'Güven',   words: /banyo|veteriner|aşı|tırnak|tarak|ilaç|korkuyor|korktun/, dog: ['whine', 'sigh'], cue: 'sakinleştiren sözün', tip: 'Her küçük adımda ödül ver.' },
    car:    { label: 'Araba',   words: /araba|araç|yolculu|binelim/, dog: ['excited', 'pant'], cue: 'araba anahtarı ya da kapı sesi', tip: 'İlk yolculuklar kısa ve güzel bir yerde bitsin.' },
    guest:  { label: 'Misafir', words: /misafir|gelen var|kapı|zil|tanıdık|arkadaş/, dog: ['sharp', 'sigh'], cue: '"tamam, gördüm" sözün', tip: 'Haber verdiği için bir kez teşekkür et, sonra sakin ol.' },
    sit:    { label: 'Otur',    words: /otur|bekle|yat|kal/, dog: ['woof'], cue: '"otur" sözün', tip: 'El işaretiyle birleştir, yaptığında öv.' },
  };
  const intentOf = text => {
    const t = text.toLocaleLowerCase('tr-TR');
    const order = ['sleep', 'leave', 'greet', 'vet', 'guest', 'car', 'water', 'walk', 'food', 'no', 'calm', 'come', 'sit', 'play', 'praise', 'love'];
    for (const k of order) if (INTENTS[k].words.test(t)) return k;
    return 'free';
  };

  // ---------- köpek sesleri (gerçek kayıtlar) ----------
  // ses türü -> Odin'in kendi kayıtlarından hangi anlamlar uygun
  const OWN = { play: ['play'], whine: ['need'], pant: ['laugh'], sigh: ['sigh'], attn: ['attn'], sharp: ['alarm'], food: ['food'],
    excited: ['play'], snore: ['snore'], grunt: ['grunt'], woof: ['attn', 'alarm'] };
  let stock = null;
  const stockList = () => stock ||= fetch('sesler/index.json').then(r => r.json()).catch(() => ({}));
  async function clipFor(k) {
    const own = await window.OdinSounds?.getOwn(OWN[k] || []);
    if (own) return { url: URL.createObjectURL(own), own: true };
    const list = (await stockList())[k] || [];
    return list.length ? { url: 'sesler/' + list[Math.floor(Math.random() * list.length)], own: false } : null;
  }
  function play(url) {
    return new Promise(res => {
      const a = new Audio(url); a.onended = a.onerror = () => res(); a.play().catch(() => res());
      setTimeout(res, 6000);
    });
  }
  async function playDog(list) {
    let usedOwn = false;
    for (const k of list) { const c = await clipFor(k); if (c) { usedOwn ||= c.own; await play(c.url); await wait(150); } }
    return usedOwn;
  }

  // tanınmayan cümle: sıcak, yumuşak soluma
  const FREE = () => ({ label: 'Genel (sevgi tonu)', dog: ['pant'], cue: null,
    tip: 'Odin cümleyi değil sesi tanır. Aynı durumda hep aynı şeyi söylersen, çalınan köpek sesini o durumla eşleştirir.' });
  let current = null;
  async function translate(text) {
    const k = intentOf(text), it = k === 'free' ? FREE() : INTENTS[k];
    current = k;
    $('#tOut').hidden = false;
    $('#tHeard').textContent = `“${text}”`;
    $('#tIntent').textContent = it.label;
    const cue = k !== 'free' ? await window.OdinSounds?.getCue(k) : null;
    const own = window.OdinSounds?.ownCount() || 0;
    $('#tDog').textContent = cue ? 'senin kaydettiğin ses' : it.dog.map(d => DOGNAME[d]).join(' + ') + (own ? ' (varsa Odin\'in kendi sesi)' : ' (gerçek köpek kaydı)');
    $('#tTip').textContent = it.tip;
    $('#tCue').hidden = !it.cue;
    if (it.cue) {
      $('#tCueHint').textContent = `Odin'in gerçekten tanıyacağı ses: ${it.cue}. Bas, basılı tutarken sesi çıkar, bırak.`;
      $('#tCueRec').textContent = cue ? `"${it.label}" sesini yeniden kaydet` : `"${it.label}" için ses kaydet`;
      $('#tCueDel').hidden = !cue;
    }
    window.OdinMute?.(60000);
    if (cue) await play(URL.createObjectURL(cue));
    else await playDog(it.dog);   // Odin yalnız köpek sesi duyar
    window.OdinMute?.(500);
  }

  // konu için gerçek ses kaydı (basılı tut)
  let crec = null;
  async function cueStart() {
    if (crec || !current || current === 'free') return;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const mr = new MediaRecorder(st), parts = [], k = current;
      mr.ondataavailable = e => e.data.size && parts.push(e.data);
      mr.onstop = async () => {
        st.getTracks().forEach(t => t.stop());
        const blob = new Blob(parts, { type: mr.mimeType || 'audio/webm' });
        crec = null; $('#tCueRec').classList.remove('rec');
        if (blob.size > 2000) { await window.OdinSounds?.putCue(k, blob); $('#tCueRec').textContent = 'Kaydedildi. Artık bu konu için bu ses çalacak'; $('#tCueDel').hidden = false; }
        else $('#tCueRec').textContent = 'Çok kısa oldu, basılı tutarak tekrar dene';
      };
      crec = { mr, t: setTimeout(cueStop, 6000) };
      window.OdinMute?.(7000);
      mr.start(); $('#tCueRec').classList.add('rec'); $('#tCueRec').textContent = 'Kaydediyor… sesi çıkar, sonra bırak';
    } catch { $('#tCueRec').textContent = 'Mikrofon izni yok'; }
  }
  function cueStop() { if (crec && crec.mr.state === 'recording') { clearTimeout(crec.t); crec.mr.stop(); } }
  const cb = $('#tCueRec');
  cb.onpointerdown = e => { e.preventDefault(); cueStart(); };
  cb.onpointerup = cb.onpointerleave = cb.onpointercancel = cueStop;
  cb.oncontextmenu = e => e.preventDefault();
  $('#tCueDel').onclick = async () => { if (current) { await window.OdinSounds?.delCue(current); $('#tCueDel').hidden = true; $('#tCueRec').textContent = 'Silindi. Köpek kaydı çalacak'; } };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const DOGNAME = { play: 'neşeli oyun havlaması', whine: 'sevgi inlemesi', pant: 'köpek gülmesi (soluma)', sigh: 'sakin iç çekme', attn: 'çağrı havlaması', sharp: 'kısa sert havlama', food: 'mama dilenme havlaması', excited: 'heyecanlı seri havlama', snore: 'horlama', grunt: 'memnun homurtu', woof: 'tek kalın havlama' };

  // ---------- konuşma tanıma ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  $('#tMic').onclick = () => {
    if (!SR) { $('#tMic').textContent = 'Bu tarayıcı dinleyemiyor, yaz'; $('#tText').focus(); return; }
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'tr-TR'; rec.interimResults = true; rec.maxAlternatives = 1;
    window.OdinMute?.(15000);
    $('#tMic').classList.add('rec'); $('#tMic').textContent = 'Dinliyorum… konuş';
    let final = '';
    rec.onresult = e => { const r = e.results[e.results.length - 1]; $('#tText').value = r[0].transcript; if (r.isFinal) final = r[0].transcript; };
    rec.onend = () => {
      rec = null; $('#tMic').classList.remove('rec'); $('#tMic').textContent = 'Konuş, çevireyim';
      window.OdinMute?.(300);
      if (final.trim()) translate(final.trim());
    };
    rec.onerror = () => { $('#tMic').textContent = 'Duyamadım, tekrar dene'; };
    rec.start();
  };
  $('#tForm').onsubmit = e => { e.preventDefault(); const v = $('#tText').value.trim(); if (v) translate(v); };
  document.querySelectorAll('[data-say]').forEach(b => b.onclick = () => { $('#tText').value = b.dataset.say; translate(b.dataset.say); });

})();
