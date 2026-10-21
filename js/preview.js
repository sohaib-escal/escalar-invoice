/*
 * Aperçu HTML du document, construit à partir du même modèle que le PDF (App.layout).
 * Les dimensions (mm / pt) reprennent celles du PDF. La pagination exacte est celle du PDF
 * (bouton « Aperçu PDF »).
 */
(function (App) {
  'use strict';

  var esc = App.util.escapeHtml;

  function runs(list) {
    return list.map(function (r) { return r.bold ? '<strong>' + esc(r.text) + '</strong>' : esc(r.text); }).join('');
  }

  function render(vm) {
    var h = [];
    h.push('<div class="sheet">');

    // En-tête
    h.push('<header class="d-head">');
    h.push('<div class="d-logo">' + (vm.logo ? '<img src="' + vm.logo + '" alt="">' : '') + '</div>');
    h.push('<div class="d-title"><div class="d-type">' + esc(vm.title) + '</div>');
    h.push('<div class="d-meta">N° <b>' + esc(vm.number || '—') + '</b></div>');
    vm.meta.forEach(function (m) { h.push('<div class="d-meta">' + esc(m.label) + ' : <b>' + esc(m.value) + '</b></div>'); });
    h.push('</div></header>');

    // Parties
    h.push('<section class="d-parties"><div>');
    h.push('<div class="d-label">ÉMETTEUR</div><div class="d-name">' + esc(vm.issuer.name) + '</div>');
    if (vm.issuer.brandLine) h.push('<div class="d-brand">' + esc(vm.issuer.brandLine) + '</div>');
    vm.issuer.lines.forEach(function (l) { h.push('<div class="d-small">' + esc(l) + '</div>'); });
    h.push('</div><div>');
    h.push('<div class="d-label">DESTINATAIRE</div><div class="d-name' + (vm.client.name ? '' : ' d-missing') + '">' + esc(vm.client.name || 'Client à renseigner') + '</div>');
    vm.client.lines.forEach(function (l) { h.push('<div class="d-line">' + runs(l) + '</div>'); });
    h.push('</div></section>');

    if (vm.subject) h.push('<div class="d-subject"><b>Objet :</b> ' + esc(vm.subject) + '</div>');

    // Tableau
    var c = vm.columns;
    h.push('<table class="d-table"><thead><tr><th class="l">Désignation des prestations</th><th class="c w-qty">Qté</th><th class="r w-price">P.U. HT</th>');
    if (c.discount) h.push('<th class="r w-disc">Remise</th>');
    if (c.tax) h.push('<th class="c w-tax">TVA</th>');
    h.push('<th class="r w-total">Total HT</th></tr></thead><tbody>');
    if (!vm.rows.length) {
      h.push('<tr><td colspan="' + (4 + (c.discount ? 1 : 0) + (c.tax ? 1 : 0)) + '" class="d-empty">Aucune prestation</td></tr>');
    }
    vm.rows.forEach(function (r) {
      var desc = r.paragraphs.map(function (p) {
        return '<p class="' + (p.title ? 't' : '') + (p.gapAfter ? ' gap' : '') + '">' + runs(p.runs) + '</p>';
      }).join('');
      var neg = r.negative ? ' neg' : '';
      h.push('<tr><td class="l desc' + (r.paragraphs.length > 1 ? ' multi' : '') + '">' + desc + '</td>');
      h.push('<td class="c">' + esc(r.qty) + '</td><td class="r' + neg + '">' + esc(r.price) + '</td>');
      if (c.discount) h.push('<td class="r">' + esc(r.discount) + '</td>');
      if (c.tax) h.push('<td class="c">' + esc(r.tax) + '</td>');
      h.push('<td class="r' + neg + '">' + esc(r.total) + '</td></tr>');
    });
    h.push('</tbody></table>');

    // Totaux
    h.push('<div class="d-totals-wrap"><table class="d-totals">');
    vm.totals.forEach(function (t) {
      h.push('<tr class="' + t.style + '"><td>' + esc(t.label) + '</td><td>' + esc(t.value) + '</td></tr>');
    });
    h.push('</table></div>');
    if (vm.discountNote) h.push('<div class="d-discount-note">' + esc(vm.discountNote) + '</div>');

    h.push('<div class="d-words">' + esc(vm.closing.prefix) + '<b>' + esc(vm.closing.words) + esc(vm.closing.suffix) + '</b></div>');

    // Bas : notes / conditions / signatures (même disposition que le PDF)
    function block(b) {
      return '<div class="d-block"><div class="d-label">' + esc(b.title.toUpperCase()) + '</div><ul>' +
        b.items.map(function (i) { return '<li>' + runs(i) + '</li>'; }).join('') + '</ul></div>';
    }
    var sig = vm.signature.show
      ? '<div class="d-sign"><div>' + esc(vm.signature.place) + '</div><div><b>' + esc(vm.signature.label) + '</b></div>' +
        (vm.signature.stamp ? '<img src="' + vm.signature.stamp + '" alt="">' : '') + '</div>'
      : '';
    var acc = vm.acceptance
      ? '<div class="d-accept"><b>Bon pour accord</b><div class="d-small muted">Date, nom, cachet et signature du client</div><div class="box"></div></div>'
      : '';
    var singleFull = vm.blocks.length === 1 && !vm.signature.show && !vm.acceptance;
    if (vm.blocks.length || sig || acc) {
      h.push('<section class="d-bottom' + (singleFull ? ' full' : '') + '"><div>');
      if (vm.blocks[0]) h.push(block(vm.blocks[0]));
      h.push(acc + '</div><div>');
      if (vm.blocks[1]) h.push(block(vm.blocks[1]));
      h.push(sig + '</div></section>');
    }

    h.push('<footer class="d-foot">' + vm.footer.map(function (l) { return '<div>' + runs(l) + '</div>'; }).join('') + '</footer>');
    h.push('</div>');
    return h.join('');
  }

  /** Déclare la police Carlito (embarquée) pour l'aperçu : fonctionne aussi en file://. */
  function installFonts() {
    if (!window.APP_FONTS || document.getElementById('carlito-fonts')) return;
    var F = window.APP_FONTS;
    var faces = [['Regular', 400, 'normal'], ['Bold', 700, 'normal'], ['Italic', 400, 'italic'], ['BoldItalic', 700, 'italic']];
    var css = faces.map(function (f) {
      return '@font-face{font-family:"Carlito";font-weight:' + f[1] + ';font-style:' + f[2] +
        ';src:url(data:font/ttf;base64,' + F[f[0]] + ') format("truetype");}';
    }).join('\n');
    var style = document.createElement('style');
    style.id = 'carlito-fonts';
    style.textContent = css;
    document.head.appendChild(style);
  }

  App.preview = { render: render, installFonts: installFonts };
})(window.App = window.App || {});
