/*
 * Logique de calcul pure (aucun accès au DOM).
 * Tous les montants sont calculés en centimes entiers pour éviter les erreurs
 * d'arrondi des nombres flottants. Arrondi commercial (demi vers l'extérieur) à 2 décimales.
 */
(function (App) {
  'use strict';

  var parseNumber = App.util.parseNumber;

  /** Taux de TVA marocains autorisés. */
  var TAX_RATES = [20, 14, 10, 7, 0];

  /** Arrondi demi vers l'extérieur, robuste aux imprécisions flottantes (ex. 1.005 * 100). */
  function roundHalf(x) {
    var v = Number(x.toPrecision(12));
    var r = Math.round(Math.abs(v));
    return v < 0 ? -r : r;
  }

  function toCents(amount) {
    return roundHalf(amount * 100);
  }

  function isBlank(v) {
    return v === null || v === undefined || String(v).trim() === '';
  }

  /**
   * Calcule une ligne. Les champs saisis sont conservés tels quels (chaînes) dans le document ;
   * ils sont analysés ici. Une ligne sans quantité ni prix est une ligne de texte (aucun montant).
   */
  function computeLine(line) {
    var errors = [];
    var textOnly = isBlank(line.qty) && isBlank(line.price);

    var qty = isBlank(line.qty) ? 0 : parseNumber(line.qty);
    var price = isBlank(line.price) ? 0 : parseNumber(line.price);
    var discountPct = isBlank(line.discount) ? 0 : parseNumber(line.discount);
    var rate = Number(line.taxRate);

    if (!textOnly) {
      if (isBlank(line.qty)) errors.push({ field: 'qty', msg: 'Quantité manquante' });
      else if (isNaN(qty)) errors.push({ field: 'qty', msg: 'Quantité invalide' });
      else if (qty < 0) errors.push({ field: 'qty', msg: 'La quantité ne peut pas être négative' });
      if (isNaN(price)) errors.push({ field: 'price', msg: 'Prix unitaire invalide' });
    }
    if (isNaN(discountPct)) errors.push({ field: 'discount', msg: 'Remise invalide' });
    else if (discountPct < 0 || discountPct > 100) errors.push({ field: 'discount', msg: 'La remise doit être entre 0 et 100 %' });
    if (TAX_RATES.indexOf(rate) === -1) errors.push({ field: 'taxRate', msg: 'Taux de TVA invalide' });

    var valid = errors.length === 0;
    var q = valid && !isNaN(qty) ? qty : 0;
    var p = valid && !isNaN(price) ? price : 0;
    var d = valid && !isNaN(discountPct) ? discountPct : 0;

    var grossCents = textOnly ? 0 : roundHalf(q * p * 100);
    var discountCents = textOnly ? 0 : roundHalf(grossCents * d / 100);
    var netCents = grossCents - discountCents;

    return {
      textOnly: textOnly,
      qty: q,
      price: p,
      priceCents: toCents(p),
      discountPct: d,
      taxRate: TAX_RATES.indexOf(rate) === -1 ? 0 : rate,
      grossCents: grossCents,
      discountCents: discountCents,
      netCents: netCents,
      errors: errors
    };
  }

  /**
   * Calcule les totaux du document.
   * La remise globale est répartie au prorata des bases HT par taux de TVA,
   * le reste d'arrondi étant affecté au dernier taux pour que la somme soit exacte.
   */
  function computeTotals(doc) {
    var lines = (doc.lines || []).map(computeLine);
    var errors = [];
    lines.forEach(function (l, i) {
      l.errors.forEach(function (e) { errors.push({ line: i, field: e.field, msg: 'Ligne ' + (i + 1) + ' : ' + e.msg }); });
    });

    var grossCents = 0, lineDiscountCents = 0, subtotalCents = 0;
    var bases = {};
    lines.forEach(function (l) {
      if (l.textOnly) return;
      grossCents += l.grossCents;
      lineDiscountCents += l.discountCents;
      subtotalCents += l.netCents;
      bases[l.taxRate] = (bases[l.taxRate] || 0) + l.netCents;
    });

    // Remise globale
    var gd = doc.globalDiscount || {};
    var globalDiscountCents = 0, globalDiscountPct = null;
    if (!isBlank(gd.value)) {
      var v = parseNumber(gd.value);
      if (isNaN(v) || v < 0) {
        errors.push({ field: 'globalDiscount', msg: 'Remise globale invalide' });
      } else if (gd.type === 'amount') {
        globalDiscountCents = toCents(v);
        if (globalDiscountCents > Math.max(subtotalCents, 0)) {
          errors.push({ field: 'globalDiscount', msg: 'La remise globale dépasse le total HT' });
          globalDiscountCents = Math.max(subtotalCents, 0);
        }
      } else {
        if (v > 100) {
          errors.push({ field: 'globalDiscount', msg: 'La remise globale doit être entre 0 et 100 %' });
        } else {
          globalDiscountPct = v;
          globalDiscountCents = roundHalf(subtotalCents * v / 100);
        }
      }
    }

    // Répartition par taux (ordre décroissant des taux)
    var rates = Object.keys(bases).map(Number).sort(function (a, b) { return b - a; });
    var allocated = 0;
    var taxes = rates.map(function (rate, idx) {
      var base = bases[rate];
      var share = 0;
      if (globalDiscountCents && subtotalCents) {
        share = idx === rates.length - 1
          ? globalDiscountCents - allocated
          : roundHalf(globalDiscountCents * base / subtotalCents);
        allocated += share;
      }
      var baseAfter = base - share;
      return { rate: rate, baseCents: baseAfter, taxCents: roundHalf(baseAfter * rate / 100) };
    });

    var totalHTCents = subtotalCents - globalDiscountCents;
    var totalTaxCents = taxes.reduce(function (s, t) { return s + t.taxCents; }, 0);

    return {
      lines: lines,
      grossCents: grossCents,
      lineDiscountCents: lineDiscountCents,
      subtotalCents: subtotalCents,
      globalDiscountCents: globalDiscountCents,
      globalDiscountPct: globalDiscountPct,
      totalDiscountCents: lineDiscountCents + globalDiscountCents,
      totalHTCents: totalHTCents,
      taxes: taxes,
      totalTaxCents: totalTaxCents,
      totalTTCCents: totalHTCents + totalTaxCents,
      hasLineDiscount: lines.some(function (l) { return l.discountCents !== 0; }),
      mixedRates: rates.length > 1,
      errors: errors
    };
  }

  App.calc = {
    TAX_RATES: TAX_RATES,
    roundHalf: roundHalf,
    toCents: toCents,
    computeLine: computeLine,
    computeTotals: computeTotals
  };
})(window.App = window.App || {});
