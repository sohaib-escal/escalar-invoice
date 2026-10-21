/* Tests des calculs, du montant en lettres et de la numérotation. Ouvrir tests/index.html. */
(function (App) {
  'use strict';

  var results = [];
  function eq(name, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ name: name, ok: ok, actual: actual, expected: expected });
  }

  var W = App.words.amountToWords, I = App.words.integerToWords;
  eq('0', I(0), 'zéro');
  eq('1', I(1), 'un');
  eq('17', I(17), 'dix-sept');
  eq('21', I(21), 'vingt et un');
  eq('71', I(71), 'soixante et onze');
  eq('72', I(72), 'soixante-douze');
  eq('80', I(80), 'quatre-vingts');
  eq('81', I(81), 'quatre-vingt-un');
  eq('91', I(91), 'quatre-vingt-onze');
  eq('100', I(100), 'cent');
  eq('101', I(101), 'cent un');
  eq('200', I(200), 'deux cents');
  eq('201', I(201), 'deux cent un');
  eq('1000', I(1000), 'mille');
  eq('1080', I(1080), 'mille quatre-vingts');
  eq('80000', I(80000), 'quatre-vingt mille');
  eq('200000', I(200000), 'deux cent mille');
  eq('25080', I(25080), 'vingt-cinq mille quatre-vingts');
  eq('1000000', I(1000000), 'un million');
  eq('200000000', I(200000000), 'deux cents millions');
  eq('1234567', I(1234567), 'un million deux cent trente-quatre mille cinq cent soixante-sept');
  eq('montant référence', W(2508000), 'vingt-cinq mille quatre-vingts dirhams');
  eq('1 dirham', W(100), 'un dirham');
  eq('centimes', W(150050), 'mille cinq cents dirhams et cinquante centimes');
  eq('1 centime', W(1), 'zéro dirham et un centime');
  eq('million de dirhams', W(200000000), 'deux millions de dirhams');

  var C = App.calc;
  function doc(lines, gd) {
    return { lines: lines, globalDiscount: gd || { type: 'percent', value: '' } };
  }
  var ref = C.computeTotals(doc([
    { description: 'Carte', qty: '190', price: '125', discount: '', taxRate: 20 },
    { description: 'Remise', qty: '190', price: '-15', discount: '', taxRate: 20 }
  ]));
  eq('réf. HT', ref.totalHTCents, 2090000);
  eq('réf. TVA', ref.totalTaxCents, 418000);
  eq('réf. TTC', ref.totalTTCCents, 2508000);

  var dec = C.computeTotals(doc([{ description: 'x', qty: '3', price: '0,1', discount: '', taxRate: 20 }]));
  eq('décimales 3 x 0,10', dec.totalHTCents, 30);
  var r = C.computeTotals(doc([{ description: 'x', qty: '1', price: '1,005', discount: '', taxRate: 20 }]));
  eq('arrondi 1,005', r.totalHTCents, 101);
  var disc = C.computeTotals(doc([{ description: 'x', qty: '2', price: '99,99', discount: '15', taxRate: 20 }]));
  eq('remise ligne', [disc.grossCents, disc.lineDiscountCents, disc.totalHTCents, disc.totalTaxCents], [19998, 3000, 16998, 3400]);
  var mixed = C.computeTotals(doc([
    { description: 'a', qty: '1', price: '1000', discount: '', taxRate: 20 },
    { description: 'b', qty: '1', price: '500', discount: '', taxRate: 10 }
  ], { type: 'amount', value: '100' }));
  eq('remise globale répartie', mixed.taxes.map(function (t) { return [t.rate, t.baseCents, t.taxCents]; }), [[20, 93333, 18667], [10, 46667, 4667]]);
  eq('remise globale total HT', mixed.totalHTCents, 140000);
  var neg = C.computeTotals(doc([{ description: 'x', qty: '-1', price: '10', discount: '', taxRate: 20 }]));
  eq('quantité négative refusée', neg.errors.length > 0, true);
  var bad = C.computeTotals(doc([{ description: 'x', qty: '1', price: 'abc', discount: '', taxRate: 20 }]));
  eq('prix invalide refusé', bad.errors.length > 0, true);
  var rate = C.computeTotals(doc([{ description: 'x', qty: '1', price: '10', discount: '', taxRate: 19 }]));
  eq('taux TVA invalide refusé', rate.errors.length > 0, true);
  var text = C.computeTotals(doc([{ description: 'Titre seul', qty: '', price: '', discount: '', taxRate: 20 }]));
  eq('ligne de texte sans montant', [text.errors.length, text.totalTTCCents], [0, 0]);
  var zero = C.computeTotals(doc([{ description: 'Offert', qty: '1', price: '0', discount: '', taxRate: 20 }]));
  eq('ligne à zéro', [zero.errors.length, zero.totalTTCCents], [0, 0]);
  var tva0 = C.computeTotals(doc([{ description: 'x', qty: '1', price: '100', discount: '', taxRate: 0 }]));
  eq('TVA 0 %', tva0.totalTTCCents, 10000);

  eq('format', App.util.formatCents(2508000), '25 080,00');
  eq('format négatif', App.util.formatCents(-285000), '−2 850,00');
  eq('parse "1 250,50"', App.util.parseNumber('1 250,50'), 1250.5);
  eq('parse "1.5"', App.util.parseNumber('1.5'), 1.5);
  eq('parse "12a"', isNaN(App.util.parseNumber('12a')), true);

  var N = App.numbering;
  eq('format devis (jour)', N.format('devis', '2026-10-21', 1), 'D26102101');
  eq('format facture (mois)', N.format('facture', '2026-10-21', 1), 'F2610001');
  eq('format facture 12', N.format('facture', '2026-03-05', 12), 'F2603012');
  eq('parse devis', N.parse('devis', 'D26093001'), { isoDate: '2026-09-30', seq: 1 });
  eq('parse facture', N.parse('facture', 'F2610042'), { isoDate: '2026-10-01', seq: 42 });
  eq('parse facture > 999', N.parse('facture', 'F26101000'), { isoDate: '2026-10-01', seq: 1000 });
  eq('parse date invalide', N.parse('devis', 'D26133201'), null);
  eq('parse format libre', N.parse('facture', 'FAC-2026-12'), null);
  eq('nom de fichier', App.documents.fileName({ type: 'devis', number: 'D26100001', client: { name: 'Société Générale « Maroc »' } }), 'DEVIS_D26100001_Societe_Generale_Maroc.pdf');

  App.testResults = results;
})(window.App);
