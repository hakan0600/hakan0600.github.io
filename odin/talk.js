/* İnsan dilinden Odin diline.
   Köpekler kelimenin anlamını değil tonu, kısalığı, tekrarı ve tanıdık sesleri anlar. Söyleneni niyete çevirir
   (övgü, sevgi, oyun, sakin, gel, hayır, mama, gezme, otur), sonra:
   1) köpeğe yönelik tonda kısa bir işaret cümlesi (varsa sahibin kaydı),
   2) isteğe bağlı gerçek köpek sesi: önce Odin'in kendi kaydı, yoksa Barkopedia veri setinden gerçek kayıt.
   Alarm/tehdit havlaması bilerek yok: köpeği strese sokar. */
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const INTENTS = {
    praise: { label: 'Övgü',     words: /aferin|aferim|akıll?ı|güzel (oğlum|kızım|köpek|çocuk)|iyi (köpek|oğlan|kız|çocuk)|bravo|süpersin|tebrik/, say: n => `Aferiiin ${n}! Aferin!`, pitch: 1.7, rate: 0.85, clip: 'good', dog: ['laugh'], tip: 'Övgüyü davranıştan hemen sonra (2 saniye içinde) söyle.' },
    love:   { label: 'Sevgi',    words: /sev|canım|tatlı|bebe|özle|kuzu|yakışıklı|öp/, say: n => `${n}... canım benim. Seni seviyorum.`, pitch: 1.5, rate: 0.8, clip: 'love', dog: ['laugh'], tip: 'Yumuşak ve yavaş konuş; göz teması ve okşamayla birleştir.' },
    play:   { label: 'Oyun',     words: /oyna|oyun|top|koş|yakala|getir|hadi/, say: n => `${n}! Hadi hadi! Oyun!`, pitch: 1.8, rate: 1.05, clip: 'play', dog: ['laugh', 'playbark'], tip: 'Kollarını aç, öne eğil: köpeklerin oyun selamını taklit et.' },
    calm:   { label: 'Sakin',    words: /sakin|geçti|korkma|yolunda|şşş|sus artık/, say: n => `Şşşş... sakin ${n}. Sakin.`, pitch: 0.9, rate: 0.7, clip: 'calm', dog: ['sigh'], tip: 'Alçak ve yavaş konuş, hareketlerini yavaşlat, yüzüne eğilme.' },
    come:   { label: 'Gel',      words: /\bgel\b|\bgel gel|buraya|yanıma/, say: n => `${n}, gel! Gel gel gel!`, pitch: 1.7, rate: 1.0, dog: ['yip'], tip: 'Geldiğinde mutlaka ödüllendir; "gel" sonrası asla azarlama.' },
    no:     { label: 'Hayır',    words: /hayır|yapma|\bdur\b|bırak|olmaz|yasak|in aşağı|kes şunu/, say: () => 'Hayır.', pitch: 0.75, rate: 0.9, dog: ['sharp'], tip: 'Tek kelime, alçak ve kısa. Bağırma; sonra doğru davranışı göster ve öv.' },
    food:   { label: 'Mama',     words: /mama|yemek|ödül|acık|kemik/, say: n => `Mama mı ${n}? Mama!`, pitch: 1.6, rate: 0.95, dog: ['playbark'], tip: 'Mamadan önce "otur" iste: sakin bekleyince ver.' },
    walk:   { label: 'Gezme',    words: /gez|dışarı|yürü|tasma|park|sokak|tuvalet|çiş/, say: n => `Gezmeye mi gidiyoruz ${n}? Hadi gezmeye!`, pitch: 1.7, rate: 1.0, dog: ['laugh', 'playbark'], tip: 'Tasmayı göstererek aynı kelimeyi kullan; Odin kelimeyi tasmayla eşleştirir.' },
    sleep:  { label: 'Uyku',     words: /uyu|iyi geceler|yat(ağa|alım)|dinlen|uykun/, say: n => `İyi geceler ${n}... uyu bakalım.`, pitch: 1.0, rate: 0.65, clip: 'calm', dog: ['sigh'], tip: 'Yatmadan önce hep aynı sözü ve aynı sakin tonu kullan; rutin Odin\'i rahatlatır.' },
    leave:  { label: 'Çıkış',    words: /gidiyorum|çıkıyorum|birazdan|geleceğim|dönerim|işe gid|evde kal/, say: n => `${n}, birazdan geleceğim. Evde kal.`, pitch: 1.0, rate: 0.85, dog: ['sigh'], tip: 'Çıkışı abartma, kısa ve sakin söyle; dönünce de sakinleşince sev. Ayrılık kaygısını azaltır.' },
    greet:  { label: 'Dönüş',    words: /geldim|günaydın|merhaba|selam|döndüm|özledin mi/, say: n => `Merhaba ${n}! Geldim!`, pitch: 1.6, rate: 0.95, clip: 'love', dog: ['laugh', 'playbark'], tip: 'Önce sakinleşmesini bekle, sonra sev; zıplarken ilgi gösterme.' },
    water:  { label: 'Su',       words: /\bsu\b|susa|içmek/, say: n => `Su mu ${n}? Su!`, pitch: 1.5, rate: 0.9, dog: ['playbark'], tip: 'Pomeranian\'lar sıcağa hassastır; su kabını hep dolu tut.' },
    vet:    { label: 'Güven',    words: /banyo|veteriner|aşı|tırnak|tarak|ilaç|korkuyor|korktun/, say: n => `Aferin ${n}, çok cesursun. Buradayım.`, pitch: 1.2, rate: 0.75, clip: 'calm', dog: ['sigh'], tip: 'Sakin ve alçak konuş, her küçük adımda ödül ver; zorla tutma.' },
    car:    { label: 'Araba',    words: /araba|araç|yolculu|binelim/, say: n => `Arabaya biniyoruz ${n}! Hadi!`, pitch: 1.6, rate: 1.0, dog: ['laugh'], tip: 'İlk yolculukları kısa tut, sonunda güzel bir yere (park) git.' },
    guest:  { label: 'Misafir',  words: /misafir|gelen var|kapı|zil|tanıdık|arkadaş/, say: n => `Tamam ${n}, gördüm. Teşekkürler. Sakin.`, pitch: 0.95, rate: 0.8, dog: ['sigh'], tip: 'Haber verdiği için bir kez teşekkür et, sonra sakin ol; bağırırsan birlikte havladığınızı sanar.' },
    sit:    { label: 'Otur',     words: /otur|bekle|yat|kal/, say: n => `${n}, otur. Aferin.`, pitch: 1.1, rate: 0.85, dog: ['sigh'], tip: 'Komutu bir kez söyle, el işaretiyle birleştir, yaptığında öv.' },
  };
  const intentOf = text => {
    const t = text.toLocaleLowerCase('tr-TR');
    const order = ['sleep', 'leave', 'greet', 'vet', 'guest', 'car', 'water', 'walk', 'food', 'no', 'calm', 'come', 'sit', 'play', 'praise', 'love'];
    for (const k of order) if (INTENTS[k].words.test(t)) return k;
    return 'free';
  };

  // ---------- köpek sesleri (gerçek kayıtlar) ----------
  // Önce Odin'in kendi kaydı (dinlerken yakalananlar), yoksa Barkopedia veri setinden seçilmiş gerçek köpek kayıtları.
  const SRC = {
    playbark: { own: ['play', 'attn', 'food'], stock: 'play' },
    yip:      { own: ['attn', 'play'], stock: 'attn' },
    sharp:    { own: ['alarm', 'attn'], stock: 'attn' },
    laugh:    { own: ['laugh'], stock: 'laugh' },
    laughSoft:{ own: ['laugh', 'sigh', 'grunt'], stock: 'laugh' },
    sigh:     { own: ['sigh', 'grunt'], stock: 'sigh' },
  };
  let stock = null;
  const stockList = () => stock ||= fetch('sesler/index.json').then(r => r.json()).catch(() => ({}));
  async function clipFor(k) {
    const src = SRC[k]; if (!src) return null;
    const own = await window.OdinSounds?.getOwn(src.own);
    if (own) return { url: URL.createObjectURL(own), own: true };
    const list = (await stockList())[src.stock] || [];
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
  const FREE = () => ({ label: 'Genel (sevgi tonu)', dog: ['laughSoft'],
    tip: 'Odin cümleyi değil sesi tanır. Aynı durumda hep aynı şeyi söylersen, çalınan köpek sesini o durumla eşleştirir.' });
  async function translate(text) {
    const k = intentOf(text), it = k === 'free' ? FREE() : INTENTS[k];
    $('#tOut').hidden = false;
    $('#tHeard').textContent = `“${text}”`;
    $('#tIntent').textContent = it.label;
    const own = window.OdinSounds?.ownCount() || 0;
    $('#tDog').textContent = it.dog.map(d => DOGNAME[d]).join(' + ') + (own ? ' (Odin\'in kendi sesi varsa o)' : ' (gerçek köpek kaydı)');
    $('#tTip').textContent = it.tip;
    window.OdinMute?.(60000);
    await playDog(it.dog);   // Odin yalnız köpek sesi duyar
    window.OdinMute?.(500);
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const DOGNAME = { laugh: 'köpek gülmesi', laughSoft: 'yumuşak soluma', playbark: 'oyun havlaması', yip: 'çağrı havlaması', sharp: 'kısa sert havlama', sigh: 'sakin iç çekme' };

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
