/*
 * Persistance des données : Couche d'adaptation Supabase (PostgreSQL) + cache local.
 * Gère les documents, les lignes, les clients, les paramètres et les sauvegardes.
 */
(function (App) {
  'use strict';

  var KEYS = {
    docs: 'ef.docs.v1',
    settings: 'ef.settings.v1',
    counters: 'ef.counters.v1'
  };
  var BACKUP_APP_ID = 'escalar-facturation';
  var BACKUP_VERSION = 2;

  // Cache en mémoire pour performance et compatibilité synchrone
  var memoryDocsMap = null;
  var memorySettings = null;

  function getClient() {
    return App.supabaseClient ? App.supabaseClient.getClient() : null;
  }

  function isConnected() {
    return !!(getClient() && App.auth && App.auth.isAuthenticated());
  }

  function defaultDesignations() {
    return [
      {
        id: 'des_nfc_card',
        title: 'Cartes de visite NFC personnalisées',
        description: 'Fourniture de cartes de visite connectées avec puce NFC intégrée\nImpression quadri recto/verso haute définition\nConfiguration du profil numérique NFC Maroc et QR code de secours inclus',
        price: '120',
        qty: '10',
        taxRate: 20
      },
      {
        id: 'des_google_review',
        title: 'Plaque connectée Google Avis NFC',
        description: 'Support de comptoir en plexiglas premium avec puce NFC & QR code\nLien direct vers votre fiche Google My Business pour collecte d’avis clients\nFormat compact, résistant aux UV et aux rayures',
        price: '350',
        qty: '1',
        taxRate: 20
      },
      {
        id: 'des_graphism',
        title: 'Création graphique & Maquette BAT',
        description: 'Conception graphique personnalisée selon votre charte\nDéclinaison des éléments visuels et préparation des fichiers d’impression haute définition',
        price: '250',
        qty: '1',
        taxRate: 20
      },
      {
        id: 'des_subscription',
        title: 'Abonnement annuel plateforme NFC Maroc',
        description: 'Hébergement du profil dynamique, modification illimitée des coordonnées et accès aux statistiques de scans en temps réel',
        price: '300',
        qty: '1',
        taxRate: 20
      },
      {
        id: 'des_delivery',
        title: 'Frais de livraison express',
        description: 'Expédition sécurisée et livraison express à l’adresse convenue partout au Maroc',
        price: '50',
        qty: '1',
        taxRate: 20
      }
    ];
  }

  function defaultQuickTexts() {
    return {
      paymentTermsDevis: [
        '50 % à la commande, solde à la livraison',
        'Paiement comptant à la livraison',
        '100 % à la commande',
        'Virement bancaire sous 15 jours'
      ],
      paymentTermsFacture: [
        'Paiement à réception de facture',
        'Paiement à 30 jours fin de mois',
        'Paiement comptant',
        'Virement bancaire'
      ],
      conditionsDevis: [
        'Prix fermes et non révisables pendant toute la durée de validité de l’offre',
        'Délai de livraison : 5 à 7 jours ouvrables après validation du BAT',
        'Garantie de bon fonctionnement des puces NFC : 1 an',
        'Validation obligatoire du Bon à Tirer (BAT) avant production'
      ],
      conditionsFacture: [
        'Pénalités de retard applicables conformément à la législation en vigueur',
        'Escompte pour paiement anticipé : néant'
      ],
      subjects: [
        'Fourniture de cartes de visite NFC personnalisées',
        'Fourniture de plaques connectées Google Avis NFC',
        'Création de supports connectés NFC & solutions digitales',
        'Abonnement annuel plateforme NFC Maroc'
      ]
    };
  }

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
      logo: null,
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
      gemini: { apiKey: '', model: 'gemini-2.5-flash' },
      designations: defaultDesignations(),
      quickTexts: defaultQuickTexts()
    };
  }

  function readLocal(key, fallback) {
    if (typeof localStorage === 'undefined') return fallback;
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Erreur écriture locale:', e);
    }
  }

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
    if (memorySettings) return memorySettings;
    var s = withDefaults(readLocal(KEYS.settings, {}), defaultSettings());
    if (!Array.isArray(s.designations) || s.designations.length === 0) s.designations = defaultDesignations();
    if (!s.quickTexts || typeof s.quickTexts !== 'object') s.quickTexts = defaultQuickTexts();
    memorySettings = s;
    return s;
  }

  async function fetchSettings() {
    var sb = getClient();
    if (!sb) return getSettings();

    try {
      var { data, error } = await sb.from('app_settings').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        var merged = defaultSettings();
        data.forEach(function (row) {
          if (row.key === 'company') merged.company = Object.assign({}, merged.company, row.value);
          else if (row.key === 'defaults') merged.defaults = Object.assign({}, merged.defaults, row.value);
          else if (row.key === 'numbering') merged.numbering = Object.assign({}, merged.numbering, row.value);
          else if (row.key === 'drive') merged.drive = Object.assign({}, merged.drive, row.value);
          else if (row.key === 'gemini') merged.gemini = Object.assign({}, merged.gemini, row.value);
          else if (row.key === 'designations' && Array.isArray(row.value)) merged.designations = row.value;
          else if (row.key === 'quickTexts' && typeof row.value === 'object') merged.quickTexts = row.value;
          else if (row.key === 'branding') {
            if (row.value.logo !== undefined) merged.logo = row.value.logo;
            if (row.value.stampImage !== undefined) merged.stampImage = row.value.stampImage;
          }
        });
        memorySettings = merged;
        writeLocal(KEYS.settings, merged);
        return merged;
      }
    } catch (e) {
      console.warn('Lecture settings DB échouée, fallback local:', e);
    }
    return getSettings();
  }

  async function saveSettings(settings) {
    memorySettings = settings;
    writeLocal(KEYS.settings, settings);

    var sb = getClient();
    if (!sb || !App.auth.isAdmin()) return;

    try {
      var entries = [
        { key: 'company', value: settings.company },
        { key: 'defaults', value: settings.defaults },
        { key: 'numbering', value: settings.numbering },
        { key: 'drive', value: settings.drive },
        { key: 'gemini', value: settings.gemini },
        { key: 'designations', value: settings.designations },
        { key: 'quickTexts', value: settings.quickTexts },
        { key: 'branding', value: { logo: settings.logo, stampImage: settings.stampImage } }
      ];

      for (var i = 0; i < entries.length; i++) {
        await sb.from('app_settings').upsert({
          key: entries[i].key,
          value: entries[i].value,
          updated_at: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Erreur sauvegarde settings Supabase:', err);
      throw new Error('Paramètres enregistrés localement, mais échec de synchronisation avec la base de données : ' + err.message);
    }
  }

  function logoSrc(settings) {
    settings = settings || getSettings();
    return settings.logo === null ? (typeof window !== 'undefined' ? window.APP_DEFAULT_LOGO || '' : '') : settings.logo;
  }

  function stampSrc(settings) {
    settings = settings || getSettings();
    return settings.stampImage === null ? (typeof window !== 'undefined' ? window.APP_DEFAULT_STAMP || '' : '') : settings.stampImage;
  }

  /* ---- Conversion Document DB <-> Frontend ---- */

  function mapDbDocToFrontend(row) {
    if (!row) return null;
    var clientObj = {
      name: '',
      contact: '',
      address: '',
      email: '',
      phone: '',
      ice: ''
    };

    if (row.clients) {
      clientObj.name = row.clients.name || '';
      clientObj.contact = row.clients.contact || '';
      clientObj.address = row.clients.address || '';
      clientObj.email = row.clients.email || '';
      clientObj.phone = row.clients.phone || '';
      clientObj.ice = row.clients.ice || '';
    }

    var lines = (row.document_lines || []).slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    }).map(function (l) {
      return {
        id: l.id,
        description: l.description || '',
        qty: String(l.qty || ''),
        price: String(l.price || ''),
        discount: String(l.discount || ''),
        taxRate: Number(l.tax_rate != null ? l.tax_rate : 20)
      };
    });

    if (!lines.length) {
      lines = [App.documents ? App.documents.newLine() : { description: '', qty: '1', price: '', discount: '', taxRate: 20 }];
    }

    return {
      id: row.id,
      type: row.type,
      number: row.number,
      numberAuto: false,
      saved: true,
      status: row.status,
      issueDate: row.issue_date,
      validUntil: row.valid_until || '',
      dueDate: row.due_date || '',
      deliveryTime: row.delivery_time || '',
      paymentMethod: row.payment_method || '',
      paymentRef: row.payment_ref || '',
      paymentTerms: row.payment_terms || '',
      sourceRef: row.source_ref || '',
      clientId: row.client_id,
      client: clientObj,
      subject: row.subject || '',
      lines: lines,
      globalDiscount: row.global_discount || { type: 'percent', value: '' },
      notesTitle: row.notes_title || 'Notes',
      notes: row.notes || '',
      conditions: row.conditions || '',
      showSignature: row.show_signature !== false,
      showAcceptance: !!row.show_acceptance,
      showStamp: row.show_stamp !== false,
      drive: row.drive_info || null,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      creator: row.profiles ? {
        id: row.profiles.id,
        email: row.profiles.email,
        fullName: row.profiles.full_name || row.profiles.email
      } : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /* ---- Documents ---- */

  function getDocsMap() {
    if (memoryDocsMap) return memoryDocsMap;
    memoryDocsMap = readLocal(KEYS.docs, {}) || {};
    return memoryDocsMap;
  }

  function listDocs() {
    var map = getDocsMap();
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function getDoc(id) {
    return getDocsMap()[id] || null;
  }

  /**
   * Chargement asynchrone de tous les documents accessibles (via RLS)
   */
  async function fetchDocs(filterOptions) {
    var sb = getClient();
    if (!sb || !App.auth.isAuthenticated()) {
      return listDocs();
    }

    try {
      var query = sb.from('documents').select(`
        *,
        clients (id, name, contact, address, email, phone, ice),
        profiles!documents_created_by_fkey (id, email, full_name, role),
        document_lines (*)
      `).order('issue_date', { ascending: false }).order('created_at', { ascending: false });

      if (filterOptions) {
        if (filterOptions.type && filterOptions.type !== 'all') {
          query = query.eq('type', filterOptions.type);
        }
        if (filterOptions.status) {
          query = query.eq('status', filterOptions.status);
        }
        if (filterOptions.createdBy) {
          query = query.eq('created_by', filterOptions.createdBy);
        }
      }

      var { data, error } = await query;
      if (error) throw error;

      var mapped = (data || []).map(mapDbDocToFrontend);
      var newMap = {};
      mapped.forEach(function (d) { newMap[d.id] = d; });
      memoryDocsMap = newMap;
      writeLocal(KEYS.docs, newMap);
      return mapped;
    } catch (e) {
      console.warn('fetchDocs échoué, utilisation du cache local:', e);
      return listDocs();
    }
  }

  /**
   * Chargement asynchrone d'un document complet avec ses lignes et son client
   */
  async function fetchDoc(id) {
    var sb = getClient();
    if (!sb || !App.auth.isAuthenticated()) {
      return getDoc(id);
    }

    try {
      var { data, error } = await sb.from('documents').select(`
        *,
        clients (id, name, contact, address, email, phone, ice),
        profiles!documents_created_by_fkey (id, email, full_name, role),
        document_lines (*)
      `).eq('id', id).single();

      if (error) throw error;
      var doc = mapDbDocToFrontend(data);
      if (doc) {
        var map = getDocsMap();
        map[doc.id] = doc;
        writeLocal(KEYS.docs, map);
      }
      return doc;
    } catch (e) {
      console.warn('fetchDoc échoué pour id ' + id + ', fallback cache:', e);
      return getDoc(id);
    }
  }

  /**
   * Enregistrement complet en base de données Supabase
   */
  async function saveDocAsync(doc) {
    var sb = getClient();
    var user = App.auth.getUser();

    doc.updatedAt = new Date().toISOString();
    if (!doc.createdAt) doc.createdAt = doc.updatedAt;

    // Mise à jour immédiate du cache local pour réactivité instantanée
    var map = getDocsMap();
    map[doc.id] = doc;
    writeLocal(KEYS.docs, map);

    if (!sb || !user) {
      return doc;
    }

    try {
      // 1. Sauvegarde ou mise à jour du client
      var clientId = doc.clientId || null;
      var clientName = (doc.client && doc.client.name) ? doc.client.name.trim() : '';

      if (clientName) {
        var clientPayload = {
          name: clientName,
          contact: (doc.client && doc.client.contact) || '',
          address: (doc.client && doc.client.address) || '',
          email: (doc.client && doc.client.email) || '',
          phone: (doc.client && doc.client.phone) || '',
          ice: (doc.client && doc.client.ice) || '',
          updated_at: new Date().toISOString()
        };

        if (clientId) {
          await sb.from('clients').update(clientPayload).eq('id', clientId);
        } else {
          // Recherche d'un client existant par ICE ou Nom
          var existingClientQuery = sb.from('clients').select('id');
          if (clientPayload.ice) {
            existingClientQuery = existingClientQuery.eq('ice', clientPayload.ice);
          } else {
            existingClientQuery = existingClientQuery.ilike('name', clientName);
          }
          var { data: existingClients } = await existingClientQuery.limit(1);

          if (existingClients && existingClients.length > 0) {
            clientId = existingClients[0].id;
            await sb.from('clients').update(clientPayload).eq('id', clientId);
          } else {
            clientPayload.created_by = user.id;
            var { data: newClient, error: clientErr } = await sb.from('clients').insert(clientPayload).select('id').single();
            if (!clientErr && newClient) {
              clientId = newClient.id;
            }
          }
        }
        doc.clientId = clientId;
      }

      // 2. Préparation du document
      var docPayload = {
        id: doc.id,
        type: doc.type,
        number: String(doc.number).trim(),
        status: doc.status || 'brouillon',
        issue_date: doc.issueDate,
        valid_until: doc.validUntil || null,
        due_date: doc.dueDate || null,
        delivery_time: doc.deliveryTime || '',
        payment_method: doc.paymentMethod || '',
        payment_ref: doc.paymentRef || '',
        payment_terms: doc.paymentTerms || '',
        source_ref: doc.sourceRef || '',
        client_id: clientId,
        subject: doc.subject || '',
        global_discount: doc.globalDiscount || { type: 'percent', value: '' },
        notes_title: doc.notesTitle || 'Notes',
        notes: doc.notes || '',
        conditions: doc.conditions || '',
        show_signature: doc.showSignature !== false,
        show_acceptance: !!doc.showAcceptance,
        show_stamp: doc.showStamp !== false,
        drive_info: doc.drive || null,
        updated_by: user.id,
        updated_at: doc.updatedAt
      };

      // Si création
      var { data: existingDoc } = await sb.from('documents').select('id, created_by').eq('id', doc.id).maybeSingle();
      if (!existingDoc) {
        docPayload.created_by = user.id;
        docPayload.created_at = doc.createdAt;
        var { error: insDocErr } = await sb.from('documents').insert(docPayload);
        if (insDocErr) throw insDocErr;
      } else {
        var { error: upDocErr } = await sb.from('documents').update(docPayload).eq('id', doc.id);
        if (upDocErr) throw upDocErr;
      }

      // 3. Sauvegarde des lignes (remplacement complet)
      await sb.from('document_lines').delete().eq('document_id', doc.id);
      var linesToInsert = (doc.lines || []).map(function (l, idx) {
        return {
          document_id: doc.id,
          sort_order: idx,
          description: l.description || '',
          qty: String(l.qty || ''),
          price: String(l.price || ''),
          discount: String(l.discount || ''),
          tax_rate: Number(l.taxRate != null ? l.taxRate : 20)
        };
      });

      if (linesToInsert.length > 0) {
        var { error: linesErr } = await sb.from('document_lines').insert(linesToInsert);
        if (linesErr) console.warn('Erreur insertion document_lines:', linesErr);
      }

      // Trace audit
      sb.from('audit_log').insert({
        user_id: user.id,
        action: existingDoc ? 'document_updated' : 'document_created',
        entity_type: 'document',
        entity_id: doc.id,
        details: { number: doc.number, type: doc.type, client: clientName }
      }).then(null, function () {});

    } catch (err) {
      console.error('Erreur persistence Supabase saveDoc:', err);
      throw new Error('Erreur base de données : ' + (err.message || 'Impossible d’enregistrer le document'));
    }

    return doc;
  }

  function saveDoc(doc) {
    // Version synchrone pour compatibilité immédiate avec les gestionnaires existants
    var map = getDocsMap();
    doc.updatedAt = new Date().toISOString();
    if (!doc.createdAt) doc.createdAt = doc.updatedAt;
    map[doc.id] = doc;
    writeLocal(KEYS.docs, map);

    // Déclenchement asynchrone vers Supabase
    if (isConnected()) {
      saveDocAsync(doc).catch(function (e) {
        console.error('Échec sauvegarde asynchrone Supabase:', e);
      });
    }
    return doc;
  }

  async function deleteDocAsync(id) {
    var map = getDocsMap();
    var doc = map[id];
    delete map[id];
    writeLocal(KEYS.docs, map);

    var sb = getClient();
    var user = App.auth.getUser();
    if (sb && user) {
      var { error } = await sb.from('documents').delete().eq('id', id);
      if (error) throw error;

      if (doc) {
        sb.from('audit_log').insert({
          user_id: user.id,
          action: 'document_deleted',
          entity_type: 'document',
          entity_id: id,
          details: { number: doc.number, type: doc.type }
        }).then(null, function () {});
      }
    }
  }

  function deleteDoc(id) {
    var map = getDocsMap();
    delete map[id];
    writeLocal(KEYS.docs, map);

    if (isConnected()) {
      deleteDocAsync(id).catch(function (e) {
        console.error('Erreur suppression asynchrone:', e);
      });
    }
  }

  /* ---- Compteurs de numérotation ---- */

  function getCounters() {
    return readLocal(KEYS.counters, {}) || {};
  }

  function saveCounters(c) {
    writeLocal(KEYS.counters, c);
  }

  /* ---- Export & Import de sauvegarde ---- */

  function exportData() {
    return {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      docs: listDocs(),
      counters: getCounters(),
      settings: getSettings(),
      user: App.auth.getUser()
    };
  }

  function validateBackup(data) {
    var errors = [];
    if (!data || typeof data !== 'object') return { ok: false, errors: ['Fichier illisible ou vide.'] };
    if (data.app !== BACKUP_APP_ID) errors.push('Ce fichier n’est pas une sauvegarde de cette application.');
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
    return { ok: errors.length === 0, errors: errors.slice(0, 8), data: data };
  }

  async function importDataToDatabase(data) {
    var sb = getClient();
    var user = App.auth.getUser();
    if (!sb || !user) {
      throw new Error('Vous devez être connecté pour importer des données dans la base de données.');
    }

    var docs = data.docs || [];
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      await saveDocAsync(d);
    }

    if (data.settings && App.auth.isAdmin()) {
      await saveSettings(data.settings);
    }
  }

  function importData(data) {
    var map = {};
    (data.docs || []).forEach(function (d) { map[d.id] = d; });
    var counters = getCounters();
    Object.keys(data.counters || {}).forEach(function (k) {
      var v = Number(data.counters[k]) || 0;
      counters[k] = Math.max(counters[k] || 0, v);
    });

    writeLocal(KEYS.docs, map);
    writeLocal(KEYS.counters, counters);
    if (data.settings) writeLocal(KEYS.settings, withDefaults(data.settings, defaultSettings()));

    if (isConnected()) {
      importDataToDatabase(data).catch(function (e) {
        console.error('Import Supabase en arrière-plan:', e);
      });
    }
  }

  App.store = {
    defaultSettings: defaultSettings,
    defaultDesignations: defaultDesignations,
    defaultQuickTexts: defaultQuickTexts,
    getSettings: getSettings,
    fetchSettings: fetchSettings,
    saveSettings: saveSettings,
    logoSrc: logoSrc,
    stampSrc: stampSrc,
    listDocs: listDocs,
    getDoc: getDoc,
    fetchDocs: fetchDocs,
    fetchDoc: fetchDoc,
    saveDoc: saveDoc,
    saveDocAsync: saveDocAsync,
    deleteDoc: deleteDoc,
    deleteDocAsync: deleteDocAsync,
    getCounters: getCounters,
    saveCounters: saveCounters,
    exportData: exportData,
    validateBackup: validateBackup,
    importData: importData,
    importDataToDatabase: importDataToDatabase
  };
})(typeof window !== 'undefined' ? (window.App = window.App || {}) : (typeof global !== 'undefined' ? (global.window = global.window || {}, global.window.App = global.window.App || {}) : {}));
