'use strict';

const APP_VERSION = 13;
const HOSTED_URL = 'https://hakan0600.github.io/'; // bulut bağlantısı bu adrese açılır // version.json ile aynı tutulur; farklıysa pencere kendini yeniler

/* ================= Yardımcılar ================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');
const NUMERIC = new Set(['count', 'enRepeat', 'gap', 'sleep']);
const selAttr = (a, b) => (String(a) === String(b) ? ' selected' : '');
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

let current = null;
const rerender = screen => { if (current === screen) screen.render(); };

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

let modalHandler = null;
function openModal(html, handler) {
  $('#modal').innerHTML = `<div class="sheet">${html}</div>`;
  $('#modal').hidden = false;
  modalHandler = handler || null;
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; modalHandler = null; }
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
$('#modal').addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (t && modalHandler) modalHandler(t.dataset.act, t);
});

function seg(key, cur, opts, full) {
  return `<div class="seg${full ? ' full' : ''}">${opts.map(([v, l]) => `<button data-act="set" data-k="${key}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

function scopeBar(st) {
  const lists = Store.lists();
  if (st.list !== '*' && !lists.some(l => l.name === st.list)) st.list = '*';
  return `<div class="scope">
    <label class="field">Liste
      <select data-k="list"><option value="*">Tüm kelimeler (${Store.all().length})</option>${lists.map(l => `<option value="${esc(l.name)}"${selAttr(st.list, l.name)}>${esc(l.name)} (${l.count})</option>`).join('')}</select>
    </label>
    <label class="field">Hangileri
      <select data-k="filter">
        <option value="all"${selAttr(st.filter, 'all')}>Hepsi</option>
        <option value="unknown"${selAttr(st.filter, 'unknown')}>Bilmediklerim</option>
        <option value="hard"${selAttr(st.filter, 'hard')}>Zorlandıklarım</option>
      </select>
    </label>
  </div>`;
}

function emptyState(scoped) {
  if (Store.all().length && scoped !== false) {
    return `<div class="card empty"><div class="big-ic">🎉</div><h2>Bu seçimde kelime yok</h2><p class="muted">Listeyi veya "Hangileri" filtresini değiştir.</p></div>`;
  }
  return `<div class="card empty"><div class="big-ic">📷</div><h2>Henüz kelime yok</h2>
    <p class="muted">Kitaptaki kelime listesinin fotoğrafını ekle, program otomatik okuyup kaydetsin.</p>
    <a class="btn primary" href="#/ekle" style="display:inline-block;text-decoration:none">Kelime ekle</a></div>`;
}

/** select / seg ile gelen ortak ayar değişikliği; true dönerse ekran yeniden kurulmalı */
function applyKey(st, k, v) {
  st[k] = NUMERIC.has(k) ? Number(v) : v;
}

const speakWord = w => TTS.speak(w.en, 'en');

/* ================= Çalış (kartlar) ================= */
const Study = {
  st: { list: '*', filter: 'all', order: 'seq', dir: 'en2tr', flipped: false, queue: [], i: 0, built: false, rev: -1 },

  posKey() { return `study|${this.st.list}|${this.st.filter}`; },

  build() {
    const st = this.st;
    let ws = Store.query(st.list, st.filter);
    if (st.order === 'shuf') ws = shuffle(ws);
    st.queue = ws.map(w => w.id);
    st.i = st.order === 'seq' ? Math.min(Store.pos(this.posKey()), Math.max(0, st.queue.length - 1)) : 0;
    st.flipped = false;
    st.built = true;
    st.rev = Store.rev();
  },

  cur() { return Store.get(this.st.queue[this.st.i]); },

  move(delta) {
    const st = this.st;
    const n = st.queue.length;
    if (!n) return;
    st.i += delta;
    if (st.i >= n) {
      st.i = 0;
      if (st.order === 'shuf') st.queue = shuffle(st.queue);
      toast('Liste bitti, başa döndün 🎉');
    }
    if (st.i < 0) st.i = n - 1;
    st.flipped = false;
    if (st.order === 'seq') Store.setPos(this.posKey(), st.i);
    this.render();
    this.autoSpeak();
  },

  autoSpeak() {
    const w = this.cur();
    if (w && Store.settings().autoSpeak && this.st.dir === 'en2tr') speakWord(w);
  },

  render() {
    const st = this.st;
    if (!st.built || st.rev !== Store.rev()) this.build();
    let html = `<h1>Kartlarla çalış</h1>${scopeBar(st)}
      <div class="row" style="margin-bottom:14px;justify-content:space-between">
        ${seg('order', st.order, [['seq', 'Sıralı'], ['shuf', 'Karışık']])}
        ${seg('dir', st.dir, [['en2tr', 'EN → TR'], ['tr2en', 'TR → EN']])}
      </div>`;
    const w = this.cur();
    if (!w) { view.innerHTML = html + emptyState(); return; }

    const en2tr = st.dir === 'en2tr';
    const front = en2tr ? w.en : (w.tr || '—');
    const back = en2tr ? (w.tr || 'Anlam girilmemiş') : w.en;
    const n = st.queue.length;
    html += `<div class="counter"><span>${st.i + 1} / ${n}${w.known ? ' · <span class="tag ok">bildim</span>' : ''}</span><span>${esc(w.list)}</span></div>
      <div class="bar"><i style="width:${((st.i + 1) / n) * 100}%"></i></div>
      <div class="card flash" data-act="flip" style="margin-top:12px">
        <div class="lab">${en2tr ? 'İNGİLİZCE' : 'TÜRKÇE'}</div>
        <div class="word">${esc(front)}</div>
        <div class="meaning">${st.flipped ? esc(back) : ''}</div>
        ${st.flipped ? '' : '<div class="hint">Anlamı görmek için dokun</div>'}
        <button class="speak" data-act="speak" aria-label="Sesli oku">🔊</button>
      </div>
      <div class="actions">
        <button class="btn" data-act="prev" aria-label="Önceki">‹</button>
        <button class="btn bad" data-act="wrong">✗ Bilmiyorum</button>
        <button class="btn ok" data-act="right">✓ Biliyorum</button>
        <button class="btn" data-act="next" aria-label="Sonraki">›</button>
      </div>
      <div class="kbd">Klavye: Boşluk çevir · ← → gez · 1 bilmiyorum · 2 biliyorum · S oku</div>`;
    view.innerHTML = html;
  },

  act(a, el) {
    const st = this.st;
    const w = this.cur();
    switch (a) {
      case 'set': applyKey(st, el.dataset.k, el.dataset.v); this.build(); this.render(); break;
      case 'flip':
        if (!w) return;
        st.flipped = !st.flipped;
        this.render();
        if (st.flipped && st.dir === 'tr2en') speakWord(w);
        break;
      case 'speak': if (w) speakWord(w); break;
      case 'next': this.move(1); break;
      case 'prev': this.move(-1); break;
      case 'right':
      case 'wrong': {
        if (!w) return;
        const good = a === 'right';
        Store.mark(w.id, good);
        Store.update(w.id, { known: good });
        if (st.filter !== 'all' && good) {
          // Kelime bu filtreden çıktı: sıradakine geç, konumu koru
          st.queue.splice(st.i, 1);
          st.flipped = false;
          if (st.i >= st.queue.length) st.i = 0;
          if (!st.queue.length) toast('Bu seçimdeki tüm kelimeleri bildin 🎉');
          this.render();
          this.autoSpeak();
        } else {
          this.move(1);
        }
        break;
      }
    }
  },

  change(e) {
    const k = e.target.dataset.k;
    if (!k) return;
    applyKey(this.st, k, e.target.value);
    this.build();
    this.render();
  },

  key(e) {
    if (e.key === ' ' || e.key === 'Enter') { this.act('flip'); e.preventDefault(); }
    else if (e.key === 'ArrowRight') this.act('next');
    else if (e.key === 'ArrowLeft') this.act('prev');
    else if (e.key === '1') this.act('wrong');
    else if (e.key === '2') this.act('right');
    else if (e.key.toLowerCase() === 's') this.act('speak');
  },
};

/* ================= Quiz ================= */
const QuizScreen = {
  st: { list: '*', filter: 'all', count: 20, dir: 'en2tr', type: 'choice', phase: 'setup', qs: [], i: 0, res: null, score: 0, wrong: [], timer: 0, match: null },

  pool() { return Store.query(this.st.list, this.st.filter).filter(w => w.tr); },

  start(words) {
    const st = this.st;
    const all = Store.all().filter(w => w.tr);
    const picked = words || shuffle(this.pool()).slice(0, st.count === 0 ? undefined : st.count);
    if (!picked.length) return toast('Bu seçimde anlamı olan kelime yok');
    if (st.type === 'match') {
      if (picked.length < 2) return toast('Eşleştirme için en az 2 anlamlı kelime gerekli');
      return this.startMatch(picked);
    }
    if (st.type === 'choice' && new Set(all.map(w => w.tr)).size < 4) return toast('Çoktan seçmeli için en az 4 farklı kelime gerekli');
    st.qs = picked.map(w => this.makeQ(w, all));
    st.i = 0; st.score = 0; st.wrong = []; st.res = null; st.phase = 'play';
    clearTimeout(st.timer);
    this.render();
    this.autoSpeak();
  },

  /* ---- Eşleştirme: 6'şarlık turlar; soldaki İngilizce ile sağdaki Türkçe anlamı eşle ---- */
  startMatch(words) {
    const st = this.st;
    const chunks = [];
    for (let i = 0; i < words.length; i += 6) chunks.push(words.slice(i, i + 6));
    if (chunks.length > 1 && chunks[chunks.length - 1].length < 3) chunks[chunks.length - 2].push(...chunks.pop());
    st.qs = words.map(w => ({ id: w.id, en: w.en }));
    st.wrong = []; st.score = 0; st.res = null; st.i = 0;
    clearTimeout(st.timer);
    st.match = { rounds: chunks, r: 0, t0: Date.now(), ms: 0, mistakes: 0, sel: null, bad: null, wrongIds: new Set(), locked: false, left: [], right: [] };
    this.loadRound();
    st.phase = 'match';
    this.render();
  },

  loadRound() {
    const m = this.st.match;
    const ws = m.rounds[m.r];
    m.left = shuffle(ws.map(w => ({ id: w.id, text: w.en, tr: w.tr, done: false })));
    m.right = shuffle(ws.map(w => ({ id: w.id, text: w.tr, done: false })));
    m.sel = null;
    m.bad = null;
  },

  matchClick(side, idx) {
    const st = this.st;
    const m = st.match;
    if (!m || m.locked) return;
    const item = (side === 'l' ? m.left : m.right)[idx];
    if (!item || item.done) return;
    if (side === 'l' && Store.settings().autoSpeak) TTS.speak(item.text, 'en');
    if (!m.sel || m.sel.side === side) { m.sel = { side, idx }; m.bad = null; this.render(); return; }

    const other = (m.sel.side === 'l' ? m.left : m.right)[m.sel.idx];
    const leftItem = side === 'l' ? item : other;
    const rightItem = side === 'r' ? item : other;
    m.sel = null;
    // Aynı Türkçe anlamı taşıyan iki farklı kelime (ör. giant/gigantic → Devasa) de doğru sayılır
    const ok = leftItem.id === rightItem.id || fold(leftItem.tr) === fold(rightItem.text);
    if (ok) {
      leftItem.done = true;
      rightItem.done = true;
      if (!m.wrongIds.has(leftItem.id)) { Store.mark(leftItem.id, true); st.score++; }
      if (m.left.every(x => x.done)) {
        m.locked = true;
        this.render();
        setTimeout(() => { m.locked = false; if (st.phase === 'match') this.nextRound(); }, 650);
        return;
      }
    } else {
      m.mistakes++;
      if (!m.wrongIds.has(leftItem.id)) {
        m.wrongIds.add(leftItem.id);
        Store.mark(leftItem.id, false);
        st.wrong.push({ id: leftItem.id, en: leftItem.text });
      }
      m.bad = [{ side: 'l', idx: m.left.indexOf(leftItem) }, { side: 'r', idx: m.right.indexOf(rightItem) }];
      this.render();
      setTimeout(() => { m.bad = null; if (current === this && st.phase === 'match') this.render(); }, 450);
      return;
    }
    this.render();
  },

  /** Sonuna kadar beklemeden bitir: sonuç o ana kadar cevaplananlara göre hesaplanır. */
  finishEarly() {
    const st = this.st;
    clearTimeout(st.timer);
    if (st.phase === 'match') {
      const m = st.match;
      const attempted = new Set(m.wrongIds);
      for (let r = 0; r < m.r; r++) m.rounds[r].forEach(w => attempted.add(w.id));
      m.left.forEach(x => { if (x.done) attempted.add(x.id); });
      st.qs = st.qs.filter(q => attempted.has(q.id));
      m.ms = Date.now() - m.t0;
      m.locked = false;
    } else if (st.phase === 'play') {
      st.qs = st.qs.slice(0, st.i + (st.res ? 1 : 0));
      st.res = null;
    } else return;
    if (!st.qs.length) {
      st.phase = 'setup';
      toast('Henüz hiç cevap vermedin');
    } else st.phase = 'done';
    this.render();
  },

  nextRound() {
    const st = this.st;
    const m = st.match;
    m.r++;
    if (m.r >= m.rounds.length) { st.phase = 'done'; m.ms = Date.now() - m.t0; }
    else this.loadRound();
    if (current === this) this.render();
  },

  makeQ(w, all) {
    const st = this.st;
    const dir = st.dir === 'mix' ? (Math.random() < 0.5 ? 'en2tr' : 'tr2en') : st.dir;
    const answer = dir === 'en2tr' ? w.tr : w.en;
    let options = null;
    if (st.type === 'choice') {
      const distinct = [];
      for (const x of shuffle(all.filter(x => x.id !== w.id))) {
        const t = dir === 'en2tr' ? x.tr : x.en;
        if (t !== answer && !distinct.includes(t)) distinct.push(t);
        if (distinct.length === 3) break;
      }
      options = shuffle([answer, ...distinct]);
    }
    return { id: w.id, en: w.en, dir, prompt: dir === 'en2tr' ? w.en : w.tr, answer, options };
  },

  q() { return this.st.qs[this.st.i]; },

  autoSpeak() {
    const q = this.q();
    if (q && q.dir === 'en2tr' && Store.settings().autoSpeak) TTS.speak(q.en, 'en');
  },

  matches(q, val) {
    const f = fold(val);
    if (!f) return false;
    const cands = q.dir === 'en2tr' ? [q.answer, ...q.answer.split(/[,;\/]/)] : [q.answer];
    return cands.some(c => fold(c) === f);
  },

  finish(correct, given) {
    const st = this.st;
    const q = this.q();
    if (st.res) return;
    st.res = { correct, given };
    Store.mark(q.id, correct);
    if (correct) st.score++; else st.wrong.push(q);
    if (q.dir === 'tr2en' && Store.settings().autoSpeak) TTS.speak(q.en, 'en');
    this.render();
    if (correct) {
      const at = st.i;
      st.timer = setTimeout(() => { if (current === this && st.phase === 'play' && st.i === at) this.next(); }, 900);
    }
  },

  next() {
    const st = this.st;
    clearTimeout(st.timer);
    st.i++;
    st.res = null;
    if (st.i >= st.qs.length) st.phase = 'done';
    this.render();
    if (st.phase === 'play') this.autoSpeak();
  },

  render() {
    const st = this.st;
    let html = '<h1>Quiz</h1>';

    if (st.phase === 'setup') {
      const n = this.pool().length;
      html += scopeBar(st) + `<div class="card stack">
        <div><div class="small muted">${st.type === 'match' ? 'Kelime sayısı' : 'Soru sayısı'}</div>${seg('count', st.count, [[10, '10'], [20, '20'], [50, '50'], [0, 'Tümü']])}</div>
        ${st.type === 'match' ? '' : `<div><div class="small muted">Yön</div>${seg('dir', st.dir, [['en2tr', 'EN → TR'], ['tr2en', 'TR → EN'], ['mix', 'Karışık']])}</div>`}
        <div><div class="small muted">Tür</div>${seg('type', st.type, [['choice', 'Çoktan seçmeli'], ['type', 'Yazarak'], ['match', 'Eşleştirme']])}</div>
        <div class="muted small">${n ? (st.type === 'match' ? `${n} kelimeden 6'şarlık turlar hâlinde eşleştirilecek` : `${n} kelimeden sorulacak`) : 'Bu seçimde anlamı olan kelime yok'}</div>
        <button class="btn primary wide" data-act="start"${n ? '' : ' disabled'}>Başla</button>
      </div>`;
      if (!Store.all().length) html = '<h1>Quiz</h1>' + emptyState();
      view.innerHTML = html;
      return;
    }

    if (st.phase === 'match') {
      const m = st.match;
      const btn = (side, i, it) => {
        let cls = 'mbtn';
        if (it.done) cls += ' ok';
        else if (m.sel && m.sel.side === side && m.sel.idx === i) cls += ' sel';
        if (m.bad && m.bad.some(b => b.side === side && b.idx === i)) cls += ' bad';
        return `<button class="${cls}" data-act="mclick" data-side="${side}" data-i="${i}"${it.done ? ' disabled' : ''}>${esc(it.text)}</button>`;
      };
      html += `<div class="counter"><span>Tur ${m.r + 1} / ${m.rounds.length} · Hata: ${m.mistakes}</span><button class="btn sm" data-act="finish">Bitir</button></div>
        <div class="bar"><i style="width:${(m.r / m.rounds.length) * 100}%"></i></div>
        <p class="muted small" style="margin:12px 0 8px">Bir İngilizce kelimeye, sonra Türkçe anlamına dokun.</p>
        <div class="match"><div class="mcol">${m.left.map((it, i) => btn('l', i, it)).join('')}</div><div class="mcol">${m.right.map((it, i) => btn('r', i, it)).join('')}</div></div>`;
      view.innerHTML = html;
      return;
    }

    if (st.phase === 'done') {
      const total = st.qs.length;
      const pct = Math.round((st.score / total) * 100);
      html += `<div class="card stack"><div class="score">%${pct}</div>
        <div style="text-align:center" class="muted">${st.type === 'match' && st.match ? `${total} kelimeden ${st.score} tanesi ilk denemede doğru · ${st.match.mistakes} hata · ${Math.round(st.match.ms / 1000)} sn` : `${total} sorudan ${st.score} doğru`}</div>
        <div class="bar"><i style="width:${pct}%"></i></div></div>`;
      if (st.wrong.length) {
        html += `<h2>Yanlışların (${st.wrong.length})</h2><div class="wrong-list">${st.wrong.map(q => `
          <div class="wrong-item"><button class="speak sm" data-act="speakid" data-id="${q.id}">🔊</button>
          <div><b>${esc(q.en)}</b> — ${esc(Store.get(q.id)?.tr || '')}</div></div>`).join('')}</div>`;
      }
      html += `<div class="row" style="margin-top:16px">
        ${st.wrong.length ? '<button class="btn primary grow" data-act="retry">Yanlışları tekrar et</button>' : ''}
        <button class="btn grow" data-act="again">Yeni quiz</button></div>`;
      view.innerHTML = html;
      return;
    }

    const q = this.q();
    const total = st.qs.length;
    const res = st.res;
    html += `<div class="counter"><span>Soru ${st.i + 1} / ${total} · Doğru: ${st.score}</span><button class="btn sm" data-act="finish">Bitir</button></div>
      <div class="bar"><i style="width:${(st.i / total) * 100}%"></i></div>
      <div class="card" style="margin-top:14px">
        <div class="q-label">${q.dir === 'en2tr' ? 'İNGİLİZCE → TÜRKÇE' : 'TÜRKÇE → İNGİLİZCE'}</div>
        <div class="q-word">${esc(q.prompt)}</div>
        <div style="text-align:center"><button class="speak" data-act="speak" aria-label="Sesli oku">🔊</button></div>`;
    if (q.options) {
      html += `<div class="opts">${q.options.map((o, i) => {
        let cls = '';
        if (res) cls = o === q.answer ? ' right' : (o === res.given ? ' wrong' : '');
        return `<button class="opt${cls}" data-act="pick" data-i="${i}"${res ? ' disabled' : ''}><b>${i + 1}</b><span>${esc(o)}</span></button>`;
      }).join('')}</div>`;
    } else {
      html += `<div class="row" style="margin-top:16px"><input type="text" id="q-in" class="grow" placeholder="${q.dir === 'en2tr' ? 'Türkçe anlamını yaz' : 'İngilizcesini yaz'}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${res ? esc(res.given) : ''}"${res ? ' disabled' : ''}>
        ${res ? '' : '<button class="btn primary" data-act="check">Kontrol</button>'}</div>`;
    }
    if (res) {
      html += `<div class="verdict ${res.correct ? 'ok' : 'bad'}">${res.correct ? '✓ Doğru!' : `✗ Yanlış. Doğrusu: <b>${esc(q.answer)}</b>`}</div>
        <button class="btn primary wide" data-act="next" style="margin-top:12px">${st.i + 1 >= total ? 'Sonucu gör' : 'Sonraki →'}</button>`;
    }
    html += '</div>';
    view.innerHTML = html;
    if (!q.options && !res) $('#q-in')?.focus();
    if (!q.options && res) {
      // yazarak modda Enter ile ilerleyebilmek için odağı düğmeye ver
      $('[data-act="next"]')?.focus();
    }
  },

  act(a, el) {
    const st = this.st;
    switch (a) {
      case 'set': applyKey(st, el.dataset.k, el.dataset.v); this.render(); break;
      case 'start': this.start(); break;
      case 'pick': { const q = this.q(); const o = q.options[Number(el.dataset.i)]; this.finish(o === q.answer, o); break; }
      case 'check': { const v = $('#q-in').value; if (v.trim()) this.finish(this.matches(this.q(), v), v); break; }
      case 'mclick': this.matchClick(el.dataset.side, Number(el.dataset.i)); break;
      case 'finish': this.finishEarly(); break;
      case 'next': this.next(); break;
      case 'speak': { const q = this.q(); if (q) TTS.speak(q.en, 'en'); break; }
      case 'speakid': { const w = Store.get(el.dataset.id); if (w) speakWord(w); break; }
      case 'retry': this.start(st.wrong.map(q => Store.get(q.id)).filter(Boolean)); break;
      case 'again': st.phase = 'setup'; this.render(); break;
    }
  },

  change(e) {
    const k = e.target.dataset.k;
    if (k) { applyKey(this.st, k, e.target.value); this.render(); }
  },

  key(e) {
    const st = this.st;
    if (st.phase !== 'play') return;
    const q = this.q();
    if (e.target.id === 'q-in') {
      if (e.key === 'Enter') this.act('check');
      return;
    }
    const onButton = e.target instanceof Element && e.target.closest('button');
    if (q.options && !st.res && /^[1-4]$/.test(e.key)) {
      const o = q.options[Number(e.key) - 1];
      if (o !== undefined) this.finish(o === q.answer, o);
    } else if (st.res && (e.key === 'Enter' || e.key === ' ')) {
      if (onButton) return; // düğme kendi tıklamasını yapar
      this.next();
      e.preventDefault();
    }
  },
};

/* ================= Dinle (gece modu) ================= */
const Listen = {
  st: Object.assign(
    { list: '*', filter: 'all', order: 'seq', enRepeat: 1, readTr: true, gap: 2, sleep: 30, queue: [], i: 0, playing: false, token: 0, sleepAt: 0, built: false, rev: -1 },
    Store.settings().listen || {}
  ),
  wake: null,
  fails: 0,

  saveOpts() {
    const { order, enRepeat, readTr, gap, sleep } = this.st;
    Store.setSetting('listen', { order, enRepeat, readTr, gap, sleep });
  },

  build() {
    const st = this.st;
    let ws = Store.query(st.list, st.filter);
    if (st.order === 'shuf') ws = shuffle(ws);
    st.queue = ws.map(w => w.id);
    st.i = st.order === 'seq' ? Math.min(Store.pos(`listen|${st.list}|${st.filter}`), Math.max(0, st.queue.length - 1)) : 0;
    st.built = true;
    st.rev = Store.rev();
  },

  cur() { return Store.get(this.st.queue[this.st.i]); },

  wait(ms) {
    return new Promise(res => { this._wake = res; this._t = setTimeout(res, ms); });
  },

  interrupt() {
    clearTimeout(this._t);
    this._wake?.();
    TTS.cancel();
  },

  async play() {
    const st = this.st;
    if (st.playing) return;
    if (!st.built || (st.rev !== Store.rev())) this.build();
    if (!st.queue.length) return toast('Dinlenecek kelime yok');
    st.playing = true;
    if (st.sleep > 0) st.sleepAt = Date.now() + st.sleep * 60000;
    this.lockScreen();
    this.paint();
    this.run(++st.token);
  },

  pause() {
    const st = this.st;
    st.playing = false;
    st.token++;
    this.interrupt();
    this.unlockScreen();
    this.paint();
  },

  async run(tok) {
    const st = this.st;
    const alive = () => st.playing && tok === st.token;
    // Ses üst üste çalınamazsa (ör. internet yok) kullanıcı sessizlik içinde beklemesin
    const say = async (text, lang) => {
      const ok = await TTS.speak(text, lang);
      if (ok) this.fails = 0;
      else if (alive() && ++this.fails === 3) toast('Ses çalınamıyor. İnternet bağlantını kontrol et ya da Ayarlar\'dan başka bir ses seç.', 6000);
    };
    while (alive()) {
      const w = this.cur();
      if (!w) { this.pause(); break; }
      this.paint();
      this.mediaSession(w);
      for (let r = 0; r < st.enRepeat && alive(); r++) {
        await say(w.en, 'en');
        if (!alive()) return;
        if (r < st.enRepeat - 1) { await this.wait(900); if (!alive()) return; }
      }
      if (st.readTr && w.tr) {
        await this.wait(1200);
        if (!alive()) return;
        await say(w.tr, 'tr');
        if (!alive()) return;
      }
      await this.wait(st.gap * 1000);
      if (!alive()) return;
      if (st.sleepAt && Date.now() >= st.sleepAt) {
        this.pause();
        toast('Uyku zamanlayıcısı bitti, dinleme durdu 🌙');
        this.setDim(false);
        return;
      }
      st.i++;
      if (st.i >= st.queue.length) {
        st.i = 0;
        if (st.order === 'shuf') st.queue = shuffle(st.queue);
      }
      if (st.order === 'seq') Store.setPos(`listen|${st.list}|${st.filter}`, st.i);
    }
  },

  step(delta) {
    const st = this.st;
    const n = st.queue.length;
    if (!n) return;
    st.i = (st.i + delta + n) % n;
    if (st.order === 'seq') Store.setPos(`listen|${st.list}|${st.filter}`, st.i);
    if (st.playing) {
      const tok = ++st.token;
      this.interrupt();
      this.run(tok);
    } else {
      this.paint();
    }
  },

  async lockScreen() {
    try { if ('wakeLock' in navigator) this.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* desteklenmiyor */ }
  },
  unlockScreen() { try { this.wake?.release(); } catch (e) { /* yok say */ } this.wake = null; },

  mediaSession(w) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: w.en, artist: w.tr || '', album: 'YÖKDİL Kelime' });
      navigator.mediaSession.playbackState = this.st.playing ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.step(1));
      navigator.mediaSession.setActionHandler('previoustrack', () => this.step(-1));
    } catch (e) { /* bazı tarayıcılarda yok */ }
  },

  setDim(on) {
    $('#dim').hidden = !on;
    if (on) this.paint();
  },

  paint() {
    const st = this.st;
    const w = this.cur();
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('now-w', w ? w.en : '—');
    set('now-m', w && st.readTr ? w.tr : '');
    set('now-n', st.queue.length ? `${st.i + 1} / ${st.queue.length}` : '');
    set('btn-play', st.playing ? '⏸' : '▶');
    set('dim-word', w ? w.en : '');
    const bar = document.getElementById('now-bar');
    if (bar) bar.style.width = st.queue.length ? `${((st.i + 1) / st.queue.length) * 100}%` : '0';
    this.paintTimer();
  },

  paintTimer() {
    const el = document.getElementById('now-timer');
    if (!el) return;
    const st = this.st;
    if (st.playing && st.sleepAt) {
      const left = Math.max(0, Math.ceil((st.sleepAt - Date.now()) / 60000));
      el.textContent = `Uyku zamanlayıcısı: ${left} dk sonra durur`;
    } else {
      el.textContent = st.sleep > 0 ? `Uyku zamanlayıcısı: ${st.sleep} dk` : 'Uyku zamanlayıcısı kapalı';
    }
  },

  render() {
    const st = this.st;
    if (!st.built || (!st.playing && st.rev !== Store.rev())) this.build();
    const rate = Store.settings().rate;
    let html = `<h1>Sesli dinle</h1>${scopeBar(st)}`;
    if (!Store.all().length) { view.innerHTML = '<h1>Sesli dinle</h1>' + emptyState(); return; }

    html += `<div class="card now">
        <div class="q-label">ŞU AN</div>
        <div class="w" id="now-w">—</div>
        <div class="m" id="now-m"></div>
        <div class="muted small" id="now-n"></div>
        <div class="bar" style="margin-top:10px"><i id="now-bar"></i></div>
        <div class="transport">
          <button class="btn" data-act="prev" aria-label="Önceki">⏮</button>
          <button class="btn primary play" data-act="toggle" id="btn-play" aria-label="Oynat / duraklat">▶</button>
          <button class="btn" data-act="next" aria-label="Sonraki">⏭</button>
        </div>
        <div class="muted small" id="now-timer"></div>
        <div style="margin-top:12px"><button class="btn sm" data-act="dim">🌙 Ekranı karart</button></div>
      </div>
      <h2>Dinleme ayarları</h2>
      <div class="card stack">
        ${seg('order', st.order, [['seq', 'Sıralı'], ['shuf', 'Karışık']])}
        <div class="settings-grid">
          <label class="field">İngilizce kaç kez okunsun
            <select data-k="enRepeat">${[1, 2, 3].map(n => `<option value="${n}"${selAttr(st.enRepeat, n)}>${n} kez</option>`).join('')}</select></label>
          <label class="field">Kelimeler arası bekleme
            <select data-k="gap">${[1, 2, 3, 5, 8, 12].map(n => `<option value="${n}"${selAttr(st.gap, n)}>${n} sn</option>`).join('')}</select></label>
          <label class="field">Uyku zamanlayıcısı
            <select data-k="sleep">${[[0, 'Kapalı'], [15, '15 dk'], [30, '30 dk'], [45, '45 dk'], [60, '1 saat'], [90, '1,5 saat'], [120, '2 saat']].map(([v, l]) => `<option value="${v}"${selAttr(st.sleep, v)}>${l}</option>`).join('')}</select></label>
          <label class="field">Konuşma hızı: <span id="rate-v">${rate}</span>×
            <input type="range" min="0.6" max="1.3" step="0.05" value="${rate}" data-k="rate"></label>
        </div>
        <label class="check"><input type="checkbox" data-k="readTr"${st.readTr ? ' checked' : ''}> Türkçe anlamını da oku</label>
      </div>`;
    if (!TTS.supported) html += '<div class="notice" style="margin-top:12px">Bu tarayıcı sesli okumayı desteklemiyor. Edge veya Chrome kullan.</div>';
    else if (st.readTr && !TTS.hasVoice('tr')) html += '<div class="notice" style="margin-top:12px">Cihazında Türkçe ses bulunamadı. Windows/Android ayarlarından Türkçe ses paketi ekleyebilir ya da "Türkçe anlamını da oku"yu kapatabilirsin.</div>';
    html += `<div class="notice" style="margin-top:12px">🌙 Gece için: Dinlemeyi başlat, <b>Ekranı karart</b>'a bas. Ekran açık kalır ama siyah olur. Telefon ekranı tamamen kilitlenirse tarayıcı sesi durdurabilir; bu yüzden ekranı kilitleme, şarja tak.</div>`;
    view.innerHTML = html;
    this.paint();
  },

  act(a, el) {
    const st = this.st;
    switch (a) {
      case 'toggle': st.playing ? this.pause() : this.play(); break;
      case 'next': this.step(1); break;
      case 'prev': this.step(-1); break;
      case 'dim': if (!st.playing) this.play(); this.setDim(true); break;
      case 'set': applyKey(st, el.dataset.k, el.dataset.v); this.optionsChanged(true, el.dataset.k); break;
    }
  },

  change(e) {
    const st = this.st;
    const k = e.target.dataset.k;
    if (!k) return;
    if (k === 'readTr') { st.readTr = e.target.checked; this.saveOpts(); this.paint(); return; }
    if (k === 'rate') return;
    applyKey(st, k, e.target.value);
    this.optionsChanged(k === 'list' || k === 'filter', k);
  },

  input(e) {
    if (e.target.dataset.k === 'rate') {
      Store.setSetting('rate', Number(e.target.value));
      const v = document.getElementById('rate-v');
      if (v) v.textContent = e.target.value;
    }
  },

  /** rebuild: liste/filtre/sıra değişti, kuyruk baştan kurulur. key: hangi ayar değişti. */
  optionsChanged(rebuild, key) {
    const st = this.st;
    this.saveOpts();
    if (rebuild) {
      const wasPlaying = st.playing;
      if (wasPlaying) this.pause();
      this.build();
      if (wasPlaying) this.play();
    }
    if (key === 'sleep') st.sleepAt = st.playing && st.sleep > 0 ? Date.now() + st.sleep * 60000 : 0;
    this.render();
  },
};

$('#dim').addEventListener('click', () => Listen.setDim(false));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Listen.st.playing) Listen.lockScreen(); });
setInterval(() => Listen.paintTimer(), 1000);

/* ================= Kelimeler ================= */
const Words = {
  st: { list: '*', filter: 'all', q: '', limit: 200 },

  matching() {
    const st = this.st;
    const q = fold(st.q);
    return Store.query(st.list, st.filter).filter(w => !q || fold(w.en).includes(q) || fold(w.tr).includes(q));
  },

  listHTML() {
    const ws = this.matching();
    if (!ws.length) return `<div class="card empty"><p class="muted">${Store.all().length ? 'Eşleşen kelime yok.' : 'Henüz kelime yok.'}</p></div>`;
    const shown = ws.slice(0, this.st.limit);
    return shown.map(w => `<div class="wrow${w.known ? ' known' : ''}" data-act="edit" data-id="${w.id}">
        <button class="speak sm" data-act="speakid" data-id="${w.id}" aria-label="Sesli oku">🔊</button>
        <div class="t"><div class="en">${esc(w.en)}</div><div class="tr">${esc(w.tr) || '<i>anlam yok</i>'}</div></div>
        ${w.known ? '<span class="tag ok">bildim</span>' : ''}
      </div>`).join('') + (ws.length > shown.length ? `<button class="btn wide" data-act="more" style="margin-top:10px">Daha fazla göster (${ws.length - shown.length} kelime daha)</button>` : '');
  },

  render() {
    const st = this.st;
    const scoped = Store.query(st.list, 'all');
    const known = scoped.filter(w => w.known).length;
    let html = `<h1>Kelimelerim</h1>${scopeBar(st)}
      <input type="search" id="w-q" placeholder="Kelime ara (İngilizce veya Türkçe)" value="${esc(st.q)}" autocomplete="off">
      <div class="stats"><span class="tag">${scoped.length} kelime</span><span class="tag ok">${known} bildim</span><span class="tag warn">${scoped.length - known} kaldı</span></div>`;
    if (st.list !== '*') {
      html += `<div class="row" style="margin-bottom:12px"><button class="btn sm" data-act="reset">↺ Bu listeyi baştan başlat</button><button class="btn sm bad" data-act="dellist">Bu listeyi sil</button></div>`;
    }
    html += `<div id="w-list">${this.listHTML()}</div>`;
    view.innerHTML = html;
  },

  act(a, el) {
    const st = this.st;
    switch (a) {
      case 'more': st.limit += 200; $('#w-list').innerHTML = this.listHTML(); break;
      case 'speakid': { const w = Store.get(el.dataset.id); if (w) speakWord(w); break; }
      case 'edit': this.edit(el.dataset.id); break;
      case 'reset':
        if (confirm(`"${st.list}" listesindeki tüm kelimeler "bilmiyorum" durumuna döndürülsün mü?`)) {
          Store.query(st.list).forEach(w => Store.update(w.id, { known: false, ok: 0, no: 0 }));
          Store.setPos(`study|${st.list}|all`, 0);
          Store.touch();
          this.render();
          toast('Liste baştan başlatıldı');
        }
        break;
      case 'dellist':
        if (confirm(`"${st.list}" listesi ve içindeki kelimeler silinsin mi? Bu geri alınamaz.`)) {
          Store.removeList(st.list);
          st.list = '*';
          this.render();
          toast('Liste silindi');
        }
        break;
    }
  },

  change(e) {
    const k = e.target.dataset.k;
    if (k) { this.st[k] = e.target.value; this.st.limit = 200; this.render(); }
  },

  input(e) {
    if (e.target.id === 'w-q') {
      this.st.q = e.target.value;
      this.st.limit = 200;
      $('#w-list').innerHTML = this.listHTML();
    }
  },

  edit(id) {
    const w = Store.get(id);
    if (!w) return;
    openModal(`<h2>Kelimeyi düzenle</h2>
      <div class="stack">
        <label class="field">İngilizce<input type="text" id="e-en" value="${esc(w.en)}"></label>
        <label class="field">Türkçe anlamı<input type="text" id="e-tr" value="${esc(w.tr)}"></label>
        <label class="field">Liste<input type="text" id="e-list" list="dl-lists" value="${esc(w.list)}"></label>
        <datalist id="dl-lists">${Store.lists().map(l => `<option value="${esc(l.name)}">`).join('')}</datalist>
        <label class="check"><input type="checkbox" id="e-known"${w.known ? ' checked' : ''}> Bu kelimeyi biliyorum</label>
        <div class="small muted">Quiz/kart sonuçları: ${w.ok} doğru · ${w.no} yanlış</div>
        <div class="row"><button class="btn bad" data-act="del">Sil</button><span class="grow"></span>
          <button class="btn" data-act="cancel">Vazgeç</button><button class="btn primary" data-act="save">Kaydet</button></div>
      </div>`, a => {
      if (a === 'cancel') closeModal();
      else if (a === 'del') { Store.remove(id); closeModal(); this.render(); toast('Kelime silindi'); }
      else if (a === 'save') {
        const en = $('#e-en').value.trim();
        if (!en) return toast('İngilizce kelime boş olamaz');
        Store.update(id, { en, tr: $('#e-tr').value.trim(), list: $('#e-list').value.trim() || Store.DEFAULT_LIST, known: $('#e-known').checked });
        Store.touch();
        closeModal();
        this.render();
      }
    });
  },
};

/* ================= Ekle ================= */
const Add = {
  st: { tab: 'photo', text: '', ocrText: '', rows: [], list: '', mlist: Store.DEFAULT_LIST, busy: '', notFound: false, fixed: 0 },

  defaultList() {
    return `Liste ${new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`;
  },

  setBusy(txt) {
    this.st.busy = txt;
    const el = document.getElementById('busy');
    if (el) el.textContent = txt;
  },

  setRows(text) {
    const { entries } = Parser.parse(text);
    this.setRowsFrom(entries);
  },

  /** list: [{en, tr, guess?, low?}]. Mevcut kelimeler ve güvensiz okumalar işaretsiz gelir. */
  setRowsFrom(list) {
    this.st.rows = list.map(e => {
      const dup = Store.has(e.en);
      return { en: e.en, tr: e.tr, guess: !!e.guess, low: !!e.low, dup, include: !dup && !e.low, auto: !!(e.fixedTr || e.zoomTr), autoEn: !!(e.fixedEn || e.zoomEn) };
    });
    this.st.notFound = !list.length;
    if (!this.st.list) this.st.list = this.defaultList();
    rerender(this);
  },

  async handleFiles(fileList) {
    const st = this.st;
    const files = [...fileList].filter(f => f.type.startsWith('image/'));
    if (!files.length) return toast('Görsel dosyası seçilmedi');
    if (st.busy) return;
    st.tab = 'photo';
    st.busy = 'OCR motoru hazırlanıyor… (ilk seferde biraz sürer)';
    rerender(this);
    const all = [];
    try {
      for (let n = 0; n < files.length; n++) {
        const label = files.length > 1 ? `Fotoğraf ${n + 1}/${files.length}` : 'Fotoğraf';
        const res = await OCR.readPage(
          files[n],
          msg => this.setBusy(`${label}: ${msg}`),
          p => this.setBusy(`${label}: yazı okunuyor… %${Math.round(p * 100)}`)
        );
        all.push(...res.rows);
      }
    } catch (err) {
      st.busy = '';
      rerender(this);
      return toast(`Fotoğraf okunamadı: ${err.message || err}`, 4500);
    }
    const rows = files.length > 1 ? Layout.finish(all) : all;
    const fx = await Fixer.fixRows(rows, msg => this.setBusy(msg));
    st.fixed = fx.fixed || 0;
    st.busy = '';
    st.ocrText = rows.map(r => `${r.en}\t${r.tr}`).join('\n');
    this.setRowsFrom(rows);
  },

  /** Anlamı boş satırları gömülü (internetsiz) sözlükten doldurur. */
  async fillMissing() {
    const n = await Fixer.fillMissing(this.st.rows);
    toast(n ? `${n} anlam sözlükten dolduruldu` : 'Sözlükte karşılığı bulunamadı');
    rerender(this);
  },

  save() {
    const st = this.st;
    const items = st.rows.filter(r => r.include && r.en.trim());
    if (!items.length) return toast('Kaydedilecek kelime yok');
    const list = (st.list || this.defaultList()).trim();
    const { added, skipped } = Store.add(items, list);
    toast(`${added} kelime eklendi${skipped ? `, ${skipped} tanesi zaten vardı` : ''}`);
    st.rows = []; st.ocrText = ''; st.list = ''; st.text = ''; st.notFound = false;
    Words.st.list = list; Words.st.filter = 'all'; Words.st.q = ''; Words.st.limit = 200;
    location.hash = '#/kelimeler';
  },

  reviewHTML() {
    const st = this.st;
    const rows = st.rows;
    if (!rows.length) return st.notFound ? '<div class="notice" style="margin-top:14px">Metinden kelime çıkarılamadı. Aşağıdaki ham metni düzeltip "Yeniden ayrıştır"a basabilir veya daha net bir fotoğraf deneyebilirsin.</div>' : '';
    const inc = rows.filter(r => r.include);
    const missing = inc.filter(r => !r.tr.trim()).length;
    const guess = rows.filter(r => r.guess).length;
    const low = rows.filter(r => r.low).length;
    const bad = low > rows.length * 0.4;
    return `<h2>${rows.length} kelime bulundu</h2>
      <p class="muted small">Kaydetmeden önce kontrol et; yanlış okunanları düzeltebilir, istemediklerini çıkarabilirsin.${guess ? ` <b>Sarı satırlarda</b> ${guess} kelimenin İngilizce/Türkçe ayrımını program tahmin etti.` : ''}</p>
      ${st.fixed ? `<p class="small"><b>${st.fixed} satır otomatik düzeltildi</b> (yeşil "düzeltildi" etiketi): okunamayan taraf, diğer taraftan ve gömülü sözlükten bulundu.</p>` : ''}
      ${low ? `<div class="notice">${bad ? '<b>Fotoğraf iyi okunamadı.</b> Sayfayı düz tutup daha aydınlık ve net çekmeyi dene. ' : ''}<b>${low} satırdan</b> emin olunamadı; bunlar işaretsiz bırakıldı (kırmızı işaretli). Doğruysa kutuyu işaretle, yanlışsa düzelt ya da çıkar.</div>` : ''}
      <label class="field">Liste adı<input type="text" data-f="list" list="dl-lists" value="${esc(st.list)}"></label>
      <datalist id="dl-lists">${Store.lists().map(l => `<option value="${esc(l.name)}">`).join('')}</datalist>
      <div style="margin-top:10px" id="review">${rows.map((r, i) => `
        <div class="review-row${r.guess ? ' guess' : ''}${r.dup ? ' dup' : ''}${r.low ? ' low' : ''}" data-i="${i}">
          <input type="checkbox" data-f="include"${r.include ? ' checked' : ''} aria-label="Ekle">
          <div><input type="text" data-f="en" value="${esc(r.en)}" aria-label="İngilizce" autocapitalize="off" spellcheck="false">${r.dup ? '<span class="tag warn">zaten var</span>' : ''}${r.low ? '<span class="tag bad">emin değil</span>' : ''}${r.autoEn ? '<span class="tag ok">düzeltildi</span>' : ''}</div>
          <div class="tr-cell"><input type="text" data-f="tr" class="${r.include && !r.tr.trim() ? 'missing' : ''}" value="${esc(r.tr)}" placeholder="Türkçe anlam" aria-label="Türkçe">${r.auto ? '<span class="tag ok">düzeltildi</span>' : ''}</div>
          <button class="rm" data-act="rm" data-i="${i}" aria-label="Satırı sil">✕</button>
        </div>`).join('')}</div>
      <div class="row" style="margin-top:14px">
        ${missing ? `<button class="btn grow" data-act="translate">📖 ${missing} eksik anlamı sözlükten doldur</button>` : ''}
        <button class="btn primary grow" data-act="save" id="save-btn">Kaydet (${inc.length} kelime)</button>
      </div>
      ${missing ? '<p class="muted small">Anlamı boş kelimeler quizde sorulmaz. Sözlük internetsiz çalışır ama kitaptaki anlamla birebir aynı olmayabilir; kontrol et.</p>' : ''}`;
  },

  render() {
    const st = this.st;
    let html = `<h1>Kelime ekle</h1>
      <div style="margin-bottom:14px">${seg('tab', st.tab, [['photo', '📷 Fotoğraf'], ['paste', '📋 Yapıştır'], ['one', '✏️ Tek tek']], true)}</div>`;

    if (st.tab === 'photo') {
      html += `<div class="drop" id="drop">
          <div style="font-size:42px">📷</div>
          <p><b>Kitaptaki kelime listesinin fotoğrafını ekle</b></p>
          <p class="muted small">Sayfayı düz, aydınlık ve yazılar net görünecek şekilde çek. Birden fazla fotoğraf seçebilirsin.</p>
          <div class="row" style="justify-content:center">
            <button class="btn primary" data-act="camera"${st.busy ? ' disabled' : ''}>📷 Fotoğraf çek</button>
            <button class="btn" data-act="gallery"${st.busy ? ' disabled' : ''}>🖼️ Galeriden seç</button>
          </div>
          <p class="muted small" style="margin-bottom:0">Bilgisayarda: fotoğrafı buraya sürükle ya da Ctrl+V ile yapıştır.</p>
        </div>
        <input type="file" id="f-cam" accept="image/*" capture="environment" hidden>
        <input type="file" id="f-gal" accept="image/*" multiple hidden>`;
    } else if (st.tab === 'paste') {
      html += `<div class="stack"><textarea id="p-text" placeholder="Her satıra bir kelime yaz:&#10;abandon: terk etmek, vazgeçmek&#10;abate (v.) azalmak&#10;abide by - uymak">${esc(st.text)}</textarea>
        <button class="btn primary wide" data-act="parse">Kelimeleri ayır</button>
        <p class="muted small">"kelime: anlam", "kelime - anlam", "kelime (v.) anlam" ve sekmeyle ayrılmış (Excel'den kopyalanmış) satırlar okunur.</p></div>`;
    } else {
      html += `<div class="card stack">
        <label class="field">İngilizce<input type="text" id="m-en" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <label class="field">Türkçe anlamı<input type="text" id="m-tr" autocomplete="off"></label>
        <label class="field">Liste<input type="text" id="m-list" list="dl-lists" value="${esc(st.mlist)}"></label>
        <datalist id="dl-lists">${Store.lists().map(l => `<option value="${esc(l.name)}">`).join('')}</datalist>
        <button class="btn primary wide" data-act="manual">Ekle</button></div>`;
    }

    if (st.busy) html += `<div class="card" style="margin-top:14px"><div class="progress-text" id="busy">${esc(st.busy)}</div><div class="bar" style="margin-top:8px"><i style="width:100%;opacity:.35"></i></div></div>`;
    if (st.tab !== 'one') html += this.reviewHTML();
    if (st.tab === 'photo' && st.ocrText) {
      html += `<details><summary>Okunan ham metni göster / düzelt</summary>
        <textarea id="o-text">${esc(st.ocrText)}</textarea>
        <button class="btn wide" data-act="reparse" style="margin-top:8px">Yeniden ayrıştır</button></details>`;
    }
    view.innerHTML = html;
    if (st.tab === 'one') $('#m-en')?.focus();
  },

  act(a, el) {
    const st = this.st;
    switch (a) {
      case 'set': st.tab = el.dataset.v; this.render(); break;
      case 'camera': $('#f-cam').click(); break;
      case 'gallery': $('#f-gal').click(); break;
      case 'parse': st.text = $('#p-text').value; this.setRows(st.text); break;
      case 'reparse': st.ocrText = $('#o-text').value; this.setRows(st.ocrText); break;
      case 'rm': st.rows.splice(Number(el.dataset.i), 1); this.render(); break;
      case 'translate': this.fillMissing(); break;
      case 'save': this.save(); break;
      case 'manual': {
        const en = $('#m-en').value.trim();
        const tr = $('#m-tr').value.trim();
        const list = $('#m-list').value.trim() || Store.DEFAULT_LIST;
        if (!en) return toast('İngilizce kelimeyi yaz');
        st.mlist = list;
        const { added } = Store.add([{ en, tr }], list);
        toast(added ? `"${en}" eklendi` : `"${en}" zaten kayıtlı`);
        this.render();
        break;
      }
    }
  },

  change(e) {
    const t = e.target;
    if (t.id === 'f-cam' || t.id === 'f-gal') { this.handleFiles(t.files); t.value = ''; return; }
    const rowEl = t.closest('.review-row');
    if (rowEl && t.dataset.f === 'include') {
      this.st.rows[Number(rowEl.dataset.i)].include = t.checked;
      this.render();
    }
  },

  input(e) {
    const t = e.target;
    const st = this.st;
    if (t.id === 'p-text') { st.text = t.value; return; }
    if (t.dataset.f === 'list') { st.list = t.value; return; }
    const rowEl = t.closest('.review-row');
    if (!rowEl) return;
    const r = st.rows[Number(rowEl.dataset.i)];
    if (t.dataset.f === 'en') r.en = t.value;
    else if (t.dataset.f === 'tr') { r.tr = t.value; r.auto = false; t.classList.toggle('missing', r.include && !t.value.trim()); }
  },

  key(e) {
    if (e.key === 'Enter' && e.target.id === 'm-tr') this.act('manual');
    else if (e.key === 'Enter' && e.target.id === 'm-en') $('#m-tr')?.focus();
  },
};

/* Fotoğrafı sürükle-bırak veya panodan yapıştır (bilgisayar) */
document.addEventListener('dragover', e => { if (current === Add) { e.preventDefault(); $('#drop')?.classList.add('over'); } });
document.addEventListener('dragleave', () => $('#drop')?.classList.remove('over'));
document.addEventListener('drop', e => {
  if (current !== Add) return;
  e.preventDefault();
  $('#drop')?.classList.remove('over');
  Add.handleFiles(e.dataTransfer.files);
});
document.addEventListener('paste', e => {
  if (current !== Add) return;
  const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
  if (files.length) { e.preventDefault(); Add.handleFiles(files); }
});

/* ================= Ayarlar ================= */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });

function voiceOptions(lang, chosen) {
  const vs = TTS.list(lang);
  return `<option value="">Otomatik (en iyisi)</option>` + vs.map(v => `<option value="${esc(v.voiceURI)}"${selAttr(chosen, v.voiceURI)}>${esc(v.name)}</option>`).join('');
}

/** Eşitleme durumu ve eşleştirme bağlantısı (Ayarlar). */
async function showPhoneHelp() {
  const box = $('#lan-box');
  if (!box) return;
  const info = Sync.info();
  const when = t => (t ? new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—');
  box.hidden = false;
  if (info.role === 'pc') {
    const link = info.pairId ? `${HOSTED_URL}#al=${info.pairId}` : '';
    let lan = '';
    try {
      const { ip, port } = await (await fetch('__lan', { cache: 'no-store' })).json();
      if (ip && ip !== '127.0.0.1') lan = `http://${ip}:${port}`;
    } catch (e) { /* başlatıcı yok */ }
    box.innerHTML = `<h2>🔄 Telefonlarla otomatik eşitleme</h2>
      <p class="small">Bilgisayarda eklediğin, düzelttiğin, sildiğin her kelime birkaç saniye içinde <b>eşleştirilmiş cihazlara</b> kendiliğinden gider. Her telefonda yalnızca <b>bir kez</b> eşleştirme gerekir.</p>
      <p class="small">Durum: ${info.error ? `⚠️ ${esc(info.error)}` : (info.last ? `✅ son gönderim ${when(info.last)}` : (info.pairId ? '✅ hazır' : 'henüz gönderilmedi'))}</p>
      ${link ? `<p class="small"><b>Telefonu eşleştirmek için</b> bu bağlantıyı telefonda bir kez aç (ya da masaüstündeki <i>YOKDIL Eslestirme QR.png</i>'yi okut):</p>
          <p style="word-break:break-all;font-weight:700;user-select:all">${esc(link)}</p>
          <div class="row"><button class="btn primary grow" data-act="copy-link" data-link="${esc(link)}">📋 Bağlantıyı kopyala</button><button class="btn grow" data-act="sync-now">Şimdi gönder</button></div>
          <p class="small muted">Bu bağlantı bir anahtardır: bilen herkes kelime listeni okuyabilir. Başkasına verme.</p>`
        : '<button class="btn primary wide" data-act="sync-now">İlk gönderimi şimdi yap</button>'}
      ${lan ? `<details><summary>Aynı Wi-Fi'de doğrudan bilgisayara bağlanmak (isteğe bağlı)</summary>
          <p class="small">Adres: <b style="user-select:all">${esc(lan)}</b></p>
          <ol class="small" style="padding-left:20px;margin:8px 0">
            <li>Bilgisayarda <b>telefon_izni.bat</b>'ı bir kez çalıştır.</li>
            <li>Telefonda Chrome'a <b>chrome://flags</b> yaz → "<i>Insecure origins treated as secure</i>" → adresi ekle → Enabled → Relaunch.</li>
            <li>Adresi aç → menü ⋮ → <b>Uygulamayı yükle</b>.</li></ol></details>` : ''}`;
    return;
  }
  box.innerHTML = `<h2>🔄 Bilgisayarla otomatik eşitleme</h2>` + (info.cloudId
    ? `<p class="small">✅ Açık. Bilgisayara eklediğin kelimeler bu cihaza kendiliğinden gelir. Son kontrol: ${when(info.last)}${info.error ? ` · ⚠️ ${esc(info.error)}` : ''}</p>
       <div class="row"><button class="btn grow" data-act="sync-now">Şimdi kontrol et</button><button class="btn grow" data-act="sync-off">Kapat</button></div>`
    : `<p class="small">Kapalı. Açmak için bilgisayardaki uygulamanın Ayarlar bölümünde görünen <b>eşleştirme bağlantısını bu cihazda bir kez aç</b> (ya da aşağıya yapıştır).</p>`);
}

const gistIdOf = text => (String(text || '').match(/[0-9a-f]{20,40}/i) || [])[0] || '';

/** Bu cihazı bilgisayarla eşleştir: bir kez yapılır, sonra her şey kendiliğinden akar. */
async function pairDevice(id) {
  if (Sync.role === 'pc') return toast('Bu bilgisayar ana kaynak; eşleştirmeye gerek yok');
  Store.setSetting('cloudId', id);
  closeModal();
  await Sync.pull(true);
}

/** Uygulama #al=<kod> ile açıldıysa eşleştirmeyi öner. */
function checkCloudLink() {
  const id = gistIdOf((location.hash.match(/^#al=(.+)$/) || [])[1]);
  if (!id) return;
  history.replaceState(null, '', location.pathname + location.search); // kod adres çubuğunda kalmasın
  if (Sync.role === 'pc') return;
  openModal(`<h2>🔄 Bilgisayarla eşleştir</h2><div class="stack">
      <p>Bu cihaz bilgisayarla eşleştirilsin mi? Bundan sonra bilgisayarda eklediğin kelimeler burada <b>kendiliğinden</b> görünür; hiçbir şeye basman gerekmez. Bu cihazdaki "bildim" ilerlemen korunur.</p>
      <button class="btn primary wide" data-act="cloud-yes">Eşleştir</button>
      <button class="btn wide" data-act="cancel">Vazgeç</button></div>`, a => {
    if (a === 'cancel') closeModal();
    else if (a === 'cloud-yes') pairDevice(id);
  });
}

function openSettings() {
  const s = Store.settings();
  openModal(`<h2>Ayarlar</h2><div class="stack">
      <label class="check"><input type="checkbox" id="s-auto"${s.autoSpeak ? ' checked' : ''}> Kartta ve quizde kelimeyi otomatik seslendir</label>
      <label class="field">İngilizce ses<select id="s-en">${voiceOptions('en', s.enVoice)}</select></label>
      <label class="field">Türkçe ses<select id="s-tr">${voiceOptions('tr', s.trVoice)}</select></label>
      <div class="row"><button class="btn sm" data-act="test-en">🔊 İngilizce dene</button><button class="btn sm" data-act="test-tr">🔊 Türkçe dene</button></div>
      ${TTS.supported ? '' : '<div class="notice">Bu tarayıcı sesli okumayı desteklemiyor.</div>'}
      <h2>Yedek</h2>
      <p class="muted small">Kelimeler bu cihazdaki tarayıcıda saklanır. Bilgisayardan telefona taşımak için yedeği indirip diğer cihazda içe aktar.</p>
      <div class="row"><button class="btn grow" data-act="export">⬇️ Yedeği indir</button><button class="btn grow" data-act="import">⬆️ Yedeği yükle</button></div>
      <input type="file" id="s-file" accept="application/json,.json" hidden>
      <div id="lan-box" hidden></div>
      <h2>Eşleştirme bağlantısı yapıştır</h2>
      <p class="small muted">Bilgisayardaki uygulamanın Ayarlar bölümünde yazan eşleştirme bağlantısını ya da kodunu yapıştır. Bir kez yeter, her ağdan çalışır.</p>
      <div class="row"><input type="text" id="cloud-in" class="grow" placeholder="Bağlantı ya da kod" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" data-act="pull-cloud">Al</button></div>
      <h2>Uygulama</h2>
      ${installPrompt ? '<button class="btn primary wide" data-act="install">📲 Uygulamayı yükle</button>' : '<p class="muted small">Yüklemek için: Edge/Chrome menüsü → "Uygulamayı yükle" (bilgisayar) veya "Ana ekrana ekle" (telefon). iPhone: Paylaş → Ana Ekrana Ekle.</p>'}
      ${Store.canPersist() ? '' : '<div class="notice">Bu tarayıcı veri saklamayı engelliyor; kapatınca kelimeler kaybolur. Gizli pencere kullanmıyorsan site verisi iznini kontrol et.</div>'}
      <button class="btn bad wide" data-act="wipe">Tüm kelimeleri sil</button>
      <button class="btn wide" data-act="cancel">Kapat</button>
    </div>`, (a, el) => {
    if (a === 'cancel') closeModal();
    else if (a === 'test-en') TTS.speak('abandon', 'en');
    else if (a === 'test-tr') TTS.speak('terk etmek, vazgeçmek', 'tr');
    else if (a === 'export') {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `yokdil-kelimeler-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    } else if (a === 'import') $('#s-file').click();
    else if (a === 'install') { installPrompt.prompt(); installPrompt = null; closeModal(); }
    else if (a === 'sync-now') { if (Sync.role === 'pc') Sync.push(true).then(() => { showPhoneHelp(); toast(Sync.info().error ? 'Gönderilemedi' : 'Gönderildi'); }); else Sync.pull(true).then(showPhoneHelp); }
    else if (a === 'sync-off') { Store.setSetting('cloudId', ''); showPhoneHelp(); toast('Eşitleme kapatıldı'); }
    else if (a === 'copy-link') navigator.clipboard?.writeText(el.dataset.link).then(() => toast('Bağlantı kopyalandı'), () => toast('Kopyalanamadı, bağlantıyı elle seç'));
    else if (a === 'pull-cloud') { const id = gistIdOf($('#cloud-in').value); id ? pairDevice(id) : toast('Geçerli bir bağlantı ya da kod yapıştır'); }
    else if (a === 'wipe' && confirm('Tüm kelimeler ve ilerleme silinsin mi? Bu geri alınamaz.')) {
      Store.clear();
      closeModal();
      route();
      toast('Tüm kelimeler silindi');
    }
  });
  showPhoneHelp();
  const m = $('#modal');
  m.onchange = e => {
    if (e.target.id === 's-auto') Store.setSetting('autoSpeak', e.target.checked);
    else if (e.target.id === 's-en') Store.setSetting('enVoice', e.target.value);
    else if (e.target.id === 's-tr') Store.setSetting('trVoice', e.target.value);
    else if (e.target.id === 's-file' && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try { toast(`${Store.importJSON(String(reader.result))} kelime içe aktarıldı`); closeModal(); route(); }
        catch (err) { toast(`Yedek okunamadı: ${err.message}`, 4000); }
      };
      reader.readAsText(e.target.files[0]);
    }
  };
}
$('#btn-settings').addEventListener('click', openSettings);

/* ================= Yönlendirme ================= */
const screens = { calis: Study, quiz: QuizScreen, dinle: Listen, kelimeler: Words, ekle: Add };

function route() {
  const name = location.hash.replace(/^#\/?/, '') || 'calis';
  const key = screens[name] ? name : 'calis';
  current = screens[key];
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === key));
  window.scrollTo(0, 0);
  current.render();
}

view.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (t) current.act?.(t.dataset.act, t, e);
});
view.addEventListener('change', e => current.change?.(e));
view.addEventListener('input', e => current.input?.(e));
document.addEventListener('keydown', e => {
  if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (!$('#dim').hidden) { if (e.key === 'Escape') Listen.setDim(false); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const el = e.target instanceof Element ? e.target : document.body;
  const typing = /INPUT|TEXTAREA|SELECT/.test(el.tagName);
  if (typing && !(current === QuizScreen || current === Add)) return;
  if ((e.key === ' ' || e.key === 'Enter') && el.closest('button, a') && current === Study) return;
  current.key?.(e);
});
window.addEventListener('hashchange', route);
window.addEventListener('hashchange', checkCloudLink);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* çevrimdışı önbellek olmadan da çalışır */ });
}
route();
checkCloudLink();
Sync.start();

/* Kod güncellenince açık pencere kendini yeniler (kullanıcının pencereyi kapatıp açmasına gerek kalmasın) */
$('#ver').textContent = `v${APP_VERSION}`;
async function checkVersion() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    const { v } = await r.json();
    if (v !== APP_VERSION && !Add.st.busy && !Add.st.rows.length && $('#modal').hidden) {
      toast('Program güncellendi, yenileniyor…', 1500);
      setTimeout(() => location.reload(), 1200);
    }
  } catch (e) { /* çevrimdışı: mevcut sürümle devam */ }
}
setInterval(checkVersion, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
