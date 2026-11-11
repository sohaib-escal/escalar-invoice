/*
 * Client Supabase : initialisation, gestion de la configuration URL/Clé
 * et état de connexion.
 */
(function (App) {
  'use strict';

  var CONFIG_KEY = 'ef.supabase.config.v1';

  // Configuration par défaut de l'application
  var DEFAULT_CONFIG = {
    url: 'https://ptyvutcfggrrxbrovvkj.supabase.co',
    anonKey: 'sb_publishable_HsSZvCHlrj2nMxTfOArwTw_TrmIu5MR'
  };

  var clientInstance = null;

  function loadConfig() {
    // 1. Vérifier si des variables globales existent
    if (typeof window !== 'undefined' && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) {
      return {
        url: String(window.SUPABASE_CONFIG.url).trim(),
        anonKey: String(window.SUPABASE_CONFIG.anonKey || '').trim()
      };
    }
    // 2. Vérifier dans localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        var raw = localStorage.getItem(CONFIG_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.url) {
            return {
              url: String(parsed.url).trim(),
              anonKey: String(parsed.anonKey || '').trim()
            };
          }
        }
      } catch (e) {
        console.warn('Erreur lecture config Supabase', e);
      }
    }
    // 3. Fallback sur DEFAULT_CONFIG
    return DEFAULT_CONFIG;
  }

  function saveConfig(url, anonKey) {
    var cfg = {
      url: String(url || '').trim(),
      anonKey: String(anonKey || '').trim()
    };
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
      } catch (e) {
        console.error('Erreur sauvegarde config Supabase', e);
      }
    }
    clientInstance = null;
    return init();
  }

  function isConfigured() {
    var cfg = loadConfig();
    return !!(cfg.url && cfg.anonKey && cfg.url.indexOf('supabase.co') !== -1);
  }

  function init() {
    var cfg = loadConfig();
    if (!cfg.url || !cfg.anonKey) {
      clientInstance = null;
      return null;
    }

    if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        clientInstance = window.supabase.createClient(cfg.url, cfg.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        return clientInstance;
      } catch (err) {
        console.error('Échec initialisation client Supabase:', err);
        clientInstance = null;
        return null;
      }
    }
    return null;
  }

  function getClient() {
    if (!clientInstance) {
      init();
    }
    return clientInstance;
  }

  App.supabaseClient = {
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    isConfigured: isConfigured,
    init: init,
    getClient: getClient
  };
})(typeof window !== 'undefined' ? (window.App = window.App || {}) : (typeof global !== 'undefined' ? (global.window = global.window || {}, global.window.App = global.window.App || {}) : {}));

