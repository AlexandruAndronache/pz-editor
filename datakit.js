/* PZ Editor data loader: reads the game files from the data/ folder next to the pages,
   so the .txt / .lua files can be swapped or updated without touching the HTML.
   A folder with several files lists them in its files.json. */
(function () {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var shown = false;
  function fail(url, err) {
    if (shown) return; shown = true;
    var local = location.protocol === 'file:';
    var box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'margin:0 0 12px;padding:10px 14px;border-radius:6px;border:1px solid #a33a24;background:#fbe9e4;color:#5a1d10;font:14px/1.45 system-ui,sans-serif';
    box.innerHTML = '<b>Could not load ' + esc(url) + '</b> (' + esc(err && err.message || err) + ').<br>' +
      (local
        ? 'The page was opened straight from disk, and browsers block that. Open a terminal in this folder, run <code>python -m http.server</code>, then go to <code>http://localhost:8000/</code>.'
        : 'Check that the file is uploaded next to the pages at that path' + (/files\.json$/.test(url) ? '' : ' and listed in its folder\'s files.json') + '.');
    var nav = document.querySelector('nav.pznav');
    if (nav && nav.parentNode) nav.parentNode.insertBefore(box, nav.nextSibling); else document.body.insertBefore(box, document.body.firstChild);
  }
  function path(p) { return p.split('/').map(encodeURIComponent).join('/'); }
  /* one file as text; no-cache = the browser re-checks the server, so an updated file shows up on reload */
  function text(url) {
    return fetch(path(url), { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      return r.text();
    }).catch(function (e) { fail(url, e); throw e; });
  }
  /* every file listed in dir/files.json, in that order: [{name, text}] */
  function files(dir) {
    return text(dir + 'files.json').then(function (j) {
      var names;
      try { names = JSON.parse(j); } catch (e) { fail(dir + 'files.json', new Error('not valid JSON')); throw e; }
      return Promise.all(names.map(function (n) { return text(dir + n).then(function (t) { return { name: n, text: t }; }); }));
    });
  }
  window.PZData = { text: text, files: files };
})();
