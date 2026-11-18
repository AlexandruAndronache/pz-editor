/* PZ Editor mod kit: keeps every editor's changes (stored in this browser's IndexedDB) so they
   survive switching pages, and packs the changed script files into a Build 42 mod folder as a .zip. */
(function () {
  'use strict';
  var BASE = '42/media/scripts/generated/';
  var FOLDERS = {
    items: 'items/',
    recipes: 'recipes/',
    blacksmith: 'entities/blacksmith/craftRecipes/',
    pottery: 'entities/pottery/craftRecipes/',
    entities: 'entities/',
    /* '@' = full path inside the mod's 42/ folder, not under media/scripts/generated */
    foraging: '@42/media/lua/shared/Foraging/Categories/'
  };
  var EDITORS = {
    clothing: ['items', 'Clothing'], container: ['items', 'Containers'], drainable: ['items', 'Drainables'],
    food: ['items', 'Food'], key: ['items', 'Keys'], literature: ['items', 'Literature'],
    normal: ['items', 'Normal items'], weapon: ['items', 'Weapons'], weaponpart: ['items', 'Weapon parts'],
    recipes: ['recipes', 'Recipes'], entities: ['entities', 'Entities'], foraging: ['foraging', 'Foraging'],
    blacksmith: ['blacksmith', 'Blacksmith (old page)'], pottery: ['pottery', 'Pottery (old page)']
  };
  var SKEY = 'pz-mod-settings';
  var DEFAULTS = { name: 'My First Mod', id: 'MyFirstMod', description: 'Script changes made with PZ Editor.', author: '' };

  /* ---------- storage: IndexedDB, with an in-memory fallback ----------
     'files'  = finished script files that go into the mod zip
     'drafts' = each editor's full editing state, so edits survive leaving the page */
  var mem = {}, memDrafts = {}, dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok) {
      try {
        var rq = indexedDB.open('pz-editor-mod', 2);
        rq.onupgradeneeded = function () {
          var d = rq.result;
          if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'key' });
          if (!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts', { keyPath: 'editor' });
        };
        rq.onsuccess = function () { ok(rq.result); };
        rq.onerror = function () { ok(null); };
        rq.onblocked = function () { ok(null); };
      } catch (e) { ok(null); }
    });
    return dbp;
  }
  /* fn receives {files, drafts} object stores (or null when IndexedDB is unavailable) */
  function tx(mode, fn) {
    return db().then(function (d) {
      if (!d) return fn(null);
      return new Promise(function (ok, no) {
        var t = d.transaction(['files', 'drafts'], mode);
        var out = fn({ files: t.objectStore('files'), drafts: t.objectStore('drafts') });
        t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { no(t.error); };
        t.onabort = function () { no(t.error); };
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
  function getDraft(editor) {
    return db().then(function (d) {
      if (!d) return memDrafts[editor] ? memDrafts[editor].data : null;
      return new Promise(function (ok) {
        var rq = d.transaction('drafts', 'readonly').objectStore('drafts').get(editor);
        rq.onsuccess = function () { ok(rq.result ? rq.result.data : null); };
        rq.onerror = function () { ok(null); };
      });
    });
  }
  function pathFor(editor, name) {
    var e = EDITORS[editor], folder = FOLDERS[e ? e[0] : 'items'];
    return folder.charAt(0) === '@' ? folder.slice(1) + name : BASE + folder + name;
  }
  /* Replace every stored file of one editor with `files` ({name: text}) and, in the same
     transaction, its draft (undefined = leave as is, null = delete). */
  function sync(editor, files, draft) {
    var now = Date.now();
    return list().then(function (all) {
      var keep = {};
      Object.keys(files).forEach(function (n) { keep[editor + '/' + n] = 1; });
      return tx('readwrite', function (st) {
        all.forEach(function (f) {
          if (f.editor === editor && !keep[f.key]) { if (st) st.files.delete(f.key); else delete mem[f.key]; }
        });
        Object.keys(files).forEach(function (n) {
          var prev = all.filter(function (f) { return f.key === editor + '/' + n; })[0];
          var rec = { key: editor + '/' + n, editor: editor, name: n, path: pathFor(editor, n), text: files[n],
            updated: prev && prev.text === files[n] ? prev.updated : now };
          if (st) st.files.put(rec); else mem[rec.key] = rec;
        });
        if (draft === null) { if (st) st.drafts.delete(editor); else delete memDrafts[editor]; }
        else if (draft !== undefined) {
          var drec = { editor: editor, data: draft, updated: now };
          if (st) st.drafts.put(drec); else memDrafts[editor] = drec;
        }
      });
    }).then(notify, function (e) { if (window.console) console.error('PZ Editor: saving failed', e); });
  }
  /* Removing a file from the mod also drops that file's edits from its editor on the next visit. */
  function remove(key) { return tx('readwrite', function (st) { if (st) st.files.delete(key); else delete mem[key]; }).then(notify); }
  function clear() { return tx('readwrite', function (st) { if (st) { st.files.clear(); st.drafts.clear(); } else { mem = {}; memDrafts = {}; } }).then(notify); }
  /* cheap fingerprint of the built-in source, so a draft made against older game data is detected */
  function sig(str) {
    str = String(str); var h = 2166136261, step = Math.max(1, Math.floor(str.length / 4096));
    for (var i = 0; i < str.length; i += step) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return str.length + ':' + (h >>> 0).toString(36);
  }

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
      /* newest wins when two editors produced the same path */
      var byPath = {};
      files.forEach(function (f) { if (!byPath[f.path] || f.updated > byPath[f.path].updated) byPath[f.path] = f; });
      files = Object.keys(byPath).map(function (k) { return byPath[k]; });
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
  /* opts: {editor,
            collect: () => ({name: text})          changed files for the mod,
            draft:   (files) => data | null        full editing state (null = nothing to keep),
            restore: (data, files) => void         put a saved state back on page load;
                                                   files = this editor's files still in the mod} */
  function attach(opts) {
    var timer = null, ready = false;
    function flush() {
      timer = null;
      if (!ready) { schedule(); return Promise.resolve(); }
      var files = opts.collect();
      var dr = opts.draft ? opts.draft(files) : undefined;
      return sync(opts.editor, files, dr);
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(flush, 300); }
    function flushNow() { if (timer) { clearTimeout(timer); return flush(); } return Promise.resolve(); }

    /* Restore this editor's saved state before anything else is saved. */
    var readyP = Promise.all([opts.restore ? getDraft(opts.editor) : null, list()]).then(function (r) {
      var mine = {};
      r[1].forEach(function (f) { if (f.editor === opts.editor) mine[f.name] = f.text; });
      var had = r[0] != null || Object.keys(mine).length > 0;
      if (opts.restore && had) {
        try { opts.restore(r[0], mine); } catch (e) { if (window.console) console.error('PZ Editor: restore failed', e); }
      }
      ready = true;
      if (had && opts.restore) return flush();  /* re-save so files and draft agree */
    }, function () { ready = true; });

    /* Save pending edits before leaving the page: links get held until the save is done. */
    document.addEventListener('click', function (e) {
      if (!timer || e.defaultPrevented) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var u; try { u = new URL(a.href, location.href); } catch (x) { return; }
      if (u.origin !== location.origin) return;
      if (u.pathname === location.pathname && u.search === location.search && u.hash) return; /* same-page anchor */
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (a.target && a.target !== '_self') || a.hasAttribute('download')) {
        flushNow(); return;   /* new tab: save now, but let the browser handle the click */
      }
      e.preventDefault();
      var go = function () { location.href = a.href; };
      flushNow().then(go, go);
    }, true);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && timer) flushNow(); });
    window.addEventListener('pagehide', function () { if (timer) flushNow(); });

    var actions = document.querySelector('header .actions');
    if (actions) {
      var b = document.createElement('button');
      b.type = 'button'; b.id = 'modZipBtn'; b.title = 'Download every changed file from all editors as a ready-to-install mod';
      b.textContent = 'Mod .zip';
      b.addEventListener('click', function () {
        b.disabled = true;
        readyP.then(flushNow).then(download).then(function (r) {
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
    return { schedule: schedule, flushNow: flushNow, ready: readyP,
      clearMine: function () { clearTimeout(timer); timer = null; return sync(opts.editor, {}, null); } };
  }

  window.PZMod = {
    EDITORS: EDITORS, BASE: BASE, pathFor: pathFor, list: list, sync: sync, remove: remove, clear: clear, getDraft: getDraft, sig: sig,
    settings: settings, cleanId: cleanId, modInfo: modInfo, build: build, download: download, onChange: onChange, attach: attach
  };
})();
