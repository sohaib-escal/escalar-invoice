/* Paramètres : société, logo / cachet, valeurs par défaut, numérotation, Google Drive, données. */
(function (App) {
  'use strict';

  var ui = App.ui, util = App.util, esc = util.escapeHtml;

  var COMPANY_FIELDS = [
    ['legalName', 'Raison sociale (émetteur légal)'],
    ['brand', 'Marque commerciale'],
    ['brandLine', 'Mention de marque', 'span2'],
    ['headOffice', 'Siège social', 'span2'],
    ['correspondence', 'Adresse de correspondance', 'span2'],
    ['phone', 'Téléphone'],
    ['email', 'E-mail'],
    ['website', 'Site web'],
    ['capital', 'Capital social'],
    ['rcCity', 'Ville du RC'],
    ['rc', 'RC n°'],
    ['if', 'IF'],
    ['ice', 'ICE'],
    ['patente', 'Patente'],
    ['cnss', 'CNSS'],
    ['city', 'Ville (« Fait à … »)']
  ];

  function render(view) {
    var s = App.store.getSettings();
    var today = util.todayISO();
    var monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    var logoSrc = s.logo === null ? window.APP_DEFAULT_LOGO : s.logo;
    var driveOk = App.drive.originSupported();
    var origin = driveOk ? location.origin : 'http://localhost:8080';

    view.innerHTML =
      '<div class="page-head"><h1>Paramètres</h1><div class="btn-row"><span class="muted small" id="set-state"></span>' +
      '<button class="btn primary" id="save-settings">Enregistrer les paramètres</button></div></div>' +
      '<div class="settings">' +

      '<div>' +
      '<div class="card"><div class="section"><h2>Société émettrice</h2><div class="grid g2">' +
      COMPANY_FIELDS.map(function (f) {
        return '<label class="f' + (f[2] ? ' ' + f[2] : '') + '">' + f[1] + '<input type="text" data-c="' + f[0] + '" value="' + esc(s.company[f[0]]) + '"></label>';
      }).join('') +
      '</div></div></div>' +

      '<div class="card" style="margin-top:20px"><div class="section"><h2>Désignations et prestations types</h2>' +
      '<p class="small" style="margin-top:0">Définissez vos prestations fréquentes pour les insérer en 1 clic dans vos devis et factures.</p>' +
      '<div class="designations-list" id="des-list-container"></div>' +
      '<div class="btn-row" style="margin-top:14px"><button type="button" class="btn sm primary" id="btn-add-des">+ Nouvelle prestation type</button>' +
      '<button type="button" class="btn sm ghost" id="btn-reset-des">Rétablir les modèles par défaut</button></div>' +
      '</div></div>' +
      '</div>' +

      '<div>' +
      '<div class="card"><div class="section"><h2>Logo et cachet</h2>' +
      '<div class="img-box"><div class="thumb">' + (logoSrc ? '<img src="' + logoSrc + '" alt="Logo">' : '<span class="muted small">Aucun logo</span>') + '</div>' +
      '<div class="btn-row"><button class="btn sm" data-img="logo">Importer un logo…</button>' +
      (s.logo !== null ? '<button class="btn sm ghost" data-img-reset="logo">Logo par défaut</button>' : '') +
      (logoSrc ? '<button class="btn sm ghost danger" data-img-clear="logo">Retirer</button>' : '') + '</div></div>' +
      '<div class="img-box" style="margin-top:14px"><div class="thumb">' + (App.store.stampSrc(s) ? '<img src="' + App.store.stampSrc(s) + '" alt="Cachet">' : '<span class="muted small">Aucun cachet</span>') + '</div>' +
      '<div><div class="btn-row"><button class="btn sm" data-img="stamp">Importer un cachet / signature…</button>' +
      (s.stampImage !== null ? '<button class="btn sm ghost" data-img-reset="stamp">Cachet par défaut</button>' : '') +
      (App.store.stampSrc(s) ? '<button class="btn sm ghost danger" data-img-clear="stamp">Retirer</button>' : '') + '</div>' +
      '<div class="muted small" style="margin-top:6px">Image PNG à fond transparent de préférence. Activable ou non sur chaque document.</div></div></div>' +
      '<input type="file" id="img-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>' +
      '</div></div>' +

      '<div class="card" style="margin-top:20px"><div class="section"><h2>Valeurs par défaut</h2><div class="grid g2">' +
      '<label class="f">TVA par défaut<select data-d="taxRate">' + App.calc.TAX_RATES.map(function (r) {
        return '<option value="' + r + '"' + (Number(s.defaults.taxRate) === r ? ' selected' : '') + '>' + r + ' %</option>';
      }).join('') + '</select></label>' +
      '<label class="f">Devise<input type="text" value="MAD" disabled></label>' +
      '<label class="f">Validité d’un devis (jours)<input type="number" min="1" max="365" data-d="devisValidityDays" value="' + esc(s.defaults.devisValidityDays) + '"></label>' +
      '<label class="f"><span>Échéance d’une facture (jours) <span class="hint">0 = aucune</span></span><input type="number" min="0" max="365" data-d="factureDueDays" value="' + esc(s.defaults.factureDueDays) + '"></label>' +
      '<label class="f span2"><span>Conditions par défaut des devis <span class="hint">une par ligne</span></span><textarea rows="3" data-d="devisConditions">' + esc(s.defaults.devisConditions) + '</textarea></label>' +
      '<label class="f span2">Modalités de paiement par défaut (devis)<input type="text" data-d="devisPaymentTerms" value="' + esc(s.defaults.devisPaymentTerms) + '"></label>' +
      '<label class="f span2">Conditions de paiement par défaut (factures)<input type="text" data-d="facturePaymentTerms" value="' + esc(s.defaults.facturePaymentTerms) + '"></label>' +
      '<label class="f span2"><span>Notes par défaut des factures <span class="hint">une par ligne</span></span><textarea rows="2" data-d="factureNotes">' + esc(s.defaults.factureNotes) + '</textarea></label>' +
      '</div></div></div>' +

      '<div class="card" style="margin-top:20px"><div class="section"><h2>Numérotation</h2>' +
      '<p class="small" style="margin-top:0"><b>Devis</b> : préfixe + année + mois + jour + n° du jour sur 2 chiffres (ex. <code>' + App.numbering.format('devis', today, 1, s) + '</code>), repart à 01 chaque jour.<br>' +
      '<b>Factures</b> : préfixe + année + mois + n° du mois sur 3 chiffres (ex. <code>' + App.numbering.format('facture', today, 1, s) + '</code>), repart à 001 chaque mois.</p>' +
      '<p class="muted small">La période suit la date d\u2019émission du document. Un numéro supprimé n\u2019est jamais réattribué. ' +
      'Si vous saisissez à la main un numéro plus élevé dans un document, la suite continue après lui.</p>' +
      '<div class="grid g2">' +
      '<label class="f">Préfixe des devis<input type="text" maxlength="4" data-n="devisPrefix" value="' + esc(s.numbering.devisPrefix) + '"></label>' +
      '<label class="f">Préfixe des factures<input type="text" maxlength="4" data-n="facturePrefix" value="' + esc(s.numbering.facturePrefix) + '"></label>' +
      '<label class="f">Prochain devis du ' + util.formatDate(today) + '<input type="number" min="1" id="next-devis" value="' + (App.numbering.lastUsed('devis', today) + 1) + '">' +
      '<span class="field-msg muted" id="next-devis-preview"></span></label>' +
      '<label class="f">Prochaine facture de ' + monthLabel + '<input type="number" min="1" id="next-facture" value="' + (App.numbering.lastUsed('facture', today) + 1) + '">' +
      '<span class="field-msg muted" id="next-facture-preview"></span></label>' +
      '</div><p class="muted small">Les compteurs sont propres à ce navigateur : ils ne sont pas synchronisés entre appareils.</p></div></div>' +

      '<div class="card" style="margin-top:20px"><div class="section"><h2>Remplissage automatique (Google Gemini)</h2>' +
      '<p class="small" style="margin-top:0">Collez une image (carte de visite, en-tête, bon de commande, attestation ICE…) dans l\u2019éditeur : les coordonnées du client sont lues par Google Gemini et remplies automatiquement.</p>' +
      '<div class="grid g2">' +
      '<label class="f span2">Clé API Google (Gemini)<input type="password" autocomplete="off" spellcheck="false" data-gm="apiKey" value="' + esc(s.gemini.apiKey) + '" placeholder="AIza…"></label>' +
      '<label class="f">Modèle<input type="text" list="gm-models" data-gm="model" value="' + esc(s.gemini.model) + '"></label>' +
      '<div style="display:flex;align-items:flex-end"><button class="btn sm" id="gm-test">Tester la clé</button></div>' +
      '</div><datalist id="gm-models"></datalist>' +
      '<p class="muted small">Créez une clé gratuite sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. ' +
      'La clé est enregistrée dans ce navigateur uniquement (elle figure aussi dans l\u2019export de sauvegarde). Seules les images que vous collez sont envoyées à Google.</p>' +
      '</div></div>' +

      '<div class="card" style="margin-top:20px"><div class="section"><h2>Google Drive</h2>' +
      (driveOk ? '' : '<p class="info warn" style="margin-top:0">L’application est ouverte en <code>file://</code>. Google n’autorise pas la connexion depuis un fichier local : lancez-la via <code>http://localhost:8080</code> (voir README) pour utiliser Drive. Tout le reste fonctionne normalement.</p>') +
      '<label class="f">Identifiant client OAuth (Client ID)<input type="text" data-g="clientId" value="' + esc(s.drive.clientId) + '" placeholder="xxxxxxxx.apps.googleusercontent.com"></label>' +
      '<p class="muted small">Origine JavaScript autorisée à déclarer dans Google Cloud : <code>' + esc(origin) + '</code>. Aucun secret client n’est nécessaire.</p>' +
      '<p class="small"><span class="status-dot' + (App.drive.isConnected() ? ' on' : '') + '"></span>' +
      (App.drive.isConnected() ? 'Connecté (session en cours)' : 'Non connecté') +
      (s.drive.rootFolderId ? ' · Dossier « ' + esc(App.drive.ROOT_NAME) + ' » prêt' : '') + '</p>' +
      '<div class="btn-row"><button class="btn sm" id="drive-test"' + (driveOk ? '' : ' disabled') + '>Se connecter et préparer les dossiers</button>' +
      (App.drive.isConnected() ? '<button class="btn sm ghost" id="drive-off">Se déconnecter</button>' : '') + '</div>' +
      '<p class="muted small">Les PDF sont rangés dans <code>' + esc(App.drive.ROOT_NAME) + '/Devis</code> et <code>/Factures</code>. ' +
      'Accès limité aux fichiers créés par l’application (portée <code>drive.file</code>).</p></div></div>' +

      '<div class="card" style="margin-top:20px"><div class="section"><h2>Données</h2>' +
      '<p class="small" style="margin-top:0">Documents, compteurs et paramètres sont stockés dans ce navigateur (localStorage). Ils sont perdus si vous effacez les données du site, ' +
      'et ne sont pas visibles depuis un autre navigateur ou appareil. Exportez une sauvegarde régulièrement. ' +
      'Les PDF envoyés sur Drive sont une copie des documents finaux : ils ne permettent pas de restaurer les brouillons modifiables.</p>' +
      '<div class="btn-row"><button class="btn sm" id="exp">Exporter mes données</button><button class="btn sm" id="imp">Importer une sauvegarde</button></div>' +
      '</div></div>' +
      '</div></div>';

    function updateNextPreview() {
      ['devis', 'facture'].forEach(function (t) {
        var v = parseInt(ui.$('#next-' + t, view).value, 10);
        var prefix = (ui.$('[data-n="' + t + 'Prefix"]', view).value.trim().toUpperCase() || (t === 'facture' ? 'F' : 'D'));
        var tmp = { numbering: { devisPrefix: prefix, facturePrefix: prefix } };
        var number = v >= 1 ? App.numbering.format(t, today, v, tmp) : '';
        var used = number && App.numbering.numberExists(number);
        var el = ui.$('#next-' + t + '-preview', view);
        el.className = 'field-msg ' + (used ? 'warn' : 'muted');
        el.textContent = number ? '→ ' + number + (used ? ' (déjà utilisé : le suivant libre sera proposé)' : '') : '';
      });
    }
    view.addEventListener('input', function (e) { if (e.target.id === 'next-devis' || e.target.id === 'next-facture' || e.target.dataset.n) updateNextPreview(); });
    updateNextPreview();

    var currentDesignations = s.designations ? util.clone(s.designations) : App.store.defaultDesignations();
    var editingDesIndex = -1;

    function renderDesList() {
      var container = ui.$('#des-list-container', view);
      if (!container) return;
      var html = '';

      if (editingDesIndex === 'new') {
        html += renderDesForm({ title: '', description: '', price: '', qty: '1', taxRate: 20 }, 'new');
      }

      if (!currentDesignations.length && editingDesIndex !== 'new') {
        html += '<div class="muted small" style="padding:14px 0;text-align:center">Aucune prestation type enregistrée.</div>';
      } else {
        currentDesignations.forEach(function (d, idx) {
          if (editingDesIndex === idx) {
            html += renderDesForm(d, idx);
          } else {
            html += '<div class="des-card">' +
              '<div class="des-card-head">' +
              '<div><span class="des-card-title">' + esc(d.title) + '</span>' +
              '<div class="des-badges" style="margin-left:8px">' +
              '<span class="badge">' + (d.price ? esc(d.price) + ' MAD HT' : 'Prix libre') + '</span>' +
              '<span class="badge">TVA ' + (d.taxRate != null ? d.taxRate : 20) + ' %</span>' +
              (d.qty ? '<span class="badge">Qté ' + esc(d.qty) + '</span>' : '') +
              '</div></div>' +
              '<div class="des-actions">' +
              '<button type="button" class="btn sm ghost" data-des-edit="' + idx + '">Modifier</button>' +
              '<button type="button" class="btn sm ghost danger" data-des-del="' + idx + '" title="Supprimer">✕</button>' +
              '</div></div>' +
              '<div class="des-desc">' + esc(d.description || '') + '</div>' +
              '</div>';
          }
        });
      }
      container.innerHTML = html;
    }

    function renderDesForm(d, key) {
      var rates = App.calc.TAX_RATES;
      return '<div class="des-form">' +
        '<h3 style="margin:0 0 10px;font-size:14px;font-weight:650">' + (key === 'new' ? 'Nouvelle prestation type' : 'Modifier la prestation') + '</h3>' +
        '<div class="grid g2">' +
        '<label class="f span2">Titre du bouton / nom court<input type="text" id="df-title" value="' + esc(d.title || '') + '" placeholder="ex. Cartes NFC standard"></label>' +
        '<label class="f span2">Description complète (affichée sur le devis/facture)<textarea rows="3" id="df-desc" placeholder="1re ligne en gras, détails dessous">' + esc(d.description || '') + '</textarea></label>' +
        '<label class="f">Prix unitaire HT conseillé (MAD)<input type="text" id="df-price" value="' + esc(d.price || '') + '" placeholder="ex. 120,00"></label>' +
        '<label class="f">TVA<select id="df-tax">' + rates.map(function (r) {
          return '<option value="' + r + '"' + (Number(d.taxRate) === r ? ' selected' : '') + '>' + r + ' %</option>';
        }).join('') + '</select></label>' +
        '<label class="f">Quantité par défaut<input type="text" id="df-qty" value="' + esc(d.qty || '1') + '" placeholder="1"></label>' +
        '</div>' +
        '<div class="btn-row" style="margin-top:12px;justify-content:flex-end">' +
        '<button type="button" class="btn sm ghost" id="df-cancel">Annuler</button>' +
        '<button type="button" class="btn sm primary" id="df-save" data-key="' + key + '">Enregistrer cette prestation</button>' +
        '</div></div>';
    }

    renderDesList();

    var pending = { logo: s.logo, stamp: s.stampImage };
    var imgTarget = null;
    var dirty = false;
    function markDirty() { dirty = true; ui.$('#set-state', view).textContent = 'Modifications non enregistrées'; }
    view.addEventListener('input', function (e) { if (e.target.matches('input, textarea, select')) markDirty(); });

    function collect() {
      var next = App.store.getSettings();
      ui.$$('[data-c]', view).forEach(function (el) { next.company[el.dataset.c] = el.value.trim(); });
      ui.$$('[data-d]', view).forEach(function (el) {
        var v = el.value;
        next.defaults[el.dataset.d] = el.dataset.d === 'taxRate' ? Number(v) : (el.type === 'number' ? Math.max(0, parseInt(v, 10) || 0) : v);
      });
      ui.$$('[data-n]', view).forEach(function (el) { next.numbering[el.dataset.n] = el.value.trim().toUpperCase(); });
      ui.$$('[data-g]', view).forEach(function (el) { next.drive[el.dataset.g] = el.value.trim(); });
      ui.$$('[data-gm]', view).forEach(function (el) { next.gemini[el.dataset.gm] = el.value.trim(); });
      if (!next.gemini.model) next.gemini.model = App.extract.DEFAULT_MODEL;
      next.logo = pending.logo;
      next.stampImage = pending.stamp;
      next.designations = currentDesignations;
      return next;
    }

    function saveAll() {
      var next = collect();
      if (!next.company.legalName) { ui.toast('La raison sociale est obligatoire.', 'err'); return false; }
      if (!/^[A-Z]{1,4}$/.test(next.numbering.devisPrefix) || !/^[A-Z]{1,4}$/.test(next.numbering.facturePrefix)) {
        ui.toast('Les préfixes doivent contenir 1 à 4 lettres.', 'err'); return false;
      }
      if (next.numbering.devisPrefix === next.numbering.facturePrefix) { ui.toast('Les préfixes des devis et des factures doivent être différents.', 'err'); return false; }
      var lowered = ['devis', 'facture'].filter(function (t) {
        var v = parseInt(ui.$('#next-' + t, view).value, 10);
        return v >= 1 && v < App.numbering.lastUsed(t, today) + 1;
      });
      if (lowered.length && !window.confirm('Vous abaissez le prochain numéro (' + lowered.join(', ') + ').\n' +
        'Des numéros déjà attribués puis supprimés pourraient être réutilisés. Continuer ?')) return false;
      try {
        App.store.saveSettings(next);
        ['devis', 'facture'].forEach(function (t) {
          var v = parseInt(ui.$('#next-' + t, view).value, 10);
          if (v >= 1 && v !== App.numbering.lastUsed(t, today) + 1) App.numbering.setNext(t, today, v);
        });
      } catch (e) { ui.toast(e.message, 'err'); return false; }
      dirty = false;
      ui.toast('Paramètres enregistrés.', 'ok');
      return true;
    }

    ui.$('#save-settings', view).addEventListener('click', function () { if (saveAll()) render(view); });

    view.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'btn-add-des') {
        editingDesIndex = 'new';
        renderDesList();
        var ti = ui.$('#df-title', view);
        if (ti) ti.focus();
        return;
      }
      if (b.dataset.desEdit != null) {
        editingDesIndex = Number(b.dataset.desEdit);
        renderDesList();
        var ti = ui.$('#df-title', view);
        if (ti) ti.focus();
        return;
      }
      if (b.dataset.desDel != null) {
        var delIdx = Number(b.dataset.desDel);
        if (window.confirm('Supprimer cette prestation type ?')) {
          currentDesignations.splice(delIdx, 1);
          markDirty();
          renderDesList();
          ui.toast('Prestation supprimée');
        }
        return;
      }
      if (b.id === 'btn-reset-des') {
        if (window.confirm('Rétablir toutes les prestations types par défaut d’ESCALAR MEDIA ?')) {
          currentDesignations = App.store.defaultDesignations();
          editingDesIndex = -1;
          markDirty();
          renderDesList();
          ui.toast('Modèles par défaut rétablis', 'ok');
        }
        return;
      }
      if (b.id === 'df-cancel') {
        editingDesIndex = -1;
        renderDesList();
        return;
      }
      if (b.id === 'df-save') {
        var key = b.dataset.key;
        var titleVal = (ui.$('#df-title', view).value || '').trim();
        var descVal = (ui.$('#df-desc', view).value || '').trim();
        var priceVal = (ui.$('#df-price', view).value || '').trim();
        var taxVal = Number(ui.$('#df-tax', view).value) || 20;
        var qtyVal = (ui.$('#df-qty', view).value || '').trim() || '1';
        if (!titleVal) {
          ui.toast('Le titre de la prestation est obligatoire.', 'err');
          return;
        }
        var item = {
          title: titleVal,
          description: descVal || titleVal,
          price: priceVal,
          qty: qtyVal,
          taxRate: taxVal
        };
        if (key === 'new') {
          currentDesignations.push(item);
        } else {
          currentDesignations[Number(key)] = item;
        }
        editingDesIndex = -1;
        markDirty();
        renderDesList();
        ui.toast('Prestation type « ' + titleVal + ' » enregistrée. Pensez à enregistrer les paramètres.', 'ok');
        return;
      }
      if (b.dataset.img) { imgTarget = b.dataset.img; ui.$('#img-file', view).value = ''; ui.$('#img-file', view).click(); }
      if (b.dataset.imgReset) { pending[b.dataset.imgReset] = null; applyImages(); }
      if (b.dataset.imgClear) { pending[b.dataset.imgClear] = ''; applyImages(); }
    });

    function applyImages() {
      // Les images sont enregistrées immédiatement avec le reste du formulaire
      if (saveAll()) render(view);
    }

    ui.$('#img-file', view).addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      ui.imageToDataURL(file, imgTarget === 'logo' ? 900 : 700).then(function (data) {
        pending[imgTarget] = data;
        applyImages();
      }).catch(function (err) { ui.toast(err.message, 'err'); });
    });

    ui.$('#exp', view).addEventListener('click', App.backup.exportBackup);
    ui.$('#imp', view).addEventListener('click', function () { App.backup.importBackup(function () { render(view); }); });

    var test = ui.$('#drive-test', view);
    if (test) test.addEventListener('click', function () {
      if (dirty && !saveAll()) return;
      if (!App.drive.isConfigured()) { ui.toast('Renseignez d’abord l’identifiant client OAuth.', 'err'); return; }
      var tp = App.drive.getToken();
      test.disabled = true;
      tp.then(function () { return App.drive.ensureFolder('devis'); })
        .then(function () { return App.drive.ensureFolder('facture'); })
        .then(function () { ui.toast('Google Drive connecté. Dossiers prêts.', 'ok'); render(view); })
        .catch(function (err) { ui.toast(err.message, 'err'); test.disabled = false; });
    });
    ui.$('#gm-test', view).addEventListener('click', function (e) {
      var btn = e.currentTarget;
      var key = ui.$('[data-gm="apiKey"]', view).value.trim();
      if (!key) { ui.toast('Collez d\u2019abord votre clé API.', 'err'); return; }
      btn.disabled = true;
      App.extract.listModels(key).then(function (models) {
        ui.$('#gm-models', view).innerHTML = models.map(function (m) { return '<option value="' + esc(m) + '">'; }).join('');
        var modelInput = ui.$('[data-gm="model"]', view);
        if (models.length && models.indexOf(modelInput.value.trim()) === -1) {
          modelInput.value = models[0];
          markDirty();
        }
        ui.toast('Clé valide · ' + models.length + ' modèle(s) disponible(s). Modèle choisi : ' + modelInput.value + '. Pensez à enregistrer.', 'ok', { duration: 6000 });
      }).catch(function (err) { ui.toast(err.message, 'err'); })
        .then(function () { btn.disabled = false; });
    });

    var off = ui.$('#drive-off', view);
    if (off) off.addEventListener('click', function () { App.drive.disconnect(); ui.toast('Déconnecté de Google Drive.'); render(view); });

    App.settingsView = { isDirty: function () { return dirty; } };
  }

  App.settings = { render: render };
})(window.App = window.App || {});
