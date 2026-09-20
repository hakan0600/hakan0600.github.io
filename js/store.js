/* Kelime deposu: tarayıcı içinde (localStorage) saklanır, JSON olarak yedeklenebilir. */
const Store = (() => {
  const KEY = 'yokdil.v1';
  const DEFAULT_LIST = 'Genel';
  const DEFAULT_SETTINGS = { autoSpeak: false, enVoice: '', trVoice: '', rate: 0.9 };
  let db = { words: [], settings: {}, pos: {} };
  let storageOk = true;
  let rev = 0; // kelime kümesi değiştikçe artar; ekranlar kuyruğu yenilemek için bakar

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) db = Object.assign({ words: [], settings: {}, pos: {} }, JSON.parse(raw));
    } catch (e) {
      storageOk = false;
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      storageOk = false;
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const norm = s => String(s || '').trim().toLowerCase();

  const all = () => db.words;
  const get = id => db.words.find(w => w.id === id);
  const canPersist = () => storageOk;

  function lists() {
    const counts = new Map();
    for (const w of db.words) counts.set(w.list, (counts.get(w.list) || 0) + 1);
    return [...counts].map(([name, count]) => ({ name, count }));
  }

  /** list: '*' hepsi; filter: 'all' | 'unknown' | 'hard' */
  function query(list = '*', filter = 'all') {
    return db.words.filter(w => {
      if (list !== '*' && w.list !== list) return false;
      if (filter === 'unknown') return !w.known;
      if (filter === 'hard') return w.no > w.ok && !w.known;
      return true;
    });
  }

  function has(en) {
    const k = norm(en);
    return db.words.some(w => norm(w.en) === k);
  }

  /** items: [{en, tr}] — var olan kelimeler atlanır. */
  function add(items, list = DEFAULT_LIST) {
    let added = 0;
    let skipped = 0;
    for (const it of items) {
      const en = String(it.en || '').trim();
      if (!en || has(en)) { skipped++; continue; }
      db.words.push({ id: uid(), en, tr: String(it.tr || '').trim(), list: list || DEFAULT_LIST, known: false, ok: 0, no: 0, added: Date.now() });
      added++;
    }
    rev++;
    save();
    return { added, skipped };
  }

  function update(id, patch) {
    const w = get(id);
    if (w) { Object.assign(w, patch); save(); }
    return w;
  }

  function remove(id) {
    db.words = db.words.filter(w => w.id !== id);
    rev++;
    save();
  }

  function removeList(name) {
    db.words = db.words.filter(w => w.list !== name);
    rev++;
    save();
  }

  /** Kuyrukları yeniden kurdurmak için (ör. "bildim" durumu toplu değişince) */
  function touch() { rev++; save(); }

  function mark(id, correct) {
    const w = get(id);
    if (!w) return;
    if (correct) w.ok++; else w.no++;
    save();
  }

  const settings = () => Object.assign({}, DEFAULT_SETTINGS, db.settings);
  function setSetting(k, v) { db.settings[k] = v; save(); }

  const pos = key => db.pos[key] || 0;
  function setPos(key, i) { db.pos[key] = i; save(); }

  function exportJSON() {
    return JSON.stringify({ app: 'yokdil-kelime', version: 1, exported: new Date().toISOString(), words: db.words, settings: db.settings }, null, 1);
  }

  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.words)) throw new Error('Geçersiz yedek dosyası');
    let added = 0;
    for (const w of data.words) {
      if (!w || !w.en || has(w.en)) continue;
      db.words.push(Object.assign({ known: false, ok: 0, no: 0, added: Date.now(), list: DEFAULT_LIST, tr: '' }, w, { id: uid() }));
      added++;
    }
    rev++;
    save();
    return added;
  }

  function clear() { db = { words: [], settings: db.settings, pos: {} }; rev++; save(); }

  load();
  return { all, get, lists, query, has, add, update, remove, removeList, touch, mark, settings, setSetting, pos, setPos, exportJSON, importJSON, clear, canPersist, rev: () => rev, DEFAULT_LIST };
})();

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
