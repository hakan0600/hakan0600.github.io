/* Odin Tercüman
   Akış: mikrofon -> enerji kapısı (havlama var mı?) -> olay bitince YAMNet (ses türü)
   + akustik ölçüler (sayı, hız, süre, perde) -> anlam -> sesli uyarı.
   YAMNet yalnızca ses gelince çalışır; boşta pil harcamaz. */
'use strict';

const $ = s => document.querySelector(s);
const SR16 = 16000;
const CLS = { speech: 0, whimper: 21, dog: 69, bark: 70, yip: 71, howl: 72, bowwow: 73, growl: 74, whimperDog: 75,
  sigh: 23, grunt: 34, breathing: 36, wheeze: 37, snore: 38, gasp: 39, pant: 40, snort: 41, cough: 42, sneeze: 44, sniff: 45, chew: 49,
  doorbell: 349, dingdong: 350, knock: 353 };
// havlama dışındaki vücut sesleri (YAMNet sınıfları)
const BODY = { pant: [CLS.pant, CLS.breathing], sigh: [CLS.sigh], sneeze: [CLS.sneeze], snort: [CLS.snort], cough: [CLS.cough, CLS.wheeze, CLS.gasp],
  snore: [CLS.snore], sniff: [CLS.sniff], grunt: [CLS.grunt], chew: [CLS.chew] };

const MEANINGS = {
  alarm:   { t: 'Alarm! Kapıda ya da dışarıda biri var.', s: 'Dikkat! Kapıda ya da dışarıda biri var diyor.' },
  threat:  { t: 'Rahatsız oldu, uyarıyor: uzak dur.', s: 'Rahatsız oldu, uzak dur diyor.' },
  play:    { t: 'Çok heyecanlı, oyun istiyor.', s: 'Heyecanlı, oyun oynayalım diyor.' },
  attn:    { t: 'Hey, bana bak! İlgi istiyor.', s: 'Hey, bana bak diyor.' },
  food:    { t: 'Bir şey istiyor: mama, su ya da ödül.', s: 'Bir şey istiyor. Mama ya da su olabilir.' },
  bored:   { t: 'Sıkıldı ya da yalnız hissediyor.', s: 'Sıkıldım, yalnızım diyor.' },
  need:    { t: 'Huzursuz: dışarı çıkmak ya da yanına gelmeni istiyor.', s: 'Huzursuz. Dışarı çıkmak ya da yanına gelmeni istiyor.' },
  lonely:  { t: 'Uluyor: seni çağırıyor, yalnız kaldı.', s: 'Seni çağırıyor, yalnız kaldım diyor.' },
  pain:    { t: 'Acıdı ya da korktu! Hemen kontrol et.', s: 'Dikkat! Acıdı ya da korktu. Hemen kontrol et.' },
  door:    { t: 'Kapı çaldı, sana haber veriyor.', s: 'Kapı çaldı, haber veriyor.' },
  laugh:   { t: '"He he he": köpek gülmesi. Keyfi yerinde, oyun istiyor.', s: 'Gülüyor! Keyfi yerinde, oyun oynamak istiyor.' },
  hot:     { t: 'Uzun süredir soluyor: sıcak, susamış ya da stresli olabilir. Su ver, serin yere al.', s: 'Uzun süredir soluyor. Su ver ve serin bir yere al.', lv: 'alert' },
  sigh:    { t: 'İç çekti: rahatladı ve memnun. Gözleri açıksa biraz hayal kırıklığı.', s: 'İç çekti. Rahatladı ve memnun.' },
  playsneeze: { t: 'Oyun hapşırığı: "bu sadece oyun, eğleniyorum" diyor.', s: 'Oyun hapşırığı. Eğleniyorum diyor.' },
  sneezes: { t: 'Çok sık hapşırıyor: burnu tahriş olmuş olabilir. Sürerse veterinere sor.', s: 'Çok sık hapşırıyor. Burnu tahriş olmuş olabilir.', lv: 'alert' },
  reverse: { t: 'Ters hapşırma olabilir (Pomeranian\'larda sık). Genelde zararsız: boğazını nazikçe ov, sakinleştir.', s: 'Ters hapşırma olabilir. Boğazını nazikçe ov ve sakinleştir.', lv: 'alert' },
  cough:   { t: 'Kaz sesi gibi öksürük: Pomeranian\'larda soluk borusu hassastır. Göğüs tasması kullan, sık olursa veteriner.', s: 'Öksürüyor. Sık olursa veterinere göster.', lv: 'alert' },
  snore:   { t: 'Horluyor: derin ve rahat uykuda.', s: 'Horluyor, rahat uyuyor.', lv: 'quiet' },
  sniff:   { t: 'Bir koku aldı, etrafı araştırıyor.', s: 'Bir koku aldı, araştırıyor.', lv: 'quiet' },
  grunt:   { t: 'Memnun homurtu: keyfi yerinde.', s: 'Memnun homurdanıyor, keyfi yerinde.' },
  chew:    { t: 'Bir şey çiğniyor. Oyuncağı mı, yoksa yasak bir şey mi? Bir bak.', s: 'Bir şey çiğniyor. Bir bak.', lv: 'quiet' },
};

// ---------- kalıcı ayarlar ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('odin.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('odin.' + k, JSON.stringify(v)); } catch {} },
};
const S = {
  name: store.get('name', 'Odin'),
  sens: store.get('sens', 12),        // gürültü tabanının kaç dB üstü havlama sayılır
  voice: store.get('voice', true),
  pitches: store.get('pitches', []),  // köpeğin kendi perde geçmişi (Hz)
  examples: store.get('examples', []),// {v:[...], m:'alarm'}
  quietSpeak: store.get('quietSpeak', false), // horlama/koklama gibi sakin sesleri de söyle
  history: store.get('history', []),
};

// ---------- ses ----------
let ctx, node, stream, model, running = false;
let ring, ringPos = 0, ringLen, sr;
let floorDb = -60, envHist = new Float32Array(240), envPos = 0;
let ev = null;            // açık olay: {start, barks:[{s,e,peak}], cur, lastActive}
let speakingUntil = 0, wakeLock = null;

async function loadModel() {
  if (model) return model;
  setStatus('Model yükleniyor…', 'wait');
  await tf.ready();
  model = await tf.loadGraphModel('model/model.json');
  tf.tidy(() => { model.execute(tf.zeros([SR16])); }); // ısıtma
  return model;
}

async function start() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    setStatus('Mikrofon izni verilmedi', 'err');
    toast('Mikrofona izin ver: tarayıcı ayarları > site izinleri > mikrofon.');
    return;
  }
  ctx = new AudioContext();
  sr = ctx.sampleRate;
  ringLen = Math.round(sr * 8);
  ring = new Float32Array(ringLen);
  await ctx.audioWorklet.addModule('capture.js');
  const src = ctx.createMediaStreamSource(stream);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150;
  node = new AudioWorkletNode(ctx, 'capture');
  node.port.onmessage = e => onBlock(e.data);
  src.connect(hp).connect(node);
  running = true;
  $('#go').textContent = 'Dinlemeyi durdur';
  $('#go').classList.add('on');
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  loadModel().then(() => setStatus('Dinliyor', 'ok')).catch(() => setStatus('Dinliyor (model yok, yalnız kurallar)', 'ok'));
  setStatus('Dinliyor', 'ok');
}

function stop() {
  running = false;
  stream?.getTracks().forEach(t => t.stop());
  ctx?.close();
  try { wakeLock?.release(); } catch {}
  wakeLock = null; ev = null;
  $('#go').textContent = 'Dinlemeye başla';
  $('#go').classList.remove('on');
  setStatus('Kapalı', 'off');
}

document.addEventListener('visibilitychange', async () => {
  if (running && document.visibilityState === 'visible') {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
    if (ctx?.state === 'suspended') ctx.resume();
  }
});

// 10 ms'lik pencerelerle enerji izleme
const HOP_MS = 10;
let hopBuf = [], hopN = 0, tAbs = 0; // tAbs: başlangıçtan beri örnek sayısı
function onBlock(b) {
  for (let i = 0; i < b.length; i++) { ring[ringPos] = b[i]; ringPos = (ringPos + 1) % ringLen; }
  const hop = Math.round(sr * HOP_MS / 1000);
  for (let i = 0; i < b.length; i++) {
    hopBuf[hopN++] = b[i] * b[i];
    if (hopN === hop) {
      let s = 0; for (let j = 0; j < hop; j++) s += hopBuf[j];
      hopN = 0;
      onHop(10 * Math.log10(s / hop + 1e-12), tAbs + i);
    }
  }
  tAbs += b.length;
}

function onHop(db, t) {
  envHist[envPos] = db; envPos = (envPos + 1) % envHist.length;
  const now = performance.now();
  const muted = now < speakingUntil;
  const active = !muted && db > floorDb + S.sens && db > -55;
  // gürültü tabanı: sessizken yavaşça takip et
  if (!active) floorDb += (db < floorDb ? 0.2 : 0.01) * (db - floorDb);

  if (active) {
    if (!ev) ev = { start: t, barks: [], cur: null, last: t };
    if (!ev.cur) ev.cur = { s: t, e: t, peak: db };
    ev.cur.e = t; ev.cur.peak = Math.max(ev.cur.peak, db); ev.last = t;
  } else if (ev) {
    const gap = (t - ev.last) / sr;
    if (ev.cur && gap > 0.06) {
      if ((ev.cur.e - ev.cur.s) / sr >= 0.04) ev.barks.push(ev.cur);
      ev.cur = null;
    }
    if (gap > 1.3 || (t - ev.start) / sr > 6) finishEvent();
  }
  if (ev && ev.cur && (t - ev.start) / sr > 6) { ev.barks.push(ev.cur); finishEvent(); }
}

function finishEvent() {
  const e = ev; ev = null;
  if (!e || !e.barks.length) return;
  analyse(e).catch(err => console.error(err));
}

// halka tampondan [a,b) örneklerini al
function grab(a, b) {
  const n = b - a, out = new Float32Array(n);
  const back = tAbs - a; // ne kadar geride
  if (back > ringLen) return null;
  let p = (ringPos - back + ringLen * 2) % ringLen;
  for (let i = 0; i < n; i++) { out[i] = ring[p]; p = (p + 1) % ringLen; }
  return out;
}

function to16k(x) {
  const r = sr / SR16, n = Math.floor(x.length / r), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * r), b = Math.max(a + 1, Math.floor((i + 1) * r));
    let s = 0; for (let j = a; j < b; j++) s += x[j]; y[i] = s / (b - a);
  }
  return y;
}

// özilinti ile temel perde (250-2000 Hz)
function pitchOf(x) {
  const n = Math.min(x.length, 1024); if (n < 256) return 0;
  const off = Math.floor((x.length - n) / 2);
  let e0 = 0; for (let i = 0; i < n; i++) e0 += x[off + i] ** 2;
  let best = 0, bl = 0;
  for (let lag = 8; lag <= 64; lag++) {
    let s = 0; for (let i = 0; i < n - lag; i++) s += x[off + i] * x[off + i + lag];
    s /= e0 + 1e-9;
    if (s > best) { best = s; bl = lag; }
  }
  return best > 0.3 ? SR16 / bl : 0;
}

const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

async function analyse(e) {
  const pre = Math.round(sr * 0.15);
  const a = Math.max(e.start - pre, tAbs - ringLen + 1), b = e.barks.at(-1).e + pre;
  const raw = grab(a, Math.min(b, tAbs)); if (!raw) return;
  const w = to16k(raw);

  // akustik ölçüler
  const barks = e.barks;
  const count = barks.length;
  const durs = barks.map(k => (k.e - k.s) / sr + HOP_MS / 1000);
  const span = (barks.at(-1).e - barks[0].s) / sr;
  const rate = count > 1 ? (count - 1) / Math.max(span, 0.1) : 0;
  const meanDur = durs.reduce((x, y) => x + y, 0) / count;
  const ps = barks.map(k => pitchOf(w.subarray(Math.max(0, Math.round((k.s - a) / sr * SR16)), Math.round((k.e - a) / sr * SR16)))).filter(Boolean);
  const pitch = median(ps);
  const base = S.pitches.length >= 5 ? median(S.pitches) : 700; // Pomeranian için başlangıç tahmini
  const rel = pitch ? Math.log2(pitch / base) : 0;            // +: köpeğin normalinden tiz
  const loud = Math.max(...barks.map(k => k.peak)) - floorDb;

  // YAMNet: ses türü
  let p = null;
  if (model) {
    let x = w;
    if (x.length < 15600) { const y = new Float32Array(15600); y.set(x); x = y; }
    p = tf.tidy(() => {
      let outs = model.execute(tf.tensor1d(x));
      if (!Array.isArray(outs)) outs = [outs];
      const sc = outs.find(o => o.shape.at(-1) === 521);
      return Array.from(sc.max(0).dataSync());
    });
    const dogAny = Math.max(p[CLS.dog], p[CLS.bark], p[CLS.yip], p[CLS.howl], p[CLS.bowwow], p[CLS.growl], p[CLS.whimperDog]);
    lastDoor = Math.max(p[CLS.doorbell], p[CLS.dingdong], p[CLS.knock]) > 0.2 ? performance.now() : lastDoor;
    const body = bodyOf(p);
    if (body && body.v > dogAny) { onBody(body.k, body.v); return; }
    if (dogAny < 0.12) { drawIgnored(p[CLS.speech] > 0.3 ? 'İnsan sesi, köpek değil' : 'Köpek sesi değil'); return; }
  }
  const ty = p ? {
    bark: Math.max(p[CLS.bark], p[CLS.bowwow], p[CLS.dog] * 0.6),
    yip: p[CLS.yip], growl: p[CLS.growl], howl: p[CLS.howl],
    whimper: Math.max(p[CLS.whimperDog], p[CLS.whimper]),
  } : guessType(meanDur, rel);

  if (pitch && ty.growl < 0.3) { S.pitches.push(Math.round(pitch)); if (S.pitches.length > 60) S.pitches.shift(); store.set('pitches', S.pitches); }

  const f = { count, rate, meanDur, pitch, rel, loud, ty };
  const vec = featVec(f);
  let res = learned(vec) || rules(f);
  if (performance.now() - lastDoor < 8000 && (res.m === 'alarm' || res.m === 'attn')) res = { m: 'door', c: 0.8 };
  report(res, `${count} ses · ${f.rate.toFixed(1)}/sn${f.pitch ? ' · ' + Math.round(f.pitch) + ' Hz' : ''}`, ty, vec);
}

// ---------- havlama dışı sesler ----------
let lastDoor = -1e9;
const body = {};   // k -> {times:[], start, last, said:{}}
function bodyOf(p) {
  let best = null;
  for (const [k, ids] of Object.entries(BODY)) {
    const v = Math.max(...ids.map(i => p[i]));
    if (v > 0.2 && (!best || v > best.v)) best = { k, v };
  }
  return best;
}
function onBody(k, v) {
  const now = performance.now(), b = body[k] ||= { times: [], start: now, last: -1e9, said: {} };
  if (now - b.last > 5000) { b.start = now; b.said = {}; }  // yeni bölüm
  b.last = now; b.times.push(now); b.times = b.times.filter(t => now - t < 300000);
  const dur = (now - b.start) / 1000, n5 = b.times.length;
  const once = (m, c) => { if (!b.said[m]) { b.said[m] = 1; report({ m, c }, `${dur < 1 ? 'tek' : Math.round(dur) + ' sn'} · 5 dk'da ${n5} kez`, { [k]: v }); } };
  switch (k) {
    case 'pant': if (dur >= 60) once('hot', v); else if (dur >= 2 && dur < 30) once('laugh', v); break;
    case 'sneeze': if (n5 >= 6) once('sneezes', v); else once('playsneeze', v); break;
    case 'snort': if (b.times.filter(t => now - t < 15000).length >= 2) once('reverse', v); break;
    case 'cough': once('cough', v); break;
    case 'sigh': once('sigh', v); break;
    case 'snore': if (dur >= 10) once('snore', v); break;
    case 'sniff': if (dur >= 3) once('sniff', v); break;
    case 'grunt': once('grunt', v); break;
    case 'chew': if (dur >= 5) once('chew', v); break;
  }
}

// sessiz sesler (soluma, horlama) havlama kapısını geçmez: ses varken her saniye son 1 sn'yi sınıflandır
function scan() {
  if (!running || !model || ev || performance.now() < speakingUntil || !ring) return;
  let mx = -120; for (let i = 0; i < 100; i++) mx = Math.max(mx, envHist[(envPos - 1 - i + envHist.length * 2) % envHist.length]);
  if (mx < floorDb + 5 || mx < -65) return;
  const n = Math.round(sr * 0.98), raw = grab(tAbs - n, tAbs); if (!raw) return;
  const w = to16k(raw), x = new Float32Array(15600); x.set(w.subarray(0, 15600));
  const p = tf.tidy(() => {
    let outs = model.execute(tf.tensor1d(x)); if (!Array.isArray(outs)) outs = [outs];
    return Array.from(outs.find(o => o.shape.at(-1) === 521).max(0).dataSync());
  });
  if (Math.max(p[CLS.doorbell], p[CLS.dingdong], p[CLS.knock]) > 0.2) lastDoor = performance.now();
  const bd = bodyOf(p); if (bd) onBody(bd.k, bd.v);
}
setInterval(scan, 1000);

// model yüklenemezse kaba tür tahmini
function guessType(d, rel) {
  return { bark: d < 0.35 ? 0.6 : 0.2, yip: d < 0.2 && rel > 0.2 ? 0.6 : 0.1, growl: d > 0.6 && rel < -0.5 ? 0.6 : 0, howl: d > 1.2 && rel > 0 ? 0.6 : 0, whimper: d > 0.4 && rel > 0.3 ? 0.4 : 0 };
}

/* Kurallar: Morton'un motivasyon-yapı kuralları ve Pongrácz/Molnár çalışmaları.
   Düşük perde + uzun ses = tehdit; tiz + kısa = korku/oyun/istek; hızlı seri = yüksek uyarılma (alarm);
   seyrek, düzenli havlama = yalnızlık/can sıkıntısı. */
function rules(f) {
  const { ty, count, rate, meanDur, rel } = f;
  const top = Object.entries(ty).sort((x, y) => y[1] - x[1])[0][0];
  if (top === 'growl' || (ty.growl > 0.25 && rel < 0)) return { m: 'threat', c: ty.growl };
  if (top === 'howl') return { m: 'lonely', c: ty.howl };
  if (top === 'whimper') return { m: 'need', c: ty.whimper };
  if (top === 'yip' && count <= 2 && f.loud > 20) return { m: 'pain', c: ty.yip };
  if (count >= 4 && rate >= 2.2) return rel > 0.25 ? { m: 'play', c: 0.5 } : { m: 'alarm', c: 0.6 };
  if (count >= 3 && rate < 1.3) return { m: 'bored', c: 0.45 };
  if (rel < -0.35 && meanDur > 0.3) return { m: 'threat', c: 0.45 };
  if (count <= 2) return rel > 0.15 ? { m: 'food', c: 0.4 } : { m: 'attn', c: 0.45 };
  return rel > 0.2 ? { m: 'play', c: 0.4 } : { m: 'alarm', c: 0.4 };
}

// kişisel öğrenme: en yakın komşu
function featVec(f) {
  const t = f.ty;
  return [t.bark, t.yip, t.growl, t.howl, t.whimper, Math.log2(1 + f.count) / 3, Math.min(f.rate, 6) / 6, Math.min(f.meanDur, 1.5) / 1.5, Math.max(-1, Math.min(1, f.rel))];
}
function learned(v) {
  if (S.examples.length < 3) return null;
  const d = S.examples.map(x => ({ m: x.m, d: Math.hypot(...v.map((a, i) => a - x.v[i])) })).sort((a, b) => a.d - b.d);
  const k = d.slice(0, 3).filter(x => x.d < 0.45);
  if (!k.length) return null;
  const votes = {}; k.forEach(x => votes[x.m] = (votes[x.m] || 0) + 1 / (x.d + 0.05));
  const m = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  return { m, c: Math.min(0.95, 0.5 + 0.15 * k.filter(x => x.m === m).length), learned: true };
}

// ---------- konuşma ----------
let trVoice = null;
function pickVoice() { const vs = speechSynthesis.getVoices(); trVoice = vs.find(v => /^tr/i.test(v.lang)) || null; }
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(text) {
  if (!S.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'tr-TR'; if (trVoice) u.voice = trVoice; u.rate = 1.02;
  speakingUntil = performance.now() + 60000; // konuşurken kendi sesini dinlemesin
  u.onend = u.onerror = () => { speakingUntil = performance.now() + 400; };
  speechSynthesis.speak(u);
}

window.OdinMute = ms => { speakingUntil = Math.max(performance.now() + ms, ms < 1000 ? 0 : speakingUntil); };

// ---------- arayüz ----------
const TYPE_TR = { bark: 'Havlama', yip: 'Tiz havlama', growl: 'Hırlama', howl: 'Uluma', whimper: 'İnleme', pant: 'Soluma', sigh: 'İç çekme', sneeze: 'Hapşırma', snort: 'Burun çekme', cough: 'Öksürük', snore: 'Horlama', sniff: 'Koklama', grunt: 'Homurtu', chew: 'Çiğneme' };
let lastVec = null, lastId = null;

function report(res, meta, ty, vec = null) {
  const M = MEANINGS[res.m], lv = M.lv || 'info';
  const item = { id: Date.now(), at: new Date().toISOString(), m: res.m, c: res.c, learned: !!res.learned, meta, ty, v: vec };
  S.history.unshift(item); S.history = S.history.slice(0, 60); store.set('history', S.history);
  lastVec = vec; lastId = item.id;
  if (lv !== 'quiet' || S.quietSpeak) {
    if (navigator.vibrate) navigator.vibrate(lv === 'alert' || res.m === 'pain' || res.m === 'alarm' ? [200, 80, 200] : 120);
    say(`${S.name}: ${M.s}`);
  }
  window.OdinSounds?.respond(res.m);
  renderNow(item); renderHistory();
}

function renderNow(it) {
  const M = MEANINGS[it.m];
  $('#now').hidden = false; $('#idle').hidden = true;
  $('#nowText').textContent = M.t;
  $('#nowMeta').textContent = `${it.meta || ''} · ${it.learned ? 'senin öğrettiğine göre' : 'kurallara göre'} · güven %${Math.round(it.c * 100)}`;
  $('#nowCard').dataset.m = it.m;
  const bars = $('#types'); bars.textContent = '';
  Object.entries(it.ty || {}).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    const row = document.createElement('div'); row.className = 'trow';
    row.innerHTML = `<span></span><i><b style="width:${Math.round(Math.min(1, v) * 100)}%"></b></i><em></em>`;
    row.children[0].textContent = TYPE_TR[k] || k; row.children[2].textContent = Math.round(v * 100) + '%';
    bars.append(row);
  });
  $('#fix').value = it.m; $('#fixRow').hidden = true;
  $('#ok').disabled = !it.v; $('#wrong').disabled = !it.v;
}

function drawIgnored(why) { $('#ignored').textContent = why + ' (yok sayıldı)'; $('#ignored').hidden = false; clearTimeout(drawIgnored.t); drawIgnored.t = setTimeout(() => $('#ignored').hidden = true, 4000); }

function renderHistory() {
  const ul = $('#hist'); ul.textContent = '';
  if (!S.history.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Henüz kayıt yok. İlk havlamada burada görünecek.'; ul.append(li); return; }
  S.history.forEach(h => {
    const li = document.createElement('li');
    const t = new Date(h.at);
    li.innerHTML = '<time></time><span class="dot"></span><p></p>';
    li.children[0].textContent = t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    li.children[1].dataset.m = h.m;
    li.children[2].textContent = MEANINGS[h.m].t + (h.fixed ? ' ✓' : '');
    ul.append(li);
  });
}

function teach(m) {
  if (!lastVec || !(m in MEANINGS)) return;
  S.examples.push({ v: lastVec, m }); if (S.examples.length > 300) S.examples.shift();
  store.set('examples', S.examples);
  const h = S.history.find(x => x.id === lastId); if (h) { h.m = m; h.fixed = true; store.set('history', S.history); }
  renderHistory(); renderNow(h || S.history[0]);
  $('#learnCount').textContent = S.examples.length;
  toast(`Öğrendim. ${S.examples.length} örnek kayıtlı.`);
  $('#ok').disabled = true;
}

function setStatus(t, k) { const el = $('#status'); el.textContent = t; el.dataset.k = k; }
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 3200); }

// seviye göstergesi
function drawMeter() {
  const c = $('#meter'), g = c.getContext('2d');
  const w = c.width = c.clientWidth * devicePixelRatio, h = c.height = c.clientHeight * devicePixelRatio;
  const css = getComputedStyle(document.documentElement);
  g.clearRect(0, 0, w, h);
  const n = envHist.length, bw = w / n;
  const y = db => h - Math.max(0, Math.min(1, (db + 80) / 80)) * h;
  g.fillStyle = css.getPropertyValue('--meter').trim();
  for (let i = 0; i < n; i++) { const db = envHist[(envPos + i) % n]; const yy = y(db); g.fillRect(i * bw, yy, Math.max(1, bw - 0.5), h - yy); }
  g.strokeStyle = css.getPropertyValue('--accent').trim(); g.setLineDash([6 * devicePixelRatio, 4 * devicePixelRatio]); g.lineWidth = devicePixelRatio;
  const ty = y(Math.max(floorDb + S.sens, -55)); g.beginPath(); g.moveTo(0, ty); g.lineTo(w, ty); g.stroke();
  if (running) requestAnimationFrame(drawMeter);
}

// ---------- bağlama ----------
$('#go').onclick = () => { running ? stop() : start().then(() => requestAnimationFrame(drawMeter)); if ('speechSynthesis' in window) speechSynthesis.getVoices(); };
$('#name').value = S.name;
$('#name').oninput = e => { S.name = e.target.value.trim() || 'Odin'; store.set('name', S.name); };
$('#sens').value = S.sens; $('#sensVal').textContent = S.sens + ' dB';
$('#sens').oninput = e => { S.sens = +e.target.value; $('#sensVal').textContent = S.sens + ' dB'; store.set('sens', S.sens); };
$('#quiet').checked = S.quietSpeak;
$('#quiet').onchange = e => { S.quietSpeak = e.target.checked; store.set('quietSpeak', S.quietSpeak); };
$('#voice').checked = S.voice;
$('#voice').onchange = e => { S.voice = e.target.checked; store.set('voice', S.voice); };
$('#test').onclick = () => { const v = S.voice; S.voice = true; say(`${S.name}: ${MEANINGS.attn.s}`); S.voice = v; };
$('#ok').onclick = () => { const h = S.history.find(x => x.id === lastId); if (h) teach(h.m); };
$('#wrong').onclick = () => { $('#fixRow').hidden = false; };
const fx = $('#fix');
Object.entries(MEANINGS).filter(([k]) => ['alarm','threat','play','attn','food','bored','need','lonely','pain','door'].includes(k)).forEach(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v.t; fx.append(o); });
$('#fixSave').onclick = () => teach(fx.value);
$('#reset').onclick = () => { if ($('#reset').dataset.armed) { S.examples = []; S.pitches = []; S.history = []; ['examples', 'pitches', 'history'].forEach(k => store.set(k, [])); renderHistory(); $('#learnCount').textContent = 0; $('#reset').textContent = 'Öğrenileni sıfırla'; delete $('#reset').dataset.armed; toast('Sıfırlandı.'); } else { $('#reset').dataset.armed = 1; $('#reset').textContent = 'Emin misin? Tekrar dokun'; setTimeout(() => { delete $('#reset').dataset.armed; $('#reset').textContent = 'Öğrenileni sıfırla'; }, 3000); } };
$('#learnCount').textContent = S.examples.length;
renderHistory();
drawMeter();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
