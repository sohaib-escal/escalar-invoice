/* Éditeur de document : formulaire à gauche, aperçu en direct à droite. */
(function (App) {
  'use strict';

  var ui = App.ui, util = App.util, esc = util.escapeHtml;

  var doc = null;          // document en cours d'édition (copie de travail)
  var draft = null;        // document non enregistré transmis par « Dupliquer » / « Convertir »
  var dirty = false;
  var view = null;
  var resizeObs = null;

  /* ---------------- Accès aux champs par chemin "client.name" ---------------- */

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  function setPath(obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (o, k) { if (o[k] == null) o[k] = {}; return o[k]; }, obj);
    target[last] = value;
  }

  /* ---------------- Gabarits de champs ---------------- */

  function input(label, path, opts) {
    opts = opts || {};
    var v = getPath(doc, path);
    return '<label class="f' + (opts.cls ? ' ' + opts.cls : '') + '"><span>' + label + (opts.hint ? ' <span class="hint">' + opts.hint + '</span>' : '') + '</span>' +
      '<input type="' + (opts.type || 'text') + '" data-f="' + path + '" value="' + esc(v == null ? '' : v) + '"' +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      (opts.list ? ' list="' + opts.list + '"' : '') + (opts.id ? ' id="' + opts.id + '"' : '') + '>' +
      (opts.after || '') + '</label>';
  }

  function textarea(label, path, opts) {
    opts = opts || {};
    var v = getPath(doc, path);
    return '<label class="f' + (opts.cls ? ' ' + opts.cls : '') + '"><span>' + label + (opts.hint ? ' <span class="hint">' + opts.hint + '</span>' : '') + '</span>' +
      '<textarea data-f="' + path + '" rows="' + (opts.rows || 3) + '"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + '>' +
      esc(v == null ? '' : v) + '</textarea></label>';
  }

  function checkbox(label, path, disabled, hint) {
    return '<label class="check"><input type="checkbox" data-f="' + path + '"' + (getPath(doc, path) ? ' checked' : '') + (disabled ? ' disabled' : '') + '> ' +
      label + (hint ? ' <span class="muted small">' + hint + '</span>' : '') + '</label>';
  }

  /* ---------------- Rendu ---------------- */

  function title() {
    return App.documents.typeLabel(doc.type) + ' ' + (doc.number || '');
  }

  function render(container) {
    view = container;
    var isDevis = doc.type === 'devis';
    var settings = App.store.getSettings();
    var statusOpts = App.documents.STATUSES[doc.type].map(function (s) {
      return '<option value="' + s.id + '"' + (doc.status === s.id ? ' selected' : '') + '>' + s.label + '</option>';
    }).join('');

    view.innerHTML =
      '<div class="ed-bar">' +
      '<div class="ed-title"><a class="btn ghost sm" href="#/">← Documents</a><h1 id="ed-title">' + esc(title()) + '</h1>' +
      '<span class="save-state" id="save-state"></span></div>' +
      '<div class="btn-row">' +
      '<button class="btn" id="act-save" title="⌘S">Enregistrer le brouillon</button>' +
      '<button class="btn" id="act-print">Imprimer</button>' +
      '<button class="btn primary" id="act-pdf">Télécharger le PDF</button>' +
      '<button class="btn" id="act-drive">Enregistrer sur Google Drive</button>' +
      '</div></div>' +

      '<div class="editor"><div class="ed-form">' +
      '<div class="alerts" id="alerts"></div>' +
      '<div class="card">' +

      // Document
      '<div class="section"><h2>Document</h2><div class="grid g2">' +
      (doc.saved
        ? '<label class="f">Type<input type="text" value="' + App.documents.typeLabel(doc.type) + '" disabled></label>'
        : '<label class="f">Type<div class="seg" id="type-seg"><button data-t="devis" class="' + (isDevis ? 'on' : '') + '">Devis</button>' +
          '<button data-t="facture" class="' + (!isDevis ? 'on' : '') + '">Facture</button></div></label>') +
      '<label class="f">Statut<select data-f="status">' + statusOpts + '</select></label>' +
      input('Numéro', 'number', { id: 'f-number', after: '<span class="field-msg" id="number-msg"></span>' }) +
      input(isDevis ? 'Date d’émission' : 'Date de facture', 'issueDate', { type: 'date' }) +
      (isDevis
        ? input('Offre valable jusqu’au', 'validUntil', { type: 'date' }) +
          input('Délai de livraison / d’exécution', 'deliveryTime', { placeholder: 'ex. 10 jours ouvrables' })
        : input('Échéance de paiement', 'dueDate', { type: 'date', hint: 'optionnel' }) +
          input('Réf. devis', 'sourceRef', { hint: 'optionnel', placeholder: 'ex. D26100001' })) +
      '</div></div>' +

      // Client
      '<div class="section"><h2>Client</h2>' +
      '<div class="drop" id="ocr-drop" tabindex="0" role="button" aria-label="Remplir le client depuis une image">' +
      '<div class="drop-thumb" id="ocr-thumb"></div><div class="drop-text"><b>Remplir depuis une image</b>' +
      '<span class="muted small">Collez une capture (⌘V), glissez une image ou cliquez pour choisir : carte de visite, en-tête, bon de commande, attestation ICE…</span>' +
      '<span class="small" id="ocr-status">' + (App.extract.isConfigured() ? '' : '<span class="field-msg warn">Clé API Google à renseigner dans <a href="#/parametres">Paramètres</a>.</span>') + '</span></div></div>' +
      '<input type="file" id="ocr-file" accept="image/*" hidden>' +
      '<div class="grid g2">' +
      input('Client / société', 'client.name', { cls: 'span2', id: 'f-client' }) +
      input('Contact', 'client.contact', { hint: 'optionnel', placeholder: 'Mme / M. …' }) +
      input('ICE / IF', 'client.ice', { hint: 'optionnel' }) +
      textarea('Adresse', 'client.address', { cls: 'span2', rows: 2, hint: 'optionnel' }) +
      input('E-mail', 'client.email', { type: 'email', hint: 'optionnel' }) +
      input('Téléphone', 'client.phone', { type: 'tel', hint: 'optionnel' }) +
      input('Objet', 'subject', { cls: 'span2', placeholder: 'ex. Fourniture de 190 cartes de visite NFC personnalisées' }) +
      '</div></div>' +

      // Lignes
      '<div class="section"><h2>Prestations</h2>' +
      '<div class="lines" id="lines"></div>' +
      '<div class="btn-row" style="margin-top:10px"><button class="btn" id="add-line">+ Ajouter une ligne</button>' +
      '<span class="muted small">1re ligne de la description en gras · <code>**texte**</code> pour du gras · ligne sans quantité ni prix = texte seul</span></div>' +
      '</div>' +

      // Totaux
      '<div class="section"><h2>Totaux</h2>' +
      '<div class="gd-row"><span class="small" style="font-weight:550;color:#444b57;padding-bottom:8px">Remise globale <span class="muted">(optionnel)</span></span>' +
      '<select data-f="globalDiscount.type"><option value="percent"' + (doc.globalDiscount.type !== 'amount' ? ' selected' : '') + '>%</option>' +
      '<option value="amount"' + (doc.globalDiscount.type === 'amount' ? ' selected' : '') + '>MAD HT</option></select>' +
      '<input type="text" inputmode="decimal" data-f="globalDiscount.value" id="f-gd" value="' + esc(doc.globalDiscount.value || '') + '" placeholder="0"></div>' +
      '<div class="sum" id="sum"></div></div>' +

      // Conditions
      '<div class="section"><h2>' + (isDevis ? 'Conditions' : 'Paiement') + '</h2><div class="grid g2">' +
      (isDevis
        ? input('Modalités de paiement', 'paymentTerms', { cls: 'span2', placeholder: 'ex. 50 % à la commande, solde à la livraison' }) +
          textarea('Conditions', 'conditions', { cls: 'span2', rows: 3, hint: 'une par ligne' })
        : input('Mode de paiement', 'paymentMethod', { list: 'pay-methods', hint: 'optionnel' }) +
          input('Référence de paiement', 'paymentRef', { hint: 'optionnel' }) +
          input('Conditions de paiement', 'paymentTerms', { cls: 'span2', hint: 'optionnel', placeholder: 'ex. Paiement à 30 jours' }) +
          textarea('Mentions complémentaires', 'conditions', { cls: 'span2', rows: 2, hint: 'une par ligne' })) +
      input('Titre du bloc de notes', 'notesTitle', { cls: 'span2', placeholder: 'ex. Prestations incluses sans facturation' }) +
      textarea('Notes', 'notes', { cls: 'span2', rows: 3, hint: 'une par ligne' }) +
      '</div><datalist id="pay-methods">' + App.documents.PAYMENT_METHODS.map(function (m) { return '<option value="' + esc(m) + '">'; }).join('') + '</datalist></div>' +

      // Options
      '<div class="section"><h2>Signature</h2><div class="grid">' +
      checkbox('Zone « Cachet et signature »', 'showSignature') +
      (isDevis ? checkbox('Zone « Bon pour accord » pour le client', 'showAcceptance') : '') +
      checkbox('Apposer le cachet et la signature', 'showStamp', !App.store.stampSrc(settings), App.store.stampSrc(settings) ? '' : '(aucun cachet dans Paramètres)') +
      '</div></div>' +

      '</div></div>' +

      // Aperçu
      '<div class="ed-preview"><div class="preview-head"><span class="muted small">Aperçu · la pagination exacte est celle du PDF</span>' +
      '<button class="btn sm" id="act-preview">Aperçu PDF</button>' +
      '<details style="position:relative"><summary class="btn sm" style="list-style:none">Plus ▾</summary>' +
      '<div class="card" style="position:absolute;right:0;top:34px;z-index:5;padding:6px;display:flex;flex-direction:column;gap:4px;min-width:200px">' +
      '<button class="btn sm ghost" id="act-dup" style="justify-content:flex-start">Dupliquer</button>' +
      (isDevis ? '<button class="btn sm ghost" id="act-convert" style="justify-content:flex-start">Convertir en facture</button>' : '') +
      '</div></details></div>' +
      '<div class="preview-frame" id="pv-frame"><div class="preview-scale" id="pv-scale"></div></div></div>' +
      '</div>';

    renderLines();
    bind();
    refresh();
    updateNumberMsg();
    setSaveState();
    fitPreview();
    App.drive.preload();
    view.querySelectorAll('textarea').forEach(autoGrow);
  }

  function renderLines() {
    var box = ui.$('#lines', view);
    var rates = App.calc.TAX_RATES;
    box.innerHTML = doc.lines.map(function (l, i) {
      return '<div class="line" data-i="' + i + '">' +
        '<div class="line-top"><textarea rows="2" data-k="description" placeholder="Description de la prestation (plusieurs lignes possibles)">' + esc(l.description) + '</textarea>' +
        '<div class="line-tools">' +
        '<button class="btn ghost icon sm" data-a="up" title="Monter"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="btn ghost icon sm" data-a="down" title="Descendre"' + (i === doc.lines.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="btn ghost icon sm" data-a="del" title="Supprimer la ligne">✕</button></div></div>' +
        '<div class="line-nums">' +
        '<label class="f">Qté<input type="text" inputmode="decimal" data-k="qty" value="' + esc(l.qty) + '"></label>' +
        '<label class="f">P.U. HT (MAD)<input type="text" inputmode="decimal" data-k="price" value="' + esc(l.price) + '" placeholder="0,00"></label>' +
        '<label class="f">Remise %<input type="text" inputmode="decimal" data-k="discount" value="' + esc(l.discount) + '" placeholder="0"></label>' +
        '<label class="f">TVA<select data-k="taxRate">' + rates.map(function (r) {
          return '<option value="' + r + '"' + (Number(l.taxRate) === r ? ' selected' : '') + '>' + r + ' %</option>';
        }).join('') + '</select></label>' +
        '<label class="f" style="text-align:right">Total HT<div class="line-total" data-total></div></label>' +
        '</div><div class="line-err field-msg err" data-err></div></div>';
    }).join('');
    box.querySelectorAll('textarea').forEach(autoGrow);
  }

  /* ---------------- Mise à jour (calculs, aperçu, messages) ---------------- */

  function refresh() {
    var settings = App.store.getSettings();
    var totals = App.calc.computeTotals(doc);

    // Totaux de chaque ligne et erreurs
    ui.$$('#lines .line', view).forEach(function (el, i) {
      var r = totals.lines[i];
      if (!r) return;
      var t = el.querySelector('[data-total]');
      t.textContent = r.textOnly ? 'texte seul' : util.formatCents(r.netCents);
      t.classList.toggle('neg', r.netCents < 0);
      t.classList.toggle('muted', r.textOnly);
      ['qty', 'price', 'discount', 'taxRate'].forEach(function (k) {
        el.querySelector('[data-k="' + k + '"]').classList.toggle('invalid', r.errors.some(function (e) { return e.field === k; }));
      });
      el.querySelector('[data-err]').textContent = r.errors.map(function (e) { return e.msg; }).join(' · ');
    });
    var gd = ui.$('#f-gd', view);
    if (gd) gd.classList.toggle('invalid', totals.errors.some(function (e) { return e.field === 'globalDiscount'; }));
    if (!totals.errors.length) ui.$('#alerts', view).innerHTML = '';

    // Récapitulatif
    var f = util.formatMoney;
    var rows = [];
    rows.push(['Total brut HT', f(totals.grossCents)]);
    if (totals.totalDiscountCents) rows.push(['Remises', '<span class="neg">' + f(-totals.totalDiscountCents) + '</span>']);
    rows.push(['Total HT', '<b>' + f(totals.totalHTCents) + '</b>']);
    if (!totals.taxes.length) rows.push(['TVA', f(0)]);
    totals.taxes.forEach(function (t) { rows.push(['TVA ' + t.rate + ' %', f(t.taxCents)]); });
    var cs = App.words.closingSentence(doc.type, totals.totalTTCCents);
    ui.$('#sum', view).innerHTML = rows.map(function (r) {
      return '<div class="sum-row"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>';
    }).join('') +
      '<div class="sum-row big"><span>Total TTC</span><span>' + f(totals.totalTTCCents) + '</span></div>' +
      '<div class="words">' + esc(cs.prefix) + '<b>' + esc(cs.words) + '</b>' + esc(cs.suffix) + '</div>';

    // Aperçu
    ui.$('#pv-scale', view).innerHTML = App.preview.render(App.layout.build(doc, settings));
    fitPreview();
  }

  var refreshSoon = util.debounce(refresh, 60);

  function fitPreview() {
    var frame = ui.$('#pv-frame', view), scale = ui.$('#pv-scale', view);
    if (!frame || !scale || !scale.firstChild) return;
    var sheetW = scale.firstChild.offsetWidth;
    var k = Math.min(1, frame.clientWidth / sheetW);
    scale.style.transform = 'scale(' + k + ')';
    scale.style.width = sheetW + 'px';
    frame.style.height = Math.ceil(scale.firstChild.offsetHeight * k) + 'px';
  }

  function updateNumberMsg() {
    var msg = ui.$('#number-msg', view);
    var inputEl = ui.$('#f-number', view);
    if (!msg) return;
    var dup = App.numbering.numberExists(doc.number, doc.id);
    inputEl.classList.toggle('invalid', dup || !String(doc.number).trim());
    if (!String(doc.number).trim()) { msg.className = 'field-msg err'; msg.textContent = 'Numéro obligatoire'; return; }
    if (dup) { msg.className = 'field-msg warn'; msg.textContent = 'Ce numéro est déjà utilisé par un autre document.'; return; }
    msg.className = 'field-msg muted';
    if (!doc.saved && doc.numberAuto) msg.innerHTML = 'Numéro automatique, attribué à l’enregistrement';
    else if (!doc.saved) msg.innerHTML = 'Numéro modifié manuellement · <a href="#" id="number-auto">rétablir l’automatique</a>';
    else msg.textContent = '';
  }

  function setSaveState(text) {
    var el = ui.$('#save-state', view);
    if (!el) return;
    el.classList.toggle('dirty', dirty);
    el.textContent = text || (dirty ? 'Modifications non enregistrées' : (doc.saved ? 'Enregistré' : 'Nouveau — non enregistré'));
  }

  function markDirty() {
    if (!dirty) { dirty = true; setSaveState(); }
  }

  function autoGrow(t) {
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight + 2, 420) + 'px';
  }

  function showAlerts(v) {
    var box = ui.$('#alerts', view);
    var h = '';
    if (v && v.errors.length) h += '<div class="alert err"><b>À corriger avant l’export :</b><ul>' + v.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
    box.innerHTML = h;
    if (h) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------------- Actions ---------------- */

  /** Enregistre le document. Le numéro automatique n'est consommé qu'ici. */
  function save(opts) {
    opts = opts || {};
    if (!String(doc.number || '').trim()) { ui.toast('Le numéro du document est obligatoire.', 'err'); return false; }
    doc.number = String(doc.number).trim();
    if (App.numbering.numberExists(doc.number, doc.id)) {
      if (!doc.saved && doc.numberAuto) {
        var old = doc.number;
        doc.number = App.numbering.peek(doc.type, doc.issueDate);
        ui.toast('Le numéro ' + old + ' venait d’être utilisé : ce document reçoit le numéro ' + doc.number + '.');
      } else if (!window.confirm('Le numéro ' + doc.number + ' est déjà utilisé par un autre document.\nEnregistrer quand même avec ce numéro ?')) {
        return false;
      }
    }
    var wasSaved = doc.saved;
    doc.saved = true;
    doc.numberAuto = false;
    try {
      App.numbering.commit(doc.type, doc.number);
      App.store.saveDoc(util.clone(doc));
    } catch (e) {
      doc.saved = wasSaved;
      ui.toast(e.message, 'err');
      return false;
    }
    dirty = false;
    draft = null;
    if (!wasSaved) {
      history.replaceState(null, '', '#/doc/' + doc.id);
      App.router.sync();
      render(view); // verrouille le type, met à jour le numéro
    } else {
      ui.$('#ed-title', view).textContent = title();
      updateNumberMsg();
    }
    var t = new Date();
    setSaveState('Enregistré à ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'));
    if (!opts.silent) ui.toast(title() + ' enregistré.', 'ok');
    return true;
  }

  /** Validation avant export puis enregistrement automatique. */
  function prepareExport() {
    var totals = App.calc.computeTotals(doc);
    var v = App.documents.validate(doc, totals);
    showAlerts(v);
    if (v.errors.length) { ui.toast('Corrigez les erreurs signalées avant d’exporter.', 'err'); return false; }
    var warnings = v.warnings.filter(function (w) { return w.indexOf('déjà utilisé') === -1; });
    if (warnings.length && !window.confirm('Attention :\n• ' + warnings.join('\n• ') + '\n\nExporter quand même ?')) {
      if (!String(doc.client.name || '').trim()) ui.$('#f-client', view).focus();
      return false;
    }
    return save({ silent: true });
  }

  function busy(btn, on, label) {
    if (on) { btn._label = btn.textContent; btn.textContent = label; btn.disabled = true; }
    else { btn.textContent = btn._label; btn.disabled = false; }
  }

  function onDownload(e) {
    if (!prepareExport()) return;
    var btn = e.currentTarget;
    busy(btn, true, 'Génération…');
    App.pdf.download(doc).then(function (r) { ui.toast('PDF téléchargé : ' + r.fileName, 'ok'); })
      .catch(function (err) { console.error(err); ui.toast('Échec de la génération du PDF : ' + err.message, 'err'); })
      .then(function () { busy(btn, false); });
  }

  function onPrint() {
    if (!prepareExport()) return;
    App.pdf.print(doc).catch(function (err) { console.error(err); ui.toast('Impression impossible : ' + err.message, 'err'); });
  }

  function onPreviewPdf() {
    App.pdf.show(doc).catch(function (err) { console.error(err); ui.toast('Aperçu PDF impossible : ' + err.message, 'err'); });
  }

  function onDrive(e) {
    if (!App.drive.isConfigured()) {
      ui.toast('Google Drive n’est pas configuré. Renseignez votre identifiant client OAuth dans <a href="#/parametres">Paramètres</a>. En attendant, utilisez « Télécharger le PDF ».', 'err', { html: true });
      return;
    }
    if (!App.drive.originSupported()) {
      ui.toast('Google Drive ne fonctionne pas avec un fichier ouvert en double-clic (file://). Lancez l’application via http://localhost (voir README). Le PDF peut être téléchargé normalement.', 'err', { duration: 12000 });
      return;
    }
    if (!prepareExport()) return;
    var btn = e.currentTarget;
    var tokenPromise = App.drive.getToken(); // appelé dans le clic : la fenêtre Google n'est pas bloquée
    busy(btn, true, 'Envoi vers Drive…');
    var snapshot = util.clone(doc);
    App.drive.saveDocument(snapshot, tokenPromise).then(function (file) {
      var info = { fileId: file.id, name: file.name, link: file.webViewLink || '', uploadedAt: new Date().toISOString() };
      var stored = App.store.getDoc(snapshot.id);
      if (stored) { stored.drive = info; App.store.saveDoc(stored); }
      doc.drive = info;
      ui.toast('Enregistré sur Google Drive : ' + esc(file.name) + (file.webViewLink ? ' · <a href="' + esc(file.webViewLink) + '" target="_blank" rel="noopener">Ouvrir</a>' : ''), 'ok', { html: true, duration: 8000 });
    }).catch(function (err) {
      console.error(err);
      ui.toast('Échec de l’envoi sur Google Drive : ' + err.message + ' Le document reste enregistré localement ; vous pouvez télécharger le PDF.', 'err', { duration: 12000 });
    }).then(function () { busy(btn, false); });
  }

  function bind() {
    var form = ui.$('.ed-form', view);

    form.addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset.f) {
        var val = t.type === 'checkbox' ? t.checked : t.value;
        setPath(doc, t.dataset.f, val);
        if (t.dataset.f === 'number') { doc.numberAuto = false; updateNumberMsg(); ui.$('#ed-title', view).textContent = title(); }
        if (t.dataset.f === 'issueDate' && !doc.saved && doc.numberAuto && util.isValidISODate(t.value)) {
          doc.number = App.numbering.peek(doc.type, t.value);
          ui.$('#f-number', view).value = doc.number;
          ui.$('#ed-title', view).textContent = title();
        }
      } else if (t.dataset.k) {
        var i = Number(t.closest('.line').dataset.i);
        doc.lines[i][t.dataset.k] = t.dataset.k === 'taxRate' ? Number(t.value) : t.value;
      } else {
        return;
      }
      if (t.tagName === 'TEXTAREA') autoGrow(t);
      markDirty();
      refreshSoon();
    });
    form.addEventListener('change', function (e) {
      // select et cases à cocher (certains navigateurs n'émettent pas « input »)
      var t = e.target;
      if ((t.tagName === 'SELECT' || t.type === 'checkbox') && (t.dataset.f || t.dataset.k)) {
        t.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    form.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a]');
      if (a) {
        var i = Number(a.closest('.line').dataset.i);
        if (a.dataset.a === 'del') {
          var l = doc.lines[i];
          if ((l.description || l.price) && !window.confirm('Supprimer cette ligne ?')) return;
          doc.lines.splice(i, 1);
        } else {
          var j = a.dataset.a === 'up' ? i - 1 : i + 1;
          var tmp = doc.lines[i]; doc.lines[i] = doc.lines[j]; doc.lines[j] = tmp;
        }
        renderLines(); markDirty(); refresh();
        return;
      }
      if (e.target.id === 'number-auto') {
        e.preventDefault();
        doc.number = App.numbering.peek(doc.type, doc.issueDate);
        doc.numberAuto = true;
        ui.$('#f-number', view).value = doc.number;
        ui.$('#ed-title', view).textContent = title();
        updateNumberMsg(); markDirty(); refresh();
      }
    });

    var seg = ui.$('#type-seg', view);
    if (seg) seg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      e.preventDefault();
      if (b.dataset.t === doc.type) return;
      var fresh = App.documents.newDoc(b.dataset.t);
      // Conserve la saisie commune, adapte numéro et champs propres au type
      ['client', 'subject', 'lines', 'globalDiscount', 'notes', 'notesTitle', 'issueDate', 'showSignature', 'showStamp'].forEach(function (k) { fresh[k] = doc[k]; });
      fresh.id = doc.id;
      fresh.number = App.numbering.peek(fresh.type, fresh.issueDate);
      doc = fresh;
      markDirty();
      render(view);
    });

    ui.$('#add-line', view).addEventListener('click', function () {
      doc.lines.push(App.documents.newLine());
      renderLines(); markDirty(); refresh();
      var last = ui.$$('#lines .line', view).pop();
      if (last) last.querySelector('textarea').focus();
    });

    bindImageDrop();
    ui.$('#act-save', view).addEventListener('click', function () { save(); });
    ui.$('#act-pdf', view).addEventListener('click', onDownload);
    ui.$('#act-print', view).addEventListener('click', onPrint);
    ui.$('#act-drive', view).addEventListener('click', onDrive);
    ui.$('#act-preview', view).addEventListener('click', onPreviewPdf);
    ui.$('#act-dup', view).addEventListener('click', function () { openDraft(App.documents.duplicate(doc)); });
    var conv = ui.$('#act-convert', view);
    if (conv) conv.addEventListener('click', function () { openDraft(App.documents.duplicate(doc, 'facture')); });

    if (resizeObs) resizeObs.disconnect();
    if (window.ResizeObserver) {
      resizeObs = new ResizeObserver(function () { fitPreview(); });
      resizeObs.observe(ui.$('#pv-frame', view));
    }
  }

  /* ---------------- Remplissage du client depuis une image (Gemini) ---------------- */

  var CLIENT_KEYS = ['name', 'contact', 'address', 'email', 'phone', 'ice'];
  var CLIENT_LABELS = { name: 'société', contact: 'contact', address: 'adresse', email: 'e-mail', phone: 'téléphone', ice: 'ICE / IF' };
  var ocrBusy = false;

  function setClientInputs() {
    CLIENT_KEYS.forEach(function (k) {
      var el = ui.$('[data-f="client.' + k + '"]', view);
      if (el) { el.value = doc.client[k] || ''; if (el.tagName === 'TEXTAREA') autoGrow(el); }
    });
  }

  function ocrStatus(html) {
    var el = ui.$('#ocr-status', view);
    if (el) el.innerHTML = html;
  }

  function handleImage(file) {
    if (ocrBusy || !view) return;
    if (!App.extract.isConfigured()) {
      ui.toast('Ajoutez votre clé API Google (Gemini) dans <a href="#/parametres">Paramètres</a> pour remplir automatiquement depuis une image.', 'err', { html: true });
      return;
    }
    ocrBusy = true;
    var drop = ui.$('#ocr-drop', view);
    drop.classList.add('busy');
    ocrStatus('<span class="muted">Analyse de l\u2019image par Google…</span>');
    var thumbUrl = URL.createObjectURL(file);
    ui.$('#ocr-thumb', view).innerHTML = '<img src="' + thumbUrl + '" alt="">';
    var target = doc;
    App.extract.extractClient(file).then(function (res) {
      if (doc !== target || !view) return; // l'utilisateur a changé de document entre-temps
      var before = util.clone(doc.client);
      var filled = CLIENT_KEYS.filter(function (k) { return res.fields[k]; });
      if (!filled.length) {
        ocrStatus('<span class="field-msg warn">Aucune coordonnée d\u2019entreprise trouvée dans cette image.</span>');
        return;
      }
      filled.forEach(function (k) { doc.client[k] = res.fields[k]; });
      setClientInputs();
      markDirty();
      refresh();
      ocrStatus('<span class="field-msg" style="color:var(--ok)">Rempli : ' + filled.map(function (k) { return CLIENT_LABELS[k]; }).join(', ') +
        '. Vérifiez les informations.</span> <a href="#" id="ocr-undo">Annuler</a>');
      var undo = ui.$('#ocr-undo', view);
      if (undo) undo.addEventListener('click', function (e) {
        e.preventDefault();
        doc.client = before;
        setClientInputs(); markDirty(); refresh();
        ocrStatus('<span class="muted">Remplissage annulé.</span>');
      });
    }).catch(function (err) {
      console.error(err);
      if (view) ocrStatus('<span class="field-msg err">' + esc(err.message) + '</span>');
    }).then(function () {
      ocrBusy = false;
      if (view) drop.classList.remove('busy');
      setTimeout(function () { URL.revokeObjectURL(thumbUrl); }, 60000);
    });
  }

  function bindImageDrop() {
    var drop = ui.$('#ocr-drop', view), fileInput = ui.$('#ocr-file', view);
    drop.addEventListener('click', function (e) { if (!e.target.closest('a')) fileInput.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) handleImage(fileInput.files[0]); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach(function (t) {
      drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      drop.addEventListener(t, function () { drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleImage(f);
    });
  }

  /** ⌘V d'une image n'importe où dans l'éditeur (sauf collage de texte dans un champ). */
  document.addEventListener('paste', function (e) {
    if (!view || !document.body.contains(view) || !ui.$('#ocr-drop', view) || document.querySelector('.overlay')) return;
    var items = Array.prototype.slice.call((e.clipboardData && e.clipboardData.items) || []);
    var imgItem = items.filter(function (i) { return i.kind === 'file' && /^image\//.test(i.type); })[0];
    if (!imgItem) return;
    var hasText = items.some(function (i) { return i.type === 'text/plain'; });
    var a = document.activeElement;
    var inField = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
    if (hasText && inField) return;
    e.preventDefault();
    handleImage(imgItem.getAsFile());
  });

  /* ---------------- Points d'entrée (routeur) ---------------- */

  function openExisting(container, id) {
    var stored = App.store.getDoc(id);
    if (!stored) { ui.toast('Document introuvable.', 'err'); location.hash = '#/'; return; }
    doc = util.clone(stored);
    dirty = false;
    render(container);
  }

  function openNew(container, type) {
    doc = App.documents.newDoc(type === 'facture' ? 'facture' : 'devis');
    dirty = false;
    render(container);
    ui.$('#f-client', container).focus();
  }

  function openDraftView(container) {
    if (!draft) { location.hash = '#/'; return; }
    doc = draft;
    dirty = true;
    render(container);
  }

  /** Ouvre un document non enregistré (copie / conversion). */
  function openDraft(d) {
    if (!canLeave()) return;
    dirty = false;
    draft = d;
    if (location.hash === '#/brouillon') App.router.route(); else location.hash = '#/brouillon';
    ui.toast(App.documents.typeLabel(d.type) + ' ' + d.number + ' créé (non enregistré).');
  }

  function canLeave() {
    if (!dirty) return true;
    if (window.confirm('Les modifications de ' + title() + ' ne sont pas enregistrées.\nQuitter sans enregistrer ?')) { dirty = false; return true; }
    return false;
  }

  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && doc && view && document.body.contains(view) && ui.$('.ed-form', view)) {
      e.preventDefault();
      save();
    }
  }
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  App.editor = {
    openExisting: openExisting,
    openNew: openNew,
    openDraftView: openDraftView,
    openDraft: openDraft,
    canLeave: canLeave,
    isDirty: function () { return dirty; },
    close: function () { if (resizeObs) resizeObs.disconnect(); view = null; }
  };
})(window.App = window.App || {});
