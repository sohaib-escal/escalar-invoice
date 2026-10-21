/*
 * Construit le « modèle de présentation » d'un document : tout le texte déjà formaté,
 * prêt à être dessiné. L'aperçu HTML et le PDF utilisent ce même modèle,
 * ce qui garantit qu'ils affichent exactement les mêmes informations.
 */
(function (App) {
  'use strict';

  var util = App.util;

  /** "texte **gras** texte" -> [{text, bold}] */
  function parseRich(s, baseBold) {
    var out = [];
    String(s || '').split(/(\*\*[^*]+\*\*)/g).forEach(function (part) {
      if (!part) return;
      var m = /^\*\*([^*]+)\*\*$/.exec(part);
      out.push({ text: m ? m[1] : part, bold: !!m || !!baseBold });
    });
    return out;
  }

  function bulletItems(text) {
    return String(text || '').split('\n')
      .map(function (l) { return l.replace(/^\s*[-•*]\s+/, '').trim(); })
      .filter(Boolean);
  }

  /** Description : si plusieurs lignes, la première sert de titre (en gras). */
  function descriptionParagraphs(text) {
    var lines = String(text || '').replace(/\s+$/, '').split('\n');
    var multi = lines.filter(function (l) { return l.trim(); }).length > 1;
    var first = true;
    var paras = [];
    lines.forEach(function (l) {
      if (!l.trim()) { if (paras.length) paras[paras.length - 1].gapAfter = true; return; }
      paras.push({ runs: parseRich(l.trim(), multi && first), title: multi && first });
      first = false;
    });
    return paras;
  }

  function build(doc, settings) {
    var c = settings.company;
    var totals = App.calc.computeTotals(doc);
    var isFacture = doc.type === 'facture';
    var currency = settings.defaults.currency || 'MAD';

    var meta = [];
    meta.push({ label: isFacture ? 'Date de facture' : 'Date d’émission', value: util.formatDate(doc.issueDate) });
    if (!isFacture && doc.validUntil) meta.push({ label: 'Offre valable jusqu’au', value: util.formatDate(doc.validUntil) });
    if (isFacture && doc.dueDate) meta.push({ label: 'Échéance', value: util.formatDate(doc.dueDate) });
    if (isFacture && doc.sourceRef) meta.push({ label: 'Réf. devis', value: doc.sourceRef });

    var issuerLines = [];
    if (c.headOffice) issuerLines.push('Siège social : ' + c.headOffice);
    if (c.correspondence) issuerLines.push('Correspondance : ' + c.correspondence);
    if (c.phone) issuerLines.push('Tél. : ' + c.phone);
    if (c.email) issuerLines.push('E-mail : ' + c.email);

    var cl = doc.client || {};
    var clientLines = [];
    if (cl.contact) clientLines.push([{ text: 'À l’attention de : ' }, { text: cl.contact, bold: true }]);
    String(cl.address || '').split('\n').forEach(function (l) { if (l.trim()) clientLines.push([{ text: l.trim() }]); });
    if (cl.phone) clientLines.push([{ text: 'Tél. : ' + cl.phone }]);
    if (cl.email) clientLines.push([{ text: 'E-mail : ' + cl.email }]);
    if (cl.ice) clientLines.push([{ text: /^\s*(ICE|IF)\b/i.test(cl.ice) ? cl.ice : 'ICE : ' + cl.ice }]);

    var rows = (doc.lines || []).map(function (line, i) {
      var r = totals.lines[i];
      return {
        paragraphs: descriptionParagraphs(line.description),
        textOnly: r.textOnly,
        qty: r.textOnly ? '' : util.formatNumber(r.qty),
        price: r.textOnly ? '' : util.formatCents(r.priceCents),
        discount: r.textOnly || !r.discountPct ? '' : util.formatNumber(r.discountPct, 2) + ' %',
        tax: r.textOnly ? '' : r.taxRate + ' %',
        total: r.textOnly ? '' : util.formatCents(r.netCents),
        negative: !r.textOnly && r.netCents < 0
      };
    }).filter(function (row) { return row.paragraphs.length || !row.textOnly; });

    var totalRows = [];
    if (totals.globalDiscountCents) {
      totalRows.push({ label: 'Sous-total HT', value: util.formatCents(totals.subtotalCents), style: 'normal' });
      totalRows.push({
        label: 'Remise globale' + (totals.globalDiscountPct !== null ? ' ' + util.formatNumber(totals.globalDiscountPct, 2) + ' %' : ''),
        value: util.formatCents(-totals.globalDiscountCents), style: 'negative'
      });
    }
    totalRows.push({ label: 'Total HT', value: util.formatCents(totals.totalHTCents), style: 'sub' });
    if (!totals.taxes.length) totalRows.push({ label: 'TVA', value: util.formatCents(0), style: 'normal' });
    totals.taxes.forEach(function (t) {
      totalRows.push({
        label: 'TVA ' + t.rate + ' %' + (totals.mixedRates ? ' sur ' + util.formatCents(t.baseCents) : ''),
        value: util.formatCents(t.taxCents), style: 'normal'
      });
    });
    totalRows.push({ label: 'Total TTC', value: util.formatCents(totals.totalTTCCents) + (currency !== 'MAD' ? ' ' + currency : ''), style: 'grand' });

    // Blocs bas de page : notes à gauche, conditions / paiement à droite
    var blocks = [];
    var notes = bulletItems(doc.notes);
    if (notes.length) blocks.push({ title: doc.notesTitle || 'Notes', items: notes });
    var right = [];
    if (!isFacture) {
      if (doc.deliveryTime) right.push('**Délai de livraison :** ' + doc.deliveryTime);
      if (doc.paymentTerms) right.push('**Modalités de paiement :** ' + doc.paymentTerms);
      right = right.concat(bulletItems(doc.conditions));
      if (right.length) blocks.push({ title: 'Conditions', items: right });
    } else {
      if (doc.dueDate) right.push('**Échéance :** ' + util.formatDate(doc.dueDate));
      if (doc.paymentMethod) right.push('**Mode de paiement :** ' + doc.paymentMethod);
      if (doc.paymentRef) right.push('**Référence de paiement :** ' + doc.paymentRef);
      if (doc.paymentTerms) right.push('**Conditions de paiement :** ' + doc.paymentTerms);
      right = right.concat(bulletItems(doc.conditions));
      if (right.length) blocks.push({ title: 'Paiement', items: right });
    }
    blocks.forEach(function (b) { b.items = b.items.map(function (t) { return parseRich(t); }); });

    var footer = [];
    var f1 = [{ text: c.legalName, bold: true }];
    if (c.capital) f1.push({ text: ' au capital de ' + c.capital });
    if (c.headOffice) f1.push({ text: ' · Siège social : ' + c.headOffice });
    footer.push(f1);
    var ids = [];
    if (c.rc) ids.push('RC ' + (c.rcCity ? c.rcCity + ' ' : '') + 'n° ' + c.rc);
    if (c.if) ids.push('IF : ' + c.if);
    if (c.ice) ids.push('ICE : ' + c.ice);
    if (c.patente) ids.push('Patente : ' + c.patente);
    if (c.cnss) ids.push('CNSS : ' + c.cnss);
    if (ids.length) footer.push([{ text: ids.join(' · ') }]);
    var contact = [c.phone ? 'Tél. : ' + c.phone : '', c.email, c.website].filter(Boolean);
    if (contact.length) footer.push([{ text: contact.join(' · ') }]);

    return {
      type: doc.type,
      title: isFacture ? 'FACTURE' : 'DEVIS',
      number: doc.number,
      meta: meta,
      logo: App.store.logoSrc(settings),
      issuer: { name: c.legalName, brandLine: c.brandLine, lines: issuerLines },
      client: { name: cl.name || '', lines: clientLines },
      subject: doc.subject || '',
      columns: { discount: totals.hasLineDiscount, tax: totals.mixedRates },
      rows: rows,
      totals: totalRows,
      discountNote: totals.totalDiscountCents > 0
        ? 'Total des remises accordées : ' + util.formatCents(totals.totalDiscountCents) + ' ' + currency + ' HT'
        : '',
      closing: App.words.closingSentence(doc.type, totals.totalTTCCents, currency),
      blocks: blocks,
      signature: {
        show: doc.showSignature !== false,
        place: 'Fait à ' + (c.city || 'Casablanca') + ', le ' + util.formatDate(doc.issueDate),
        label: 'Cachet et signature',
        stamp: doc.showStamp ? App.store.stampSrc(settings) : ''
      },
      acceptance: !isFacture && !!doc.showAcceptance,
      footer: footer,
      continuationLabel: (isFacture ? 'Facture' : 'Devis') + ' n° ' + doc.number + ' — suite',
      totalsData: totals
    };
  }

  App.layout = { build: build, parseRich: parseRich };
})(window.App = window.App || {});
