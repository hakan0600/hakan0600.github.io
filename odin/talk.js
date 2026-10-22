/* İnsan dilinden Odin diline.
   Köpekler kelimenin anlamını değil tonu, kısalığı, tekrarı ve tanıdık sesleri anlar. Söyleneni niyete çevirir
   (övgü, sevgi, oyun, sakin, gel, hayır, mama, gezme, otur), sonra:
   1) köpeğe yönelik tonda kısa bir işaret cümlesi (varsa sahibin kaydı),
   2) isteğe bağlı köpek sesi: Odin'in kendi perdesinde oyun havlaması, köpek gülmesi (oyun soluması), iç çekme.
   Alarm/tehdit havlaması bilerek yok: köpeği strese sokar. */
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const INTENTS = {
    praise: { label: 'Övgü',     words: /aferin|aferim|akıll?ı|güzel (oğlum|kızım|köpek|çocuk)|iyi (köpek|oğlan|kız|çocuk)|bravo|süpersin|tebrik/, say: n => `Aferiiin ${n}! Aferin!`, pitch: 1.7, rate: 0.85, clip: 'good', dog: ['laugh'], tip: 'Övgüyü davranıştan hemen sonra (2 saniye içinde) söyle.' },
    love:   { label: 'Sevgi',    words: /sev|canım|tatlı|bebe|özle|kuzu|yakışıklı|öp/, say: n => `${n}... canım benim. Seni seviyorum.`, pitch: 1.5, rate: 0.8, clip: 'love', dog: ['laughSoft'], tip: 'Yumuşak ve yavaş konuş; göz teması ve okşamayla birleştir.' },
    play:   { label: 'Oyun',     words: /oyna|oyun|top|koş|yakala|getir|hadi/, say: n => `${n}! Hadi hadi! Oyun!`, pitch: 1.8, rate: 1.05, clip: 'play', dog: ['laugh', 'playbark'], tip: 'Kollarını aç, öne eğil: köpeklerin oyun selamını taklit et.' },
    calm:   { label: 'Sakin',    words: /sakin|geçti|korkma|yolunda|şşş|sus artık/, say: n => `Şşşş... sakin ${n}. Sakin.`, pitch: 0.9, rate: 0.7, clip: 'calm', dog: ['sigh'], tip: 'Alçak ve yavaş konuş, hareketlerini yavaşlat, yüzüne eğilme.' },
    come:   { label: 'Gel',      words: /\bgel\b|\bgel gel|buraya|yanıma/, say: n => `${n}, gel! Gel gel gel!`, pitch: 1.7, rate: 1.0, dog: ['yip'], tip: 'Geldiğinde mutlaka ödüllendir; "gel" sonrası asla azarlama.' },
    no:     { label: 'Hayır',    words: /hayır|yapma|\bdur\b|bırak|olmaz|yasak|in aşağı|kes şunu/, say: () => 'Hayır.', pitch: 0.75, rate: 0.9, dog: ['huff'], tip: 'Tek kelime, alçak ve kısa. Bağırma; sonra doğru davranışı göster ve öv.' },
    food:   { label: 'Mama',     words: /mama|yemek|ödül|acık|kemik/, say: n => `Mama mı ${n}? Mama!`, pitch: 1.6, rate: 0.95, dog: ['playbark'], tip: 'Mamadan önce "otur" iste: sakin bekleyince ver.' },
    walk:   { label: 'Gezme',    words: /gez|dışarı|yürü|tasma|park|sokak|tuvalet|çiş/, say: n => `Gezmeye mi gidiyoruz ${n}? Hadi gezmeye!`, pitch: 1.7, rate: 1.0, dog: ['laugh'], tip: 'Tasmayı göstererek aynı kelimeyi kullan; Odin kelimeyi tasmayla eşleştirir.' },
    sleep:  { label: 'Uyku',     words: /uyu|iyi geceler|yat(ağa|alım)|dinlen|uykun/, say: n => `İyi geceler ${n}... uyu bakalım.`, pitch: 1.0, rate: 0.65, clip: 'calm', dog: ['sigh'], tip: 'Yatmadan önce hep aynı sözü ve aynı sakin tonu kullan; rutin Odin\'i rahatlatır.' },
    leave:  { label: 'Çıkış',    words: /gidiyorum|çıkıyorum|birazdan|geleceğim|dönerim|işe gid|evde kal/, say: n => `${n}, birazdan geleceğim. Evde kal.`, pitch: 1.0, rate: 0.85, dog: [], tip: 'Çıkışı abartma, kısa ve sakin söyle; dönünce de sakinleşince sev. Ayrılık kaygısını azaltır.' },
    greet:  { label: 'Dönüş',    words: /geldim|günaydın|merhaba|selam|döndüm|özledin mi/, say: n => `Merhaba ${n}! Geldim!`, pitch: 1.6, rate: 0.95, clip: 'love', dog: ['laughSoft'], tip: 'Önce sakinleşmesini bekle, sonra sev; zıplarken ilgi gösterme.' },
    water:  { label: 'Su',       words: /\bsu\b|susa|içmek/, say: n => `Su mu ${n}? Su!`, pitch: 1.5, rate: 0.9, dog: [], tip: 'Pomeranian\'lar sıcağa hassastır; su kabını hep dolu tut.' },
    vet:    { label: 'Güven',    words: /banyo|veteriner|aşı|tırnak|tarak|ilaç|korkuyor|korktun/, say: n => `Aferin ${n}, çok cesursun. Buradayım.`, pitch: 1.2, rate: 0.75, clip: 'calm', dog: [], tip: 'Sakin ve alçak konuş, her küçük adımda ödül ver; zorla tutma.' },
    car:    { label: 'Araba',    words: /araba|araç|yolculu|binelim/, say: n => `Arabaya biniyoruz ${n}! Hadi!`, pitch: 1.6, rate: 1.0, dog: ['laughSoft'], tip: 'İlk yolculukları kısa tut, sonunda güzel bir yere (park) git.' },
    guest:  { label: 'Misafir',  words: /misafir|gelen var|kapı|zil|tanıdık|arkadaş/, say: n => `Tamam ${n}, gördüm. Teşekkürler. Sakin.`, pitch: 0.95, rate: 0.8, dog: ['sigh'], tip: 'Haber verdiği için bir kez teşekkür et, sonra sakin ol; bağırırsan birlikte havladığınızı sanar.' },
    sit:    { label: 'Otur',     words: /otur|bekle|yat|kal/, say: n => `${n}, otur. Aferin.`, pitch: 1.1, rate: 0.85, dog: [], tip: 'Komutu bir kez söyle, el işaretiyle birleştir, yaptığında öv.' },
  };
  const intentOf = text => {
    const t = text.toLocaleLowerCase('tr-TR');
    const order = ['sleep', 'leave', 'greet', 'vet', 'guest', 'car', 'water', 'walk', 'food', 'no', 'calm', 'come', 'sit', 'play', 'praise', 'love'];
    for (const k of order) if (INTENTS[k].words.test(t)) return k;
    return 'free';
  };
  const name = () => ($('#name').value.trim() || 'Odin');
  const odinPitch = () => {
    try { const a = JSON.parse(localStorage.getItem('odin.pitches') || '[]'); if (a.length >= 5) return [...a].sort((x, y) => x - y)[a.length >> 1]; } catch {}
    return 700; // Pomeranian için başlangıç tahmini; dinledikçe Odin'in kendi perdesine oturur
  };
  let withDog = (() => { try { return JSON.parse(localStorage.getItem('odin.talk.dog') ?? 'true'); } catch { return true; } })();

  // ---------- köpek sesleri (sentez) ----------
  let out;
  const ac = () => { if (!out) out = new AudioContext(); if (out.state === 'suspended') out.resume(); return out; };
  const noiseBuf = c => { const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };
  let nb = null;
  function noise(c, t, dur, f, q, peak, att = 0.02) {
    nb ||= noiseBuf(c);
    const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = nb; s.loop = true; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(c.destination); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function bark(c, t, f0, dur, vol) {
    const o = c.createOscillator(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.8, t); o.frequency.linearRampToValueAtTime(f0 * 1.15, t + dur * 0.3); o.frequency.linearRampToValueAtTime(f0 * 0.75, t + dur);
    f1.type = 'peaking'; f1.frequency.value = 1100; f1.gain.value = 10; f1.Q.value = 2;
    f2.type = 'peaking'; f2.frequency.value = 2600; f2.gain.value = 8; f2.Q.value = 3;
    lp.type = 'lowpass'; lp.frequency.value = 4500;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1).connect(f2).connect(lp).connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    noise(c, t, dur * 0.8, 2200, 1.2, vol * 0.5, 0.008);
  }
  const DOG = {
    // köpek gülmesi: nefes verme ağırlıklı, hızlı, sesli soluma (Simonet 2001)
    laugh: (c, t) => { for (let i = 0; i < 8; i++) noise(c, t + i * 0.2, i % 2 ? 0.1 : 0.14, i % 2 ? 1400 : 1800, 1.4, i % 2 ? 0.12 : 0.22); return 1.7; },
    laughSoft: (c, t) => { for (let i = 0; i < 6; i++) noise(c, t + i * 0.26, 0.16, 1500, 1.2, 0.1); return 1.6; },
    playbark: (c, t, f) => { bark(c, t, f * 1.1, 0.11, 0.35); bark(c, t + 0.3, f * 1.2, 0.1, 0.3); return 0.5; },
    yip: (c, t, f) => { bark(c, t, f * 1.35, 0.07, 0.28); bark(c, t + 0.18, f * 1.4, 0.07, 0.28); return 0.3; },
    sigh: (c, t) => { noise(c, t, 1.3, 700, 0.8, 0.16, 0.35); noise(c, t + 0.05, 1.1, 1600, 1, 0.05, 0.4); return 1.4; },
    huff: (c, t) => { noise(c, t, 0.14, 900, 0.9, 0.3, 0.01); return 0.2; },
  };
  function playDog(list) {
    if (!list.length) return 0;
    const c = ac(); let t = c.currentTime + 0.05; const f = odinPitch();
    list.forEach(k => { t += DOG[k](c, t, f) + 0.25; });
    return (t - c.currentTime) * 1000;
  }

  function speak(it) {
    return new Promise(res => {
      if (!('speechSynthesis' in window)) return res();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(it.say(name()));
      u.lang = 'tr-TR'; u.pitch = it.pitch; u.rate = it.rate;
      const v = speechSynthesis.getVoices().find(v => /^tr/i.test(v.lang)); if (v) u.voice = v;
      u.onend = u.onerror = res; speechSynthesis.speak(u);
      setTimeout(res, 8000);
    });
  }

  // tanınmayan cümle: kendi cümlen, köpeğe yönelik sıcak tonda, adıyla başlar
  const FREE = text => ({ label: 'Serbest (senin cümlen)', say: n => `${n}... ${text}`, pitch: 1.5, rate: 0.8, dog: ['laughSoft'],
    tip: 'Odin cümleyi değil tonu ve kelimeleri tanır. Aynı şeyi hep aynı kısa kelimeyle söylersen zamanla öğrenir.' });
  async function translate(text) {
    const k = intentOf(text), it = k === 'free' ? FREE(text) : INTENTS[k];
    $('#tOut').hidden = false;
    $('#tHeard').textContent = `“${text}”`;
    $('#tIntent').textContent = it.label;
    $('#tSay').textContent = it.clip && window.OdinSounds?.has(it.clip) ? 'Senin kayıtlı sesin' : it.say(name());
    $('#tDog').textContent = withDog && it.dog.length ? it.dog.map(d => DOGNAME[d]).join(' + ') : '—';
    $('#tTip').textContent = it.tip;
    window.OdinMute?.(60000);
    if (withDog && k !== 'no' && k !== 'calm') await wait(playDog(it.dog));   // önce köpek sesiyle dikkatini çek
    if (it.clip && window.OdinSounds?.has(it.clip)) { await window.OdinSounds.phrase(it.clip); await wait(2500); }
    else await speak(it);
    if (withDog && (k === 'no' || k === 'calm')) await wait(playDog(it.dog)); // sakin/hayır: ses sonra, yumuşak kapanış
    window.OdinMute?.(500);
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const DOGNAME = { laugh: 'köpek gülmesi', laughSoft: 'yumuşak soluma', playbark: 'oyun havlaması', yip: 'çağrı havlaması', sigh: 'sakin iç çekme', huff: 'kısa burun sesi' };

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
  $('#tDogOn').checked = withDog;
  $('#tDogOn').onchange = e => { withDog = e.target.checked; try { localStorage.setItem('odin.talk.dog', JSON.stringify(withDog)); } catch {} };
})();
