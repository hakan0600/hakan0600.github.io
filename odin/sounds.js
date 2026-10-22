/* Odin'i mutlu eden sesler.
   - Sahibin sesi (kaydedilen kısa sözler) en etkilisi; kayıt yoksa köpeğe yönelik konuşma tonunda yapay ses
     (tiz, yavaş, abartılı vurgu: köpeklerin en çok ilgilendiği konuşma biçimi).
   - Sakinleştirici müzik: yavaş (~55 vuruş/dk), sade, tek piyano; barınak çalışmalarında stresi azaltan tür.
   - Kahverengi gürültü: dış sesleri (kapı, korna, havai fişek) bastırır.
   - Otomatik cevap: ilgi/oyun havlamalarını ödüllendirmez (havlamayı pekiştirmemek için);
     yalnızlık ve huzursuzluğa sakinleştirici, alarma sakin ses verir, sonra sessiz kalırsa "aferin" der. */
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const PHRASES = [
    { k: 'good',  label: 'Aferin',            tts: n => `Aferin ${n}! Aferin sana, akıllı oğlan!` },
    { k: 'calm',  label: 'Sakin ol',          tts: n => `Sakin ol ${n}. Her şey yolunda, buradayım.` },
    { k: 'play',  label: 'Gel oynayalım',     tts: n => `${n}! Gel oynayalım! Hadi hadi!` },
    { k: 'love',  label: 'Seni seviyorum',    tts: n => `Seni çok seviyorum ${n}. Güzel oğlum benim.` },
  ];
  const AUTO = { lonely: 'music+love', bored: 'music+love', need: 'love', alarm: 'calm', threat: 'calm' };
  const opt = {
    auto: load('auto', true), praise: load('praise', true),
  };
  function load(k, d) { try { const v = localStorage.getItem('odin.snd.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }
  function save(k, v) { try { localStorage.setItem('odin.snd.' + k, JSON.stringify(v)); } catch {} }

  // ---------- kayıtlar (IndexedDB) ----------
  const idb = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('odin', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('clips');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  const tx = (mode, fn) => idb.then(db => new Promise((res, rej) => {
    const t = db.transaction('clips', mode), q = fn(t.objectStore('clips'));
    t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error);
  }));
  const clips = {};
  idb.then(() => Promise.all(PHRASES.map(async p => { clips[p.k] = await tx('readonly', s => s.get(p.k)).catch(() => null); }))).then(render).catch(render);

  // ---------- çıkış ----------
  let out;
  const ac = () => { if (!out) out = new AudioContext(); if (out.state === 'suspended') out.resume(); return out; };
  const name = () => ($('#name').value.trim() || 'Odin');

  function waitQuiet(max = 9000) {
    return new Promise(r => { const t0 = Date.now(); (function poll() { if (!speechSynthesis.speaking || Date.now() - t0 > max) r(); else setTimeout(poll, 200); })(); });
  }

  async function phrase(k) {
    const p = PHRASES.find(x => x.k === k); if (!p) return;
    await waitQuiet();
    const blob = clips[k];
    if (blob) {
      const a = new Audio(URL.createObjectURL(blob));
      a.onloadedmetadata = () => window.OdinMute?.((a.duration || 4) * 1000 + 600);
      window.OdinMute?.(5000);
      a.play().catch(() => {});
    } else if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(p.tts(name()));
      u.lang = 'tr-TR'; u.pitch = 1.6; u.rate = 0.82;
      const v = speechSynthesis.getVoices().find(v => /^tr/i.test(v.lang)); if (v) u.voice = v;
      window.OdinMute?.(60000); u.onend = u.onerror = () => window.OdinMute?.(500);
      speechSynthesis.speak(u);
    }
  }

  function squeak() {
    const c = ac(), t = c.currentTime;
    window.OdinMute?.(1200);
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator(), g = c.createGain(), s = t + i * 0.22;
      o.type = 'sine';
      o.frequency.setValueAtTime(1300, s); o.frequency.exponentialRampToValueAtTime(2700, s + 0.06); o.frequency.exponentialRampToValueAtTime(1600, s + 0.14);
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.35, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.15);
      o.connect(g).connect(c.destination); o.start(s); o.stop(s + 0.16);
    }
  }

  // yavaş piyano: C - Am - F - G, 55 vuruş/dk
  let music = null;
  const N = m => 440 * 2 ** ((m - 69) / 12);
  const PROG = [[48, 60, 64, 67, 72], [45, 57, 60, 64, 69], [41, 57, 60, 65, 69], [43, 55, 59, 62, 67]];
  function note(c, dest, f, t, dur, vel) {
    const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o1.type = 'triangle'; o2.type = 'sine'; o1.frequency.value = f; o2.frequency.value = f * 2.001;
    const g2 = c.createGain(); g2.gain.value = 0.25;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(g); o2.connect(g2).connect(g); g.connect(dest);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function startMusic(minutes = 30) {
    if (music) return;
    const c = ac(), lp = c.createBiquadFilter(), master = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 1800; master.gain.value = 0.5;
    lp.connect(master).connect(c.destination);
    const beat = 60 / 55; let bar = 0, next = c.currentTime + 0.1;
    const end = Date.now() + minutes * 60000;
    const timer = setInterval(() => {
      if (Date.now() > end) return stopMusic();
      while (next < c.currentTime + 1.5) {
        const ch = PROG[bar % 4];
        note(c, lp, N(ch[0]), next, beat * 4, 0.16);
        const order = [1, 2, 3, 4].sort(() => Math.random() - 0.5);
        order.forEach((n, i) => { if (Math.random() < 0.85) note(c, lp, N(ch[n]), next + i * beat, beat * 2.5, 0.09); });
        next += beat * 4; bar++;
      }
    }, 300);
    music = { timer, master, end };
    render();
  }
  function stopMusic() {
    if (!music) return;
    clearInterval(music.timer);
    const g = music.master.gain, t = out.currentTime; g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 1.5);
    const m = music.master; setTimeout(() => m.disconnect(), 1800);
    music = null; render();
  }

  let noise = null;
  function toggleNoise() {
    if (noise) { noise.stop(); noise = null; return render(); }
    const c = ac(), n = c.sampleRate * 4, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.loop = true; g.gain.value = 0.35;
    s.connect(g).connect(c.destination); s.start(); noise = s; render();
  }

  // ---------- otomatik cevap ----------
  let lastAuto = 0, praiseTimer = null;
  function respond(m) {
    clearTimeout(praiseTimer);
    if (!opt.auto) return;
    const plan = AUTO[m]; if (!plan) return;           // ilgi/oyun havlamaları ödüllendirilmez
    if (Date.now() - lastAuto < 120000) return;       // 2 dakikada bir en fazla
    lastAuto = Date.now();
    plan.split('+').forEach(p => p === 'music' ? startMusic(15) : phrase(p));
    if (opt.praise) praiseTimer = setTimeout(() => phrase('good'), 60000); // 1 dk sessiz kalırsa aferin
  }

  // ---------- kayıt ----------
  let rec = null;
  async function startRec(k, btn) {
    if (rec) return;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(st), parts = [];
      mr.ondataavailable = e => e.data.size && parts.push(e.data);
      mr.onstop = async () => {
        st.getTracks().forEach(t => t.stop());
        const blob = new Blob(parts, { type: mr.mimeType || 'audio/webm' });
        if (blob.size > 2000) { clips[k] = blob; await tx('readwrite', s => s.put(blob, k)).catch(() => {}); }
        rec = null; render();
      };
      rec = { mr, k, t: setTimeout(() => stopRec(), 5000) };
      window.OdinMute?.(6000);
      mr.start(); btn.classList.add('rec'); btn.textContent = 'Kaydediyor… bırak';
    } catch { btn.textContent = 'Mikrofon izni yok'; }
  }
  function stopRec() { if (rec && rec.mr.state === 'recording') { clearTimeout(rec.t); rec.mr.stop(); } }

  // ---------- arayüz ----------
  function render() {
    const box = $('#phrases'); if (!box) return;
    box.textContent = '';
    PHRASES.forEach(p => {
      const el = document.createElement('div'); el.className = 'phrase';
      el.innerHTML = '<strong></strong><small></small><div class="row"><button type="button" class="play">Çal</button><button type="button" class="recb">Basılı tut, kaydet</button></div>';
      el.querySelector('strong').textContent = p.label;
      el.querySelector('small').textContent = clips[p.k] ? 'Senin sesin' : 'Yapay ses (kendi sesini kaydet)';
      el.querySelector('.play').onclick = () => phrase(p.k);
      const rb = el.querySelector('.recb');
      rb.onpointerdown = e => { e.preventDefault(); startRec(p.k, rb); };
      rb.onpointerup = rb.onpointerleave = rb.onpointercancel = () => stopRec();
      rb.oncontextmenu = e => e.preventDefault();
      box.append(el);
    });
    $('#music').textContent = music ? 'Müziği durdur' : 'Sakinleştirici müzik';
    $('#music').classList.toggle('on', !!music);
    $('#noise').textContent = noise ? 'Gürültüyü durdur' : 'Kahverengi gürültü';
    $('#noise').classList.toggle('on', !!noise);
  }
  $('#music').onclick = () => music ? stopMusic() : startMusic(30);
  $('#noise').onclick = toggleNoise;
  $('#squeak').onclick = squeak;
  $('#auto').checked = opt.auto; $('#auto').onchange = e => { opt.auto = e.target.checked; save('auto', opt.auto); };
  $('#praise').checked = opt.praise; $('#praise').onchange = e => { opt.praise = e.target.checked; save('praise', opt.praise); };
  render();

  // ---------- Odin'in kendi sesleri ----------
  // Dinlerken yakalanan gerçek havlama/soluma kayıtları; anlam başına en yeni 4 tanesi saklanır.
  const OWN_MAX = 4;
  const ownIndex = () => { try { return JSON.parse(localStorage.getItem('odin.own') || '{}'); } catch { return {}; } };
  function wav16(x) {
    const b = new ArrayBuffer(44 + x.length * 2), v = new DataView(b);
    const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, x.length * 2, true);
    for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
    return new Blob([b], { type: 'audio/wav' });
  }
  async function saveOwn(m, w) {
    if (!w || w.length < 1600) return;
    const x = w.slice(0, 16000 * 3);
    let pk = 0; for (const s of x) pk = Math.max(pk, Math.abs(s));
    if (pk < 0.02) return;
    const g = 0.7 / pk, fade = 160;
    for (let i = 0; i < x.length; i++) x[i] *= g * Math.min(1, i / fade, (x.length - 1 - i) / fade);
    const key = `own:${m}:${Date.now()}`, idx = ownIndex();
    (idx[m] ||= []).push(key);
    const drop = idx[m].length > OWN_MAX ? idx[m].splice(0, idx[m].length - OWN_MAX) : [];
    try { localStorage.setItem('odin.own', JSON.stringify(idx)); } catch {}
    await tx('readwrite', s => { s.put(wav16(x), key); drop.forEach(k => s.delete(k)); }).catch(() => {});
  }
  async function getOwn(ms) {
    const idx = ownIndex(), keys = ms.flatMap(m => idx[m] || []);
    if (!keys.length) return null;
    return tx('readonly', s => s.get(keys[Math.floor(Math.random() * keys.length)])).catch(() => null);
  }
  const ownCount = () => Object.values(ownIndex()).reduce((a, l) => a + l.length, 0);

  window.OdinSounds = { respond, phrase, startMusic, stopMusic, has: k => !!clips[k], saveOwn, getOwn, ownCount };
})();
