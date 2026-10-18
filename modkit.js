/* PZ Editor mod kit: collects changed script files from every editor (stored in this
   browser's IndexedDB) and packs them into a Build 42 mod folder as a .zip. */
(function () {
  'use strict';
  var BASE = '42/media/scripts/generated/';
  var FOLDERS = {
    items: 'items/',
    recipes: 'recipes/',
    blacksmith: 'entities/blacksmith/craftRecipes/',
    pottery: 'entities/pottery/craftRecipes/'
  };
  var EDITORS = {
    clothing: ['items', 'Clothing'], container: ['items', 'Containers'], drainable: ['items', 'Drainables'],
    food: ['items', 'Food'], key: ['items', 'Keys'], literature: ['items', 'Literature'],
    normal: ['items', 'Normal items'], weapon: ['items', 'Weapons'], weaponpart: ['items', 'Weapon parts'],
    recipes: ['recipes', 'Recipes'], blacksmith: ['blacksmith', 'Blacksmith'], pottery: ['pottery', 'Pottery']
  };
  var SKEY = 'pz-mod-settings';
  var DEFAULTS = { name: 'My First Mod', id: 'MyFirstMod', description: 'Script changes made with PZ Editor.', author: '' };

  /* ---------- storage: IndexedDB, with an in-memory fallback ---------- */
  var mem = {}, dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok) {
      try {
        var rq = indexedDB.open('pz-editor-mod', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('files', { keyPath: 'key' }); };
        rq.onsuccess = function () { ok(rq.result); };
        rq.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      if (!d) return fn(null);
      return new Promise(function (ok, no) {
        var t = d.transaction('files', mode), st = t.objectStore('files'), out = fn(st);
        t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { no(t.error); };
      });
    });
  }
  function list() {
    return db().then(function (d) {
      if (!d) return Object.keys(mem).map(function (k) { return mem[k]; });
      return new Promise(function (ok) {
        var rq = d.transaction('files', 'readonly').objectStore('files').getAll();
        rq.onsuccess = function () { ok(rq.result || []); };
        rq.onerror = function () { ok([]); };
      });
    }).then(function (a) { return a.sort(function (x, y) { return x.path.localeCompare(y.path); }); });
  }
  function pathFor(editor, name) {
    var e = EDITORS[editor], folder = FOLDERS[e ? e[0] : 'items'];
    return BASE + folder + name;
  }
  /* Replace every stored file of one editor with `files` ({name: text}). */
  function sync(editor, files) {
    var now = Date.now();
    return list().then(function (all) {
      var keep = {};
      Object.keys(files).forEach(function (n) { keep[editor + '/' + n] = 1; });
      return tx('readwrite', function (st) {
        all.forEach(function (f) {
          if (f.editor === editor && !keep[f.key]) { if (st) st.delete(f.key); else delete mem[f.key]; }
        });
        Object.keys(files).forEach(function (n) {
          var prev = all.filter(function (f) { return f.key === editor + '/' + n; })[0];
          var rec = { key: editor + '/' + n, editor: editor, name: n, path: pathFor(editor, n), text: files[n],
            updated: prev && prev.text === files[n] ? prev.updated : now };
          if (st) st.put(rec); else mem[rec.key] = rec;
        });
      });
    }).then(notify, function () {});
  }
  function remove(key) { return tx('readwrite', function (st) { if (st) st.delete(key); else delete mem[key]; }).then(notify); }
  function clear() { return tx('readwrite', function (st) { if (st) st.clear(); else mem = {}; }).then(notify); }

  /* ---------- settings ---------- */
  function settings(v) {
    if (v) { try { localStorage.setItem(SKEY, JSON.stringify(v)); } catch (e) {} return v; }
    var s = {};
    try { s = JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; } catch (e) {}
    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) { o[k] = s[k] != null ? s[k] : DEFAULTS[k]; });
    return o;
  }
  function cleanId(id) { return String(id || '').replace(/[^A-Za-z0-9_\-]/g, '') || DEFAULTS.id; }
  function modInfo(s) {
    var lines = ['name=' + (s.name || DEFAULTS.name), 'id=' + cleanId(s.id), 'description=' + (s.description || '')];
    if (s.author) lines.push('author=' + s.author);
    return lines.join('\r\n') + '\r\n';
  }

  /* ---------- zip ---------- */
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise(function (ok, no) {
      var sc = document.createElement('script'); sc.src = 'jszip.min.js';
      sc.onload = function () { ok(window.JSZip); }; sc.onerror = function () { no(new Error('jszip.min.js could not be loaded')); };
      document.head.appendChild(sc);
    });
  }
  function build() {
    var s = settings(), id = cleanId(s.id);
    return Promise.all([list(), loadZip()]).then(function (r) {
      var files = r[0], Z = r[1], z = new Z(), root = z.folder(id);
      root.file('mod.info', modInfo(s));
      root.folder('common').folder('media');
      root.file('42/mod.info', modInfo(s));
      files.forEach(function (f) { root.file(f.path, f.text); });
      return z.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function (blob) {
        return { blob: blob, filename: id + '.zip', count: files.length, id: id };
      });
    });
  }
  function download() {
    return build().then(function (r) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(r.blob); a.download = r.filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      return r;
    });
  }

  /* ---------- change notifications (this tab + other tabs) ---------- */
  var subs = [], bc = null;
  try { bc = new BroadcastChannel('pz-editor-mod'); bc.onmessage = function () { fire(); }; } catch (e) {}
  function fire() { list().then(function (a) { subs.forEach(function (fn) { try { fn(a); } catch (e) {} }); }); }
  function notify() { fire(); try { if (bc) bc.postMessage('changed'); } catch (e) {} }
  function onChange(fn) { subs.push(fn); list().then(fn); }

  /* ---------- editor wiring ---------- */
  /* opts: {editor, collect: () => ({name:text}), flushHooks} */
  function attach(opts) {
    var timer = null;
    function flush() { timer = null; return sync(opts.editor, opts.collect()); }
    function schedule() { clearTimeout(timer); timer = setTimeout(flush, 500); }
    function flushNow() { if (timer) { clearTimeout(timer); return flush(); } return Promise.resolve(); }
    window.addEventListener('pagehide', function () { if (timer) { clearTimeout(timer); flush(); } });

    var actions = document.querySelector('header .actions');
    if (actions) {
      var b = document.createElement('button');
      b.type = 'button'; b.id = 'modZipBtn'; b.title = 'Download every changed file from all editors as a ready-to-install mod';
      b.textContent = 'Mod .zip';
      b.addEventListener('click', function () {
        b.disabled = true;
        flushNow().then(download).then(function (r) {
          b.textContent = r.count ? 'Downloaded ' + r.filename : 'Mod is empty';
          setTimeout(function () { b.disabled = false; render(lastList); }, 2200);
        }, function () { b.disabled = false; b.textContent = 'Zip failed'; });
      });
      var exp = document.getElementById('exportBtn');
      actions.insertBefore(b, exp || null);
    }
    var lastList = [];
    function render(a) {
      lastList = a;
      var btn = document.getElementById('modZipBtn'); if (!btn || btn.disabled) return;
      btn.textContent = 'Mod .zip' + (a.length ? ' (' + a.length + ')' : '');
    }
    onChange(render);
    return { schedule: schedule, flushNow: flushNow, clearMine: function () { clearTimeout(timer); timer = null; return sync(opts.editor, {}); } };
  }

  window.PZMod = {
    EDITORS: EDITORS, BASE: BASE, pathFor: pathFor, list: list, sync: sync, remove: remove, clear: clear,
    settings: settings, cleanId: cleanId, modInfo: modInfo, build: build, download: download, onChange: onChange, attach: attach
  };
})();
