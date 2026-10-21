/*
 * Montant en toutes lettres (français, orthographe traditionnelle) :
 * « vingt et un », « quatre-vingts », « deux cents », « deux cent mille », « deux millions de dirhams ».
 */
(function (App) {
  'use strict';

  var UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
    'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  var TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

  /** n < 100. `final` : le nombre n'est pas suivi de « mille » (accord de quatre-vingts). */
  function below100(n, final) {
    if (n < 20) return UNITS[n];
    var t = Math.floor(n / 10), u = n % 10;
    if (t === 7 || t === 9) {
      return TENS[t] + (t === 7 && u === 1 ? ' et ' : '-') + UNITS[10 + u];
    }
    if (u === 0) return t === 8 ? (final ? 'quatre-vingts' : 'quatre-vingt') : TENS[t];
    if (u === 1 && t !== 8) return TENS[t] + ' et un';
    return TENS[t] + '-' + UNITS[u];
  }

  function below1000(n, final) {
    var h = Math.floor(n / 100), r = n % 100;
    var out = [];
    if (h === 1) out.push('cent');
    else if (h > 1) out.push(UNITS[h] + ' cent' + (r === 0 && final ? 's' : ''));
    if (r > 0) out.push(below100(r, final));
    return out.join(' ');
  }

  /** Entier positif -> lettres. */
  function integerToWords(n) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'zéro';
    var milliards = Math.floor(n / 1e9);
    var millions = Math.floor(n / 1e6) % 1000;
    var milliers = Math.floor(n / 1000) % 1000;
    var rest = n % 1000;
    var out = [];
    if (milliards) out.push(below1000(milliards, true) + ' milliard' + (milliards > 1 ? 's' : ''));
    if (millions) out.push(below1000(millions, true) + ' million' + (millions > 1 ? 's' : ''));
    if (milliers) out.push(milliers === 1 ? 'mille' : below1000(milliers, false) + ' mille');
    if (rest) out.push(below1000(rest, true));
    return out.join(' ');
  }

  /** Montant en centimes -> « vingt-cinq mille quatre-vingts dirhams et cinquante centimes ». */
  function amountToWords(cents) {
    var negative = cents < 0;
    cents = Math.abs(Math.round(cents));
    var dh = Math.floor(cents / 100);
    var c = cents % 100;
    var words = integerToWords(dh);
    var roundMillions = dh >= 1e6 && dh % 1e6 === 0;
    words += (roundMillions ? ' de' : '') + (dh > 1 ? ' dirhams' : ' dirham');
    if (c > 0) words += ' et ' + integerToWords(c) + (c > 1 ? ' centimes' : ' centime');
    return (negative ? 'moins ' : '') + words;
  }

  /** Phrase d'arrêté selon le type de document, découpée pour permettre la mise en gras. */
  function closingSentence(type, ttcCents, currency) {
    var isFacture = type === 'facture';
    return {
      prefix: isFacture ? 'Arrêtée la présente facture à la somme de ' : 'Arrêté le présent devis à la somme de ',
      words: amountToWords(ttcCents) + ' toutes taxes comprises',
      suffix: ' (' + App.util.formatCents(ttcCents) + App.util.NBSP + (currency || 'MAD') + App.util.NBSP + 'TTC).'
    };
  }

  App.words = {
    integerToWords: integerToWords,
    amountToWords: amountToWords,
    closingSentence: closingSentence
  };
})(window.App = window.App || {});
