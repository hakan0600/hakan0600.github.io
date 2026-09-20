/* Erişim kapısı (yalnızca internetteki sürümde): şifre girilmeden uygulama kodu yüklenmez.
   Bilgisayarda (127.0.0.1) ve evdeki Wi-Fi'de (192.168.x.x) kapı çıkmaz.
   NOT: Bu, sayfaya ulaşan herkesi durduran gerçek bir sunucu güvenliği değildir; adresi bilen ama şifreyi bilmeyen kişileri
   ve tesadüfi ziyaretçileri uygulamayı kullanmaktan alıkoyar. Uygulamada zaten kişisel veri tutulmaz (kelimeler herkesin kendi cihazındadır).
   Şifreyi değiştirmek için: python sifre_degistir.py YENI-SIFRE  (sonra yeniden yayınla). */
(() => {
  const HASH = '757d868044d7b096b1e70576e88f2dfaf6406c710f0684251908d77ec811a13c';
  const SALT = 'yokdil-kelime-v1';
  const APP = ['js/store.js', 'js/parser.js', 'js/tts.js', 'js/layout.js', 'js/fixer.js', 'js/ocr.js', 'js/app.js'];
  const KEY = 'yokdil.gate';
  const local = /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  const forced = /[?&]gate=1\b/.test(location.search); // deneme için: kapıyı zorla göster

  function load() {
    for (const src of APP) {
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // sırayı koru
      document.body.appendChild(s);
    }
  }

  const get = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const put = v => { try { localStorage.setItem(KEY, v); } catch (e) { /* kapalıysa her açılışta sorulur */ } };

  async function sha(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  if ((local && !forced) || get() === HASH) { load(); return; }

  const box = document.createElement('div');
  box.className = 'gate';
  box.innerHTML = `<form class="gate-card" autocomplete="off">
      <div class="logo big">Aa</div>
      <h1>YÖKDİL Kelime</h1>
      <p class="muted">Devam etmek için şifreyi gir.</p>
      <input type="password" id="gate-pw" placeholder="Şifre" autocomplete="current-password" autocapitalize="off" spellcheck="false" required>
      <button class="btn primary wide" type="submit">Aç</button>
      <p class="gate-err" id="gate-err" hidden>Şifre yanlış, tekrar dene.</p>
    </form>`;
  document.body.appendChild(box);
  const input = box.querySelector('#gate-pw');
  input.focus();
  box.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    let ok = false;
    try { ok = (await sha(`${SALT}:${input.value.trim()}`)) === HASH; } catch (err) { ok = false; }
    if (ok) {
      put(HASH);
      box.remove();
      load();
    } else {
      box.querySelector('#gate-err').hidden = false;
      input.value = '';
      input.focus();
    }
  });
})();
