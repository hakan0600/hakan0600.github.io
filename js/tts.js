/* Sesli okuma: tarayıcının kendi konuşma motoru (Web Speech API). İnternet gerekmez, Edge'de "Natural" sesler çok doğal okur. */
const TTS = (() => {
  const supported = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  const synth = supported ? window.speechSynthesis : null;
  let voices = [];
  let keep = null; // Chrome, konuşma bitmeden nesneyi çöpe atabiliyor; referansı tutuyoruz

  function refresh() { if (supported) voices = synth.getVoices(); }
  if (supported) {
    refresh();
    synth.addEventListener('voiceschanged', refresh);
  }

  const langOf = v => (v.lang || '').replace('_', '-').toLowerCase();
  const list = lang => voices.filter(v => langOf(v).startsWith(lang));

  function score(v, lang) {
    let s = 0;
    const l = langOf(v);
    if (lang === 'en') s += l === 'en-us' ? 3 : l === 'en-gb' ? 2 : 0;
    if (/natural|neural/i.test(v.name)) s += 4;
    if (/google/i.test(v.name)) s += 2;
    if (/online/i.test(v.name)) s += 1;
    return s;
  }

  function pick(lang) {
    const pref = Store.settings()[lang === 'en' ? 'enVoice' : 'trVoice'];
    const all = list(lang);
    return all.find(v => v.voiceURI === pref) || all.slice().sort((a, b) => score(b, lang) - score(a, lang))[0] || null;
  }

  /** Tek deneme: 'ok' | 'cancel' (biz durdurduk) | 'error' (ses çalınamadı, ör. bulut sesi + internet yok) */
  function attempt(text, lang, voice) {
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = lang === 'en' ? 'en-US' : 'tr-TR';
      u.rate = Store.settings().rate;
      keep = u;
      let done = false;
      const finish = r => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
      u.onend = () => finish('ok');
      u.onerror = e => finish(e.error === 'canceled' || e.error === 'interrupted' ? 'cancel' : 'error');
      const timer = setTimeout(() => { synth.cancel(); finish('error'); }, 5000 + text.length * 300);
      synth.speak(u);
    });
  }

  /** lang: 'en' | 'tr'. Konuşma bitince true, hata/iptalde false ile çözülür. */
  async function speak(text, lang) {
    if (!supported || !text) return false;
    synth.cancel();
    const v = pick(lang);
    let r = await attempt(text, lang, v);
    if (r === 'error' && v && !v.localService) {
      // Edge'in "Natural" sesleri buluttan gelir; internet yoksa cihazdaki yerel sese düş.
      const local = list(lang).find(x => x.localService);
      if (local) r = await attempt(text, lang, local);
    }
    return r === 'ok';
  }

  function cancel() { if (supported) synth.cancel(); }

  return { supported, speak, cancel, list, pick, hasVoice: lang => list(lang).length > 0 };
})();
