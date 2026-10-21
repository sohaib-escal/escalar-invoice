/*
 * Persistance locale (localStorage) : documents, compteurs, paramètres.
 * Les données restent dans CE navigateur, sur CET appareil.
 */
(function (App) {
  'use strict';

  var KEYS = {
    docs: 'ef.docs.v1',
    settings: 'ef.settings.v1',
    counters: 'ef.counters.v1'
  };
  var BACKUP_APP_ID = 'escalar-facturation';
  var BACKUP_VERSION = 1;

  function defaultSettings() {
    return {
      company: {
        legalName: 'ESCALAR MEDIA',
        brand: 'NFC Maroc',
        brandLine: 'NFC Maroc est la marque commerciale d’ESCALAR MEDIA',
        headOffice: 'Imm 27 Abdellah Ben Yassine, 2ème étage, Bureau 29 — Casablanca',
        correspondence: '11 Bd Zerktouni, étage 7, n° 21 — Casablanca',
        phone: '06 64 87 71 81',
        email: 'contact@nfcmaroc.com',
        website: 'www.nfcmaroc.com',
        capital: '100 000,00 MAD',
        rcCity: 'Casablanca',
        rc: '637863',
        if: '66034381',
        ice: '003551091000096',
        patente: '32503309',
        cnss: '3824415',
        city: 'Casablanca'
      },
      // null = logo fourni par défaut ; '' = aucun logo ; sinon data URL importée
      logo: null,
      // null = cachet fourni par défaut ; '' = aucun cachet ; sinon data URL importée
      stampImage: null,
      numbering: { devisPrefix: 'D', facturePrefix: 'F' },
      defaults: {
        taxRate: 20,
        currency: 'MAD',
        devisValidityDays: 30,
        factureDueDays: 30,
        devisConditions: 'Prix fermes et non révisables pendant toute la durée de validité de l’offre',
        devisPaymentTerms: '',
        facturePaymentTerms: '',
        factureNotes: ''
      },
      drive: { clientId: '55803966065-amtbkjg06rgdnel0ioip4itnlmqv7g1b.apps.googleusercontent.com', rootFolderId: '', devisFolderId: '', factureFolderId: '' },
      gemini: { apiKey: '', model: 'gemini-2.5-flash' }
    };
  }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('Lecture impossible', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      var quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
      throw new Error(quota
        ? 'Espace de stockage du navigateur plein. Exportez vos données puis supprimez d’anciens documents ou un logo trop lourd.'
        : 'Impossible d’enregistrer dans le navigateur (' + e.message + ').');
    }
  }

  /** Fusion profonde simple : les clés manquantes reçoivent la valeur par défaut. */
  function withDefaults(value, defaults) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value === undefined ? defaults : value;
    var out = {};
    Object.keys(defaults).forEach(function (k) {
      out[k] = (defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k]))
        ? withDefaults(value[k] || {}, defaults[k])
        : ((value[k] === undefined || (typeof defaults[k] === 'string' && defaults[k] && !value[k])) ? defaults[k] : value[k]);
    });
    Object.keys(value).forEach(function (k) { if (!(k in out)) out[k] = value[k]; });
    return out;
  }

  /* ---- Paramètres ---- */

  function getSettings() {
    return withDefaults(read(KEYS.settings, {}), defaultSettings());
  }

  function logoSrc(settings) {
    return settings.logo === null ? (window.APP_DEFAULT_LOGO || '') : settings.logo;
  }

  function stampSrc(settings) {
    return settings.stampImage === null ? (window.APP_DEFAULT_STAMP || '') : settings.stampImage;
  }

  function saveSettings(settings) {
    write(KEYS.settings, settings);
  }

  /* ---- Documents ---- */

  function getDocsMap() {
    return read(KEYS.docs, {}) || {};
  }

  function listDocs() {
    var map = getDocsMap();
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function getDoc(id) {
    return getDocsMap()[id] || null;
  }

  function saveDoc(doc) {
    var map = getDocsMap();
    doc.updatedAt = new Date().toISOString();
    if (!doc.createdAt) doc.createdAt = doc.updatedAt;
    map[doc.id] = doc;
    write(KEYS.docs, map);
    return doc;
  }

  function deleteDoc(id) {
    var map = getDocsMap();
    delete map[id];
    write(KEYS.docs, map);
  }

  /* ---- Compteurs : { "devis-2026": dernierNuméroUtilisé } ---- */

  function getCounters() {
    return read(KEYS.counters, {}) || {};
  }

  function saveCounters(c) {
    write(KEYS.counters, c);
  }

  /* ---- Sauvegarde / restauration ---- */

  function exportData() {
    return {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      docs: listDocs(),
      counters: getCounters(),
      settings: getSettings()
    };
  }

  /** Valide une sauvegarde sans rien modifier. Retourne { ok, errors, data }. */
  function validateBackup(data) {
    var errors = [];
    if (!data || typeof data !== 'object') return { ok: false, errors: ['Fichier illisible ou vide.'] };
    if (data.app !== BACKUP_APP_ID) errors.push('Ce fichier n’est pas une sauvegarde de cette application.');
    if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) errors.push('Version de sauvegarde non prise en charge.');
    if (!Array.isArray(data.docs)) errors.push('Liste de documents absente.');
    else {
      data.docs.forEach(function (d, i) {
        if (!d || typeof d !== 'object') { errors.push('Document #' + (i + 1) + ' invalide.'); return; }
        if (!d.id || typeof d.id !== 'string') errors.push('Document #' + (i + 1) + ' : identifiant manquant.');
        if (d.type !== 'devis' && d.type !== 'facture') errors.push('Document #' + (i + 1) + ' : type inconnu.');
        if (typeof d.number !== 'string') errors.push('Document #' + (i + 1) + ' : numéro manquant.');
        if (!Array.isArray(d.lines)) errors.push('Document #' + (i + 1) + ' : lignes manquantes.');
      });
    }
    if (data.counters && typeof data.counters !== 'object') errors.push('Compteurs invalides.');
    if (data.settings && typeof data.settings !== 'object') errors.push('Paramètres invalides.');
    return { ok: errors.length === 0, errors: errors.slice(0, 8), data: data };
  }

  /**
   * Restaure une sauvegarde validée. Les documents sont remplacés ; les compteurs
   * conservent la valeur la plus haute pour ne jamais réattribuer un numéro.
   */
  function importData(data) {
    var map = {};
    data.docs.forEach(function (d) { map[d.id] = d; });
    var counters = getCounters();
    Object.keys(data.counters || {}).forEach(function (k) {
      var v = Number(data.counters[k]) || 0;
      counters[k] = Math.max(counters[k] || 0, v);
    });
    write(KEYS.docs, map);
    write(KEYS.counters, counters);
    if (data.settings) write(KEYS.settings, withDefaults(data.settings, defaultSettings()));
  }

  App.store = {
    defaultSettings: defaultSettings,
    getSettings: getSettings,
    saveSettings: saveSettings,
    logoSrc: logoSrc,
    stampSrc: stampSrc,
    listDocs: listDocs,
    getDoc: getDoc,
    saveDoc: saveDoc,
    deleteDoc: deleteDoc,
    getCounters: getCounters,
    saveCounters: saveCounters,
    exportData: exportData,
    validateBackup: validateBackup,
    importData: importData
  };
})(window.App = window.App || {});
