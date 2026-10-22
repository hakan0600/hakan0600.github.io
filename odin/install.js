/* Kurulum ekranı: QR bu sayfayı ?kur=1 ile açar.
   Android Chrome: tek dokunuşla kurar (beforeinstallprompt).
   Başka uygulamanın penceresi (kamera, Lens, YÖKDİL uygulaması): "Chrome'da aç" ile gerçek Chrome'a geçer.
   iPhone: Safari'de Paylaş > Ana Ekrana Ekle adımlarını gösterir. Kurulduktan sonra görünmez. */
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const box = $('#install');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const safari = ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Instagram|FBAN|FBAV|GSA/i.test(ua);
  const chrome = android && /Chrome\//.test(ua) && !/; wv\)|EdgA|SamsungBrowser|OPR|Instagram|FBAN|FBAV|GSA\//.test(ua);
  let installed = false; try { installed = localStorage.getItem('odin.installed') === '1'; } catch {}
  if (installed) return;
  // kurulu değilken tam ekran pencere = başka bir uygulamanın penceresi (ör. aynı sitedeki YÖKDİL uygulaması)
  const foreign = standalone;
  const wanted = new URLSearchParams(location.search).has('kur');

  let deferred = null;
  const show = (html) => { box.innerHTML = html; box.hidden = false; };
  const chromeLink = 'intent://hakan0600.github.io/odin/?kur=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fhakan0600.github.io%2Fodin%2F%3Fkur%3D1;end';

  function render() {
    if (deferred) {
      show(`<strong>Odin'i telefona kur</strong><p>Tek dokunuşla ana ekrana eklenir, uygulama gibi açılır.</p><button id="instBtn" type="button">Ana ekrana ekle</button>`);
      $('#instBtn').onclick = async () => {
        deferred.prompt();
        const r = await deferred.userChoice.catch(() => ({}));
        deferred = null;
        if (r.outcome === 'accepted') done(); else render();
      };
    } else if (ios && (!safari || foreign)) {
      show(`<strong>Odin'i telefona kur</strong><p>Bu pencerede kurulamıyor. Adresi kopyala, <b>Safari</b>'de aç.</p><code>hakan0600.github.io/odin</code><button id="copyBtn" type="button">Adresi kopyala</button>`);
      copyBtn();
    } else if (ios) {
      show(`<strong>Odin'i telefona kur</strong><ol><li>Alttaki <b>Paylaş</b> düğmesine dokun <span class="ic">⬆︎</span></li><li><b>Ana Ekrana Ekle</b>'yi seç, sonra <b>Ekle</b>.</li></ol>`);
    } else if (android && (!chrome || foreign)) {
      show(`<strong>Odin'i telefona kur</strong><p>Bu pencerede kurulamıyor. Chrome'da açınca tek dokunuşla kurulur.</p><a id="chromeBtn" class="btn" href="${chromeLink}">Chrome'da aç</a><button id="copyBtn" type="button" class="ghost">Adresi kopyala</button>`);
      copyBtn();
    } else if (android) {
      show(`<strong>Odin'i telefona kur</strong><p>Sağ üstteki <b>⋮</b> menüsünden <b>Ana ekrana ekle</b> ya da <b>Uygulamayı yükle</b>'yi seç.</p><a class="btn ghost" href="${chromeLink}">Yeni Chrome sekmesinde aç</a>`);
    } else if (wanted) {
      show(`<strong>Odin'i telefona kur</strong><p>Bu QR'ı telefonunla okut. Android'de Chrome, iPhone'da Safari kullan.</p>`);
    }
  }
  function copyBtn() {
    const b = $('#copyBtn'); if (!b) return;
    b.onclick = () => navigator.clipboard.writeText('https://hakan0600.github.io/odin/?kur=1').then(() => { b.textContent = 'Kopyalandı'; }, () => { b.textContent = 'hakan0600.github.io/odin'; });
  }
  function done() {
    try { localStorage.setItem('odin.installed', '1'); } catch {}
    show(`<strong>Kuruldu</strong><p>Ana ekranındaki turuncu tilki simgesinden açabilirsin.</p>`);
    setTimeout(() => { box.hidden = true; }, 6000);
  }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; render(); });
  addEventListener('appinstalled', done);
  render();
})();
