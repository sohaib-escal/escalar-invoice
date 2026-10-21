/*
 * Remplissage automatique des coordonnées client depuis une image
 * (carte de visite, en-tête, bon de commande, attestation ICE, capture d'écran…)
 * via l'API Google Gemini, appelée directement depuis le navigateur avec la clé API de l'utilisateur.
 * L'image est envoyée à Google uniquement lorsque l'utilisateur la colle ou la dépose.
 */
(function (App) {
  'use strict';

  var API = 'https://generativelanguage.googleapis.com/v1beta';
  var DEFAULT_MODEL = 'gemini-2.5-flash';

  var PROMPT = [
    'Tu lis un document professionnel marocain (carte de visite, en-tête, bon de commande, attestation, signature e-mail, capture d’écran…).',
    'Extrais les coordonnées de la SOCIÉTÉ CLIENTE à qui l’on va adresser un devis ou une facture.',
    'Ignore totalement ESCALAR MEDIA et NFC Maroc : c’est l’émetteur, jamais le client.',
    'Règles : recopie exactement ce qui est écrit, sans rien inventer ; laisse une chaîne vide si une information est absente ou illisible.',
    'name : raison sociale ou nom commercial (avec la forme juridique si présente, ex. SARL). Si plusieurs noms, donne le nom légal suivi du nom commercial séparés par « — ».',
    'contact : personne à contacter, avec civilité si présente (ex. « Mme Laila LARBI ») ; ajoute sa fonction après une virgule si indiquée.',
    'address : adresse postale complète, une ligne par élément (rue, puis code postal et ville), séparées par « \\n ».',
    'phone : un seul numéro, de préférence fixe ou standard, tel qu’écrit. email : une seule adresse.',
    'ice : Identifiant Commun de l’Entreprise, 15 chiffres, sans espaces. if_number : Identifiant Fiscal. rc : registre du commerce avec la ville si indiquée.'
  ].join('\n');

  var SCHEMA = {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING' },
      contact: { type: 'STRING' },
      address: { type: 'STRING' },
      phone: { type: 'STRING' },
      email: { type: 'STRING' },
      ice: { type: 'STRING' },
      if_number: { type: 'STRING' },
      rc: { type: 'STRING' }
    },
    required: ['name', 'contact', 'address', 'phone', 'email', 'ice', 'if_number', 'rc']
  };

  function ExtractError(message, code) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function config() {
    var g = App.store.getSettings().gemini || {};
    return { key: (g.apiKey || '').trim(), model: (g.model || '').trim() || DEFAULT_MODEL };
  }

  function isConfigured() {
    return !!config().key;
  }

  /** Image -> JPEG base64 (côté le plus long ≤ 1600 px) pour un envoi rapide. */
  function prepareImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(ExtractError('Ce fichier n’est pas une image.', 'input'));
      if (file.size > 20 * 1024 * 1024) return reject(ExtractError('Image trop lourde (20 Mo maximum).', 'input'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); reject(ExtractError('Image illisible.', 'input')); };
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var dataUrl = c.toDataURL('image/jpeg', 0.88);
        resolve({ base64: dataUrl.split(',')[1], preview: dataUrl });
      };
      img.src = url;
    });
  }

  function request(path, key, options) {
    options = options || {};
    options.headers = Object.assign({ 'x-goog-api-key': key }, options.headers || {});
    return fetch(API + path, options).catch(function () {
      throw ExtractError('Connexion à l’API Google impossible. Vérifiez votre connexion Internet.', 'network');
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (res.ok) return body;
        var err = body.error || {};
        var msg = err.message || res.statusText;
        var reason = JSON.stringify(err.details || '');
        if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(msg + reason)) throw ExtractError('Clé API Google invalide. Vérifiez-la dans Paramètres.', 'key');
        if (res.status === 403) throw ExtractError('Accès refusé par Google : ' + msg + ' (API « Generative Language » activée ? restrictions de la clé ?)', 'forbidden');
        if (res.status === 404) throw ExtractError('Modèle introuvable : ' + msg, 'model');
        if (res.status === 429) throw ExtractError('Quota de l’API Google atteint. Réessayez dans un instant.', 'quota');
        throw ExtractError('Erreur de l’API Google (' + res.status + ') : ' + msg, 'api');
      });
    });
  }

  /** Modèles Gemini utilisables (generateContent), les « flash » récents en premier. */
  function listModels(key) {
    return request('/models?pageSize=200', key || config().key).then(function (body) {
      var models = (body.models || []).filter(function (m) {
        return (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1 &&
          /gemini/i.test(m.name) && !/(tts|image|live|audio|embedding|thinking|exp)/i.test(m.name);
      }).map(function (m) { return m.name.replace(/^models\//, ''); });
      function score(n) {
        var v = parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(n) || [0, 0])[1]);
        return v * 10 + (/flash/.test(n) ? 3 : 0) - (/lite/.test(n) ? 2 : 0) - (/preview/.test(n) ? 1 : 0);
      }
      return models.sort(function (a, b) { return score(b) - score(a); });
    });
  }

  function generate(model, key, base64) {
    return request('/models/' + encodeURIComponent(model) + ':generateContent', key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA }
      })
    }).then(function (body) {
      var cand = body.candidates && body.candidates[0];
      var text = cand && cand.content && cand.content.parts && cand.content.parts.map(function (p) { return p.text || ''; }).join('');
      if (!text) {
        var why = (body.promptFeedback && body.promptFeedback.blockReason) || (cand && cand.finishReason) || 'réponse vide';
        throw ExtractError('Google n’a pas pu analyser l’image (' + why + ').', 'empty');
      }
      try { return JSON.parse(text); } catch (e) { throw ExtractError('Réponse de Google illisible.', 'api'); }
    });
  }

  /** Nettoie la réponse et la convertit en champs client. */
  function toClientFields(r) {
    function clean(v) { return String(v || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim(); }
    var ice = clean(r.ice).replace(/\s/g, '');
    var ids = [];
    if (ice) ids.push('ICE : ' + ice);
    if (clean(r.if_number)) ids.push('IF : ' + clean(r.if_number));
    var address = clean(r.address).split(/\\n|\n/).map(function (l) { return l.trim(); }).filter(Boolean).join('\n');
    return {
      name: clean(r.name),
      contact: clean(r.contact),
      address: address,
      phone: clean(r.phone),
      email: clean(r.email).toLowerCase(),
      ice: ids.join(' · ')
    };
  }

  /**
   * Analyse une image et renvoie { fields, preview, model }.
   * Si le modèle configuré n'existe plus, choisit automatiquement le meilleur modèle disponible.
   */
  function extractClient(file) {
    var cfg = config();
    if (!cfg.key) return Promise.reject(ExtractError('Ajoutez votre clé API Google (Gemini) dans Paramètres pour remplir automatiquement depuis une image.', 'config'));
    return prepareImage(file).then(function (img) {
      return generate(cfg.model, cfg.key, img.base64).then(function (r) {
        return { result: r, model: cfg.model };
      }, function (err) {
        if (err.code !== 'model') throw err;
        return listModels(cfg.key).then(function (models) {
          if (!models.length) throw err;
          var s = App.store.getSettings();
          s.gemini.model = models[0];
          App.store.saveSettings(s);
          return generate(models[0], cfg.key, img.base64).then(function (r) { return { result: r, model: models[0] }; });
        });
      }).then(function (out) {
        return { fields: toClientFields(out.result), preview: img.preview, model: out.model };
      });
    });
  }

  App.extract = {
    DEFAULT_MODEL: DEFAULT_MODEL,
    isConfigured: isConfigured,
    listModels: listModels,
    extractClient: extractClient,
    toClientFields: toClientFields
  };
})(window.App = window.App || {});
