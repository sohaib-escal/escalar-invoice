/*
 * Numérotation :
 *  - Devis   : PRÉFIXE + AA + MM + JJ + séquence du jour sur 2 chiffres  (ex. D26102101)
 *  - Facture : PRÉFIXE + AA + MM + séquence du mois sur 3 chiffres      (ex. F2610001)
 * La période (jour ou mois) est celle de la date d'émission du document.
 * Le numéro n'est « consommé » qu'au premier enregistrement (jamais au simple affichage),
 * un numéro n'est jamais réattribué, et un numéro saisi à la main plus élevé fait avancer le compteur.
 */
(function (App) {
  'use strict';

  var SCHEMES = {
    devis: { period: 'day', digits: 2 },
    facture: { period: 'month', digits: 3 }
  };

  function scheme(type) {
    return SCHEMES[type === 'facture' ? 'facture' : 'devis'];
  }

  function prefixFor(type, settings) {
    var n = (settings || App.store.getSettings()).numbering;
    return type === 'facture' ? (n.facturePrefix || 'F') : (n.devisPrefix || 'D');
  }

  /** Clé du compteur : "devis-2026-10-21" ou "facture-2026-10". */
  function counterKey(type, isoDate) {
    var p = isoDate.split('-');
    return (type === 'facture' ? 'facture' : 'devis') + '-' + p[0] + '-' + p[1] + (scheme(type).period === 'day' ? '-' + p[2] : '');
  }

  function format(type, isoDate, seq, settings) {
    var p = isoDate.split('-');
    var sc = scheme(type);
    return prefixFor(type, settings) + p[0].slice(2) + p[1] + (sc.period === 'day' ? p[2] : '') + String(seq).padStart(sc.digits, '0');
  }

  /** Analyse un numéro au format automatique. Retourne { isoDate, seq } (isoDate = début de période) ou null. */
  function parse(type, number, settings) {
    var sc = scheme(type);
    var prefix = prefixFor(type, settings).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = sc.period === 'day'
      ? new RegExp('^' + prefix + '(\\d{2})(\\d{2})(\\d{2})(\\d{' + sc.digits + ',})$')
      : new RegExp('^' + prefix + '(\\d{2})(\\d{2})(\\d{' + sc.digits + ',})$');
    var m = re.exec(String(number || '').trim().toUpperCase());
    if (!m) return null;
    var iso = '20' + m[1] + '-' + m[2] + '-' + (sc.period === 'day' ? m[3] : '01');
    if (!App.util.isValidISODate(iso)) return null;
    return { isoDate: iso, seq: Number(sc.period === 'day' ? m[4] : m[3]) };
  }

  function lastUsed(type, isoDate) {
    return App.store.getCounters()[counterKey(type, isoDate)] || 0;
  }

  function numberExists(number, exceptId) {
    var n = String(number || '').trim().toUpperCase();
    return App.store.listDocs().some(function (d) {
      return d.id !== exceptId && String(d.number).trim().toUpperCase() === n;
    });
  }

  /** Numéro proposé pour un nouveau document, sans rien consommer. */
  function peek(type, isoDate) {
    var settings = App.store.getSettings();
    var seq = lastUsed(type, isoDate) + 1;
    var number = format(type, isoDate, seq, settings);
    // Saute les numéros déjà présents (saisie manuelle, import, autre onglet)
    var guard = 0;
    while (numberExists(number) && guard++ < 10000) {
      seq++;
      number = format(type, isoDate, seq, settings);
    }
    return number;
  }

  /** Enregistre l'utilisation d'un numéro : le compteur de sa période ne fait qu'augmenter. */
  function commit(type, number) {
    var parsed = parse(type, number);
    if (!parsed) return;
    var counters = App.store.getCounters();
    var key = counterKey(type, parsed.isoDate);
    if ((counters[key] || 0) < parsed.seq) {
      counters[key] = parsed.seq;
      App.store.saveCounters(counters);
    }
  }

  /** Fixe manuellement le prochain numéro de la période de `isoDate` (Paramètres). */
  function setNext(type, isoDate, nextSeq) {
    var counters = App.store.getCounters();
    counters[counterKey(type, isoDate)] = Math.max(0, Math.floor(nextSeq) - 1);
    App.store.saveCounters(counters);
  }

  App.numbering = {
    SCHEMES: SCHEMES,
    format: format,
    parse: parse,
    peek: peek,
    commit: commit,
    lastUsed: lastUsed,
    setNext: setNext,
    numberExists: numberExists
  };
})(window.App = window.App || {});
