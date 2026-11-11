/*
 * Numérotation :
 *  - Devis   : PRÉFIXE + AA + MM + JJ + séquence du jour sur 2 chiffres  (ex. D26102101)
 *  - Facture : PRÉFIXE + AA + MM + séquence du mois sur 3 chiffres      (ex. F2610001)
 * La période (jour ou mois) est celle de la date d'émission du document.
 * En mode multi-utilisateur, l'attribution se fait de manière atomique via PostgreSQL
 * (fonction allocate_number) pour éliminer tout risque de doublon concurrent.
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
    var guard = 0;
    while (numberExists(number) && guard++ < 10000) {
      seq++;
      number = format(type, isoDate, seq, settings);
    }
    return number;
  }

  /**
   * Aperçu asynchrone vérifiant aussi la base de données Supabase
   */
  async function peekAsync(type, isoDate) {
    var sb = App.supabaseClient ? App.supabaseClient.getClient() : null;
    if (sb && App.auth && App.auth.isAuthenticated()) {
      try {
        var { data, error } = await sb.rpc('peek_next_number', {
          p_type: type,
          p_issue_date: isoDate
        });
        if (!error && data) return data;
      } catch (e) {
        console.warn('peekAsync RPC échoué, fallback peek local:', e);
      }
    }
    return peek(type, isoDate);
  }

  /**
   * Attribution atomique en base de données PostgreSQL (anti-doublon concurrent)
   */
  async function allocateAtomic(type, isoDate) {
    var sb = App.supabaseClient ? App.supabaseClient.getClient() : null;
    if (sb && App.auth && App.auth.isAuthenticated()) {
      try {
        var { data, error } = await sb.rpc('allocate_number', {
          p_type: type,
          p_issue_date: isoDate
        });
        if (!error && data) {
          commit(type, data);
          return data;
        }
      } catch (e) {
        console.error('Erreur allocate_number RPC:', e);
      }
    }

    // Fallback local si non connecté ou en mode déconnecté
    var num = peek(type, isoDate);
    commit(type, num);
    return num;
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

      var sb = App.supabaseClient ? App.supabaseClient.getClient() : null;
      if (sb && App.auth && App.auth.isAuthenticated()) {
        sb.from('numbering_counters').upsert({
          counter_key: key,
          last_used: parsed.seq,
          updated_at: new Date().toISOString()
        }).then(null, function () {});
      }
    }
  }

  /** Fixe manuellement le prochain numéro de la période de `isoDate` (Paramètres). */
  function setNext(type, isoDate, nextSeq) {
    var counters = App.store.getCounters();
    var key = counterKey(type, isoDate);
    counters[key] = Math.max(0, Math.floor(nextSeq) - 1);
    App.store.saveCounters(counters);

    var sb = App.supabaseClient ? App.supabaseClient.getClient() : null;
    if (sb && App.auth && App.auth.isAdmin()) {
      sb.from('numbering_counters').upsert({
        counter_key: key,
        last_used: counters[key],
        updated_at: new Date().toISOString()
      }).then(null, function () {});
    }
  }

  App.numbering = {
    SCHEMES: SCHEMES,
    format: format,
    parse: parse,
    peek: peek,
    peekAsync: peekAsync,
    allocateAtomic: allocateAtomic,
    commit: commit,
    lastUsed: lastUsed,
    setNext: setNext,
    numberExists: numberExists
  };
})(typeof window !== 'undefined' ? (window.App = window.App || {}) : (typeof global !== 'undefined' ? (global.window = global.window || {}, global.window.App = global.window.App || {}) : {}));
