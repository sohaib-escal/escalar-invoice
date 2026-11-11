/*
 * Envoi des PDF vers Google Drive, 100 % navigateur :
 * - autorisation OAuth via Google Identity Services (modèle « token », sans secret client) ;
 * - dossier racine configurable (par défaut "escalarmedia") ;
 * - classement automatique par semestre (ex: escalarmedia / S2 2026 / Factures) ;
 * - persistance du jeton de session dans sessionStorage (~1h) pour l'export automatique continu.
 */
(function (App) {
  'use strict';

  var SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive';
  var GIS_SRC = 'https://accounts.google.com/gsi/client';
  var API = 'https://www.googleapis.com/drive/v3';
  var UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  var FOLDER_MIME = 'application/vnd.google-apps.folder';
  var ROOT_NAME = 'escalarmedia';
  var SUB_NAMES = { devis: 'Devis', facture: 'Factures' };
  var TOKEN_STORAGE_KEY = 'escalar_drive_session_token';

  var token = null;        // { value, expiresAt }
  var tokenClient = null;
  var tokenClientId = null;
  var gisPromise = null;
  var pending = null;      // { resolve, reject } de la demande de jeton en cours

  function DriveError(message, code) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function clientId() {
    return (App.store.getSettings().drive.clientId || '').trim();
  }

  function isConfigured() {
    return !!clientId();
  }

  /** OAuth Google exige une origine http(s) autorisée : impossible depuis file://. */
  function originSupported() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  function getStoredToken() {
    try {
      var raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && data.value && data.expiresAt > Date.now() + 60000) {
        return data;
      }
    } catch (e) {}
    return null;
  }

  function saveStoredToken(t) {
    try {
      if (t) sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(t));
      else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (e) {}
  }

  function isConnected() {
    if (token && token.expiresAt > Date.now() + 60000) return true;
    var stored = getStoredToken();
    if (stored) {
      token = stored;
      return true;
    }
    return false;
  }

  /** Calcule l'étiquette du semestre selon la date (ex: "S2 2026") */
  function getSemesterName(dateStr) {
    var d = (dateStr || '').trim();
    var year = d.slice(0, 4);
    if (!/^\d{4}$/.test(year)) year = String(new Date().getFullYear());
    var m = parseInt(d.slice(5, 7), 10);
    if (isNaN(m) || m < 1 || m > 12) m = new Date().getMonth() + 1;
    var s = m <= 6 ? 'S1' : 'S2';
    return s + ' ' + year;
  }

  function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        gisPromise = null;
        reject(DriveError('Impossible de charger le service de connexion Google. Vérifiez votre connexion Internet.', 'network'));
      };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  /** À appeler à l'ouverture de l'éditeur pour que le clic sur « Drive » ouvre la fenêtre Google sans délai. */
  function preload() {
    if (isConfigured() && originSupported()) loadGis().then(ensureTokenClient).catch(function () { /* signalé au clic */ });
  }

  function ensureTokenClient() {
    var id = clientId();
    if (tokenClient && tokenClientId === id) return tokenClient;
    tokenClientId = id;
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPE,
      callback: function (resp) {
        var p = pending; pending = null;
        if (!p) return;
        if (resp.error) {
          p.reject(DriveError(resp.error === 'access_denied'
            ? 'Autorisation Google Drive refusée.'
            : 'Autorisation Google impossible (' + resp.error + ').', 'denied'));
          return;
        }
        var okScope = true;
        if (window.google.accounts.oauth2.hasGrantedAnyScope) {
          okScope = window.google.accounts.oauth2.hasGrantedAnyScope(
            resp,
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/drive.file'
          );
        }
        if (!okScope) {
          p.reject(DriveError('L’accès à Google Drive n’a pas été accordé. Cochez l’autorisation Drive lors de la connexion.', 'denied'));
          return;
        }
        token = { value: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
        saveStoredToken(token);
        p.resolve(token.value);
      },
      error_callback: function (err) {
        var p = pending; pending = null;
        if (!p) return;
        var type = err && err.type;
        p.reject(DriveError(type === 'popup_closed'
          ? 'Fenêtre de connexion Google fermée avant la fin.'
          : type === 'popup_failed_to_open'
            ? 'La fenêtre de connexion Google a été bloquée. Autorisez les fenêtres pop-up pour ce site puis réessayez.'
            : 'Connexion Google interrompue.', 'denied'));
      }
    });
    return tokenClient;
  }

  /**
   * Obtient un jeton. Doit être appelé directement dans le gestionnaire de clic
   * (avant toute opération asynchrone) pour que la fenêtre Google ne soit pas bloquée.
   */
  function getToken(forcePrompt) {
    if (!isConfigured()) return Promise.reject(DriveError('Google Drive n’est pas configuré (Paramètres → Google Drive).', 'config'));
    if (!originSupported()) return Promise.reject(DriveError('Google Drive nécessite une connexion https (ex: https://invoice.escalarmedia.ma).', 'origin'));
    if (!forcePrompt && isConnected()) return Promise.resolve(token.value);
    function request() {
      return new Promise(function (resolve, reject) {
        if (pending) pending.reject(DriveError('Demande remplacée.', 'denied'));
        pending = { resolve: resolve, reject: reject };
        ensureTokenClient().requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
      });
    }
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return request();
    return loadGis().then(request);
  }

  function disconnect() {
    if (token && window.google && window.google.accounts) {
      try { window.google.accounts.oauth2.revoke(token.value, function () {}); } catch (e) { /* ignore */ }
    }
    token = null;
    saveStoredToken(null);
  }

  /** Appel REST avec gestion des erreurs courantes. */
  function api(url, options) {
    if (!isConnected()) return Promise.reject(DriveError('Session Google expirée. Reconnectez-vous à Google Drive.', 'expired'));
    options = options || {};
    options.headers = Object.assign({ Authorization: 'Bearer ' + token.value }, options.headers || {});
    return fetch(url, options).catch(function () {
      throw DriveError('Connexion à Google Drive impossible. Vérifiez votre connexion Internet.', 'network');
    }).then(function (res) {
      if (res.ok) return res.status === 204 ? null : res.json();
      return res.json().catch(function () { return {}; }).then(function (body) {
        var msg = body && body.error && body.error.message ? body.error.message : res.statusText;
        if (res.status === 401) { token = null; saveStoredToken(null); throw DriveError('Session Google expirée. Cliquez à nouveau pour vous reconnecter.', 'expired'); }
        if (res.status === 403) throw DriveError('Accès refusé par Google Drive : ' + msg, 'forbidden');
        if (res.status === 404) throw DriveError('Élément introuvable sur Google Drive.', 'notfound');
        throw DriveError('Erreur Google Drive (' + res.status + ') : ' + msg, 'api');
      });
    });
  }

  function q(s) {
    return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }

  function listFiles(query, fields) {
    return api(API + '/files?' + new URLSearchParams({
      q: query, fields: 'files(' + (fields || 'id,name') + ')', pageSize: '100', spaces: 'drive'
    }));
  }

  /** Vérifie qu'un dossier mémorisé existe encore (non supprimé). */
  function folderAlive(id) {
    if (!id) return Promise.resolve(false);
    return api(API + '/files/' + encodeURIComponent(id) + '?fields=id,trashed,mimeType')
      .then(function (f) { return f && !f.trashed && f.mimeType === FOLDER_MIME; })
      .catch(function (e) { if (e.code === 'notfound') return false; throw e; });
  }

  function findOrCreateFolder(name, parentId) {
    var query = 'name = ' + q(name) + " and mimeType = '" + FOLDER_MIME + "' and trashed = false" +
      (parentId ? ' and ' + q(parentId) + ' in parents' : " and 'root' in parents");
    return listFiles(query).then(function (r) {
      if (r.files && r.files.length) return r.files[0].id;
      return api(API + '/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined })
      }).then(function (f) { return f.id; });
    });
  }

  /** Recherche ou crée le dossier racine 'escalarmedia' */
  function findOrCreateRootFolder() {
    var settings = App.store.getSettings();
    var cached = settings.drive && settings.drive.rootFolderId;
    return folderAlive(cached).then(function (ok) {
      if (ok) return cached;
      // Chercher n'importe quel dossier existant correspondant à "escalarmedia" (toute casse)
      var query = "mimeType = '" + FOLDER_MIME + "' and trashed = false and " +
        "(name = 'escalarmedia' or name = 'EscalarMedia' or name = 'ESCALARMEDIA' or name = 'escalar media' or name = 'Escalar Media' or name = 'Facturation ESCALAR MEDIA')";
      return listFiles(query).then(function (r) {
        if (r.files && r.files.length) {
          var foundId = r.files[0].id;
          persistRootFolderId(foundId);
          return foundId;
        }
        return api(API + '/files?fields=id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: ROOT_NAME, mimeType: FOLDER_MIME })
        }).then(function (f) {
          persistRootFolderId(f.id);
          return f.id;
        });
      });
    });
  }

  function persistRootFolderId(id) {
    try {
      var fresh = App.store.getSettings();
      fresh.drive = fresh.drive || {};
      fresh.drive.rootFolderId = id;
      App.store.saveSettings(fresh);
    } catch (e) {}
  }

  /**
   * Crée si besoin l'arborescence :
   * escalarmedia
   *   └── S1 2026 (ou S2 2026)
   *         ├── Devis
   *         └── Factures
   */
  function ensureFolder(type, issueDate) {
    var semester = getSemesterName(issueDate);
    var subName = SUB_NAMES[type] || (type === 'facture' ? 'Factures' : 'Devis');

    return findOrCreateRootFolder().then(function (rootId) {
      return findOrCreateFolder(semester, rootId).then(function (semesterFolderId) {
        return findOrCreateFolder(subName, semesterFolderId);
      });
    });
  }

  /** Nom libre dans le dossier : DEVIS_X_Client.pdf, puis DEVIS_X_Client_v2.pdf, … (jamais d'écrasement). */
  function uniqueName(folderId, fileName) {
    var base = fileName.replace(/\.pdf$/i, '');
    return listFiles(q(folderId) + ' in parents and trashed = false and name contains ' + q(base)).then(function (r) {
      var taken = {};
      (r.files || []).forEach(function (f) { taken[f.name.toLowerCase()] = true; });
      if (!taken[fileName.toLowerCase()]) return fileName;
      for (var i = 2; i < 1000; i++) {
        var n = base + '_v' + i + '.pdf';
        if (!taken[n.toLowerCase()]) return n;
      }
      return base + '_' + Date.now() + '.pdf';
    });
  }

  function uploadPdf(blob, fileName, folderId) {
    var boundary = 'escalar' + Math.random().toString(36).slice(2);
    var meta = { name: fileName, mimeType: 'application/pdf', parents: [folderId] };
    var body = new Blob([
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n',
      '--' + boundary + '\r\nContent-Type: application/pdf\r\n\r\n', blob, '\r\n--' + boundary + '--'
    ]);
    return api(UPLOAD + '?uploadType=multipart&fields=id,name,webViewLink,size', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    });
  }

  /**
   * Flux complet. `tokenPromise` provient de getToken() appelé dans le clic ou de la session active.
   * Ne résout qu'après confirmation de Google Drive (fichier créé avec un identifiant).
   */
  function saveDocument(doc, tokenPromise) {
    var folderId;
    var issueDate = doc.issueDate || doc.date || (new Date().toISOString().slice(0, 10));
    var p = tokenPromise || (isConnected() ? Promise.resolve(token.value) : getToken());
    return p
      .then(function () { return ensureFolder(doc.type, issueDate); })
      .then(function (id) { folderId = id; return App.pdf.toBlob(doc); })
      .then(function (r) {
        return uniqueName(folderId, r.fileName).then(function (name) { return uploadPdf(r.blob, name, folderId); });
      })
      .then(function (file) {
        if (!file || !file.id) throw DriveError('Google Drive n’a pas confirmé l’envoi.', 'api');
        return file;
      });
  }

  App.drive = {
    isConfigured: isConfigured,
    originSupported: originSupported,
    isConnected: isConnected,
    preload: preload,
    getToken: getToken,
    disconnect: disconnect,
    ensureFolder: ensureFolder,
    saveDocument: saveDocument,
    getSemesterName: getSemesterName,
    findOrCreateRootFolder: findOrCreateRootFolder,
    ROOT_NAME: ROOT_NAME
  };
})(window.App = window.App || {});
