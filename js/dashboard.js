/* Tableau de bord : historique local des devis et factures. */
(function (App) {
  'use strict';

  var ui = App.ui, util = App.util, esc = util.escapeHtml;
  var PREFS_KEY = 'ef.prefs.v1';

  function loadPrefs() {
    try { return Object.assign({ q: '', type: 'all', sort: 'desc' }, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); }
    catch (e) { return { q: '', type: 'all', sort: 'desc' }; }
  }

  function savePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* préférence non essentielle */ }
  }

  function render(view) {
    var prefs = loadPrefs();
    view.innerHTML =
      '<div class="page-head"><h1>Documents</h1><div class="btn-row">' +
      '<a class="btn primary" href="#/nouveau/devis">+ Nouveau devis</a>' +
      '<a class="btn primary" href="#/nouveau/facture">+ Nouvelle facture</a></div></div>' +
      '<div class="card">' +
      '<div class="toolbar">' +
      '<input type="search" id="q" placeholder="Rechercher un numéro ou un client…" value="' + esc(prefs.q) + '">' +
      '<div class="seg" id="type">' +
      ['all', 'devis', 'facture'].map(function (t) {
        return '<button data-t="' + t + '" class="' + (prefs.type === t ? 'on' : '') + '">' + ({ all: 'Tous', devis: 'Devis', facture: 'Factures' })[t] + '</button>';
      }).join('') + '</div>' +
      '<select id="sort"><option value="desc">Plus récents d’abord</option><option value="asc">Plus anciens d’abord</option></select>' +
      '<span class="muted small" id="count"></span></div>' +
      '<div id="list"></div></div>' +
      '<div class="foot-note"><div class="muted small">Les documents sont enregistrés dans ce navigateur uniquement. ' +
      'Exportez régulièrement une sauvegarde.</div><div class="btn-row">' +
      '<button class="btn sm" id="export">Exporter mes données</button>' +
      '<button class="btn sm" id="import">Importer une sauvegarde</button></div></div>';

    ui.$('#sort', view).value = prefs.sort;

    function update() {
      savePrefs(prefs);
      var q = prefs.q.trim().toLowerCase();
      var docs = App.store.listDocs().filter(function (d) {
        if (prefs.type !== 'all' && d.type !== prefs.type) return false;
        if (!q) return true;
        return String(d.number).toLowerCase().indexOf(q) !== -1 ||
          String((d.client && d.client.name) || '').toLowerCase().indexOf(q) !== -1;
      });
      docs.sort(function (a, b) {
        var k = (a.issueDate || '').localeCompare(b.issueDate || '') || String(a.number).localeCompare(String(b.number));
        return prefs.sort === 'asc' ? k : -k;
      });
      ui.$('#count', view).textContent = docs.length + ' document' + (docs.length > 1 ? 's' : '');
      var list = ui.$('#list', view);
      if (!App.store.listDocs().length) {
        list.innerHTML = '<div class="empty">Aucun document pour l’instant.<div class="btn-row">' +
          '<a class="btn primary" href="#/nouveau/devis">+ Nouveau devis</a><a class="btn" href="#/nouveau/facture">+ Nouvelle facture</a></div></div>';
        return;
      }
      if (!docs.length) { list.innerHTML = '<div class="empty">Aucun document ne correspond à la recherche.</div>'; return; }
      list.innerHTML = '<table class="list"><thead><tr><th>Numéro</th><th>Type</th><th class="hide-sm">Date</th><th>Client</th>' +
        '<th class="amount">Total TTC</th><th class="hide-sm">Statut</th><th></th></tr></thead><tbody>' +
        docs.map(function (d) {
          var ttc = App.calc.computeTotals(d).totalTTCCents;
          return '<tr data-id="' + esc(d.id) + '">' +
            '<td class="num"><a href="#/doc/' + esc(d.id) + '">' + esc(d.number) + '</a></td>' +
            '<td><span class="badge ' + d.type + '">' + App.documents.typeLabel(d.type) + '</span></td>' +
            '<td class="hide-sm">' + esc(util.formatDate(d.issueDate)) + '</td>' +
            '<td class="client-cell" title="' + esc(d.client && d.client.name) + '">' + (d.client && d.client.name ? esc(d.client.name) : '<span class="muted">—</span>') + '</td>' +
            '<td class="amount">' + util.formatMoney(ttc) + '</td>' +
            '<td class="hide-sm"><span class="badge s-' + esc(d.status) + '">' + esc(App.documents.statusLabel(d.type, d.status)) + '</span>' +
            (d.drive ? '<span class="drive-tag" title="Envoyé sur Google Drive le ' + esc(new Date(d.drive.uploadedAt).toLocaleString('fr-FR')) + '">Drive ✓</span>' : '') +
            (d.guestCreated ? '<span class="guest-tag" title="Créé par un invité">👤 Invité</span>' : '') + '</td>' +
            '<td class="actions"><a class="btn sm" href="#/doc/' + esc(d.id) + '">Ouvrir</a>' +
            '<button class="btn sm" data-act="dup">Dupliquer</button>' +
            '<button class="btn sm" data-act="pdf">PDF</button>' +
            '<button class="btn sm danger" data-act="del">Supprimer</button></td></tr>';
        }).join('') + '</tbody></table>';
    }

    ui.$('#q', view).addEventListener('input', function (e) { prefs.q = e.target.value; update(); });
    ui.$('#sort', view).addEventListener('change', function (e) { prefs.sort = e.target.value; update(); });
    ui.$('#type', view).addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      prefs.type = b.dataset.t;
      ui.$$('#type button', view).forEach(function (x) { x.classList.toggle('on', x === b); });
      update();
    });
    ui.$('#export', view).addEventListener('click', App.backup.exportBackup);
    ui.$('#import', view).addEventListener('click', function () { App.backup.importBackup(update); });

    ui.$('#list', view).addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]'); if (!btn) return;
      var id = btn.closest('tr').dataset.id;
      var doc = App.store.getDoc(id);
      if (!doc) return;
      if (btn.dataset.act === 'dup') {
        App.editor.openDraft(App.documents.duplicate(doc));
      } else if (btn.dataset.act === 'pdf') {
        btn.disabled = true;
        App.pdf.download(doc).then(function (r) { ui.toast('PDF téléchargé : ' + r.fileName, 'ok'); })
          .catch(function (err) { console.error(err); ui.toast('Échec de la génération du PDF : ' + err.message, 'err'); })
          .then(function () { btn.disabled = false; });
      } else if (btn.dataset.act === 'del') {
        ui.confirmInline(btn, function () {
          App.store.deleteDoc(id);
          ui.toast(App.documents.typeLabel(doc.type) + ' ' + doc.number + ' supprimé. Son numéro ne sera pas réutilisé.');
          update();
        }, 'Confirmer la suppression');
      }
    });

    update();
    ui.$('#q', view).focus();
  }

  App.dashboard = { render: render };
})(window.App = window.App || {});
