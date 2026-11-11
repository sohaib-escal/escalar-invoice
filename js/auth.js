/*
 * Authentification multi-utilisateur avec Supabase Auth & Row Level Security.
 * Gère les rôles : 'super_admin' (propriétaire) vs 'member' (équipe/invité).
 */
(function (App) {
  'use strict';

  var PROFILE_CACHE_KEY = 'ef.profile.cache.v2';
  var currentProfile = null;
  var authListeners = [];

  function getClient() {
    return App.supabaseClient ? App.supabaseClient.getClient() : null;
  }

  function isConfigured() {
    return App.supabaseClient ? App.supabaseClient.isConfigured() : false;
  }

  /** Profil en mémoire ou en cache de session */
  function getProfile() {
    if (currentProfile) return currentProfile;
    try {
      var cached = sessionStorage.getItem(PROFILE_CACHE_KEY);
      if (cached) {
        currentProfile = JSON.parse(cached);
        return currentProfile;
      }
    } catch (e) {}
    return null;
  }

  function setProfile(profile) {
    currentProfile = profile;
    try {
      if (profile) {
        sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
      } else {
        sessionStorage.removeItem(PROFILE_CACHE_KEY);
      }
    } catch (e) {}
  }

  function getRole() {
    var p = getProfile();
    return p ? p.role : null;
  }

  function getUser() {
    var p = getProfile();
    return p || null;
  }

  function isAdmin() {
    var p = getProfile();
    return !!(p && p.role === 'super_admin' && p.is_active);
  }

  function isMember() {
    var p = getProfile();
    return !!(p && p.role === 'member' && p.is_active);
  }

  function isGuest() {
    return !isAdmin();
  }

  function isAuthenticated() {
    var p = getProfile();
    return !!(p && p.id && p.is_active);
  }

  /**
   * Récupère le profil associé depuis la table public.profiles
   */
  async function fetchProfile(userId, userEmail) {
    var sb = getClient();
    if (!sb || !userId) return null;

    try {
      var { data, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profil pas encore inséré par le trigger, tentative d'auto-création
        var initialRole = 'member';
        var { count } = await sb.from('profiles').select('*', { count: 'exact', head: true });
        if (count === 0) initialRole = 'super_admin';

        var insertRes = await sb.from('profiles').insert({
          id: userId,
          email: userEmail || '',
          full_name: (userEmail || '').split('@')[0],
          role: initialRole,
          is_active: true
        }).select().single();

        if (insertRes.data) {
          data = insertRes.data;
        }
      }

      if (data) {
        setProfile(data);
        return data;
      }
    } catch (err) {
      console.error('Erreur chargement profil utilisateur:', err);
    }
    return null;
  }

  /**
   * Connexion avec Email et Mot de passe
   */
  async function login(email, password) {
    var sb = getClient();
    if (!sb) {
      throw new Error('La connexion à Supabase n’est pas configurée.');
    }

    var cleanEmail = String(email || '').trim().toLowerCase();
    var { data, error } = await sb.auth.signInWithPassword({
      email: cleanEmail,
      password: password
    });

    if (error) {
      if (error.message.indexOf('Invalid login credentials') !== -1) {
        throw new Error('Adresse e-mail ou mot de passe incorrect.');
      }
      throw new Error(error.message || 'Échec de la connexion.');
    }

    if (!data.user) {
      throw new Error('Aucun utilisateur renvoyé par le service d’authentification.');
    }

    var profile = await fetchProfile(data.user.id, data.user.email);
    if (!profile) {
      // Fallback profil minimal si la table n'a pas répondu
      profile = {
        id: data.user.id,
        email: data.user.email,
        full_name: (data.user.user_metadata && data.user.user_metadata.full_name) || data.user.email.split('@')[0],
        role: 'member',
        is_active: true
      };
      setProfile(profile);
    }

    if (!profile.is_active) {
      await sb.auth.signOut();
      setProfile(null);
      throw new Error('Ce compte utilisateur a été désactivé par l’administrateur.');
    }

    notifyAuthStateChange();
    return profile;
  }

  /**
   * Première inscription (si premier démarrage sans utilisateurs)
   */
  async function signUpFirstAdmin(email, password, fullName) {
    var sb = getClient();
    if (!sb) throw new Error('Supabase non configuré.');

    var { data, error } = await sb.auth.signUp({
      email: String(email).trim().toLowerCase(),
      password: password,
      options: {
        data: { full_name: fullName || 'Super Admin' }
      }
    });

    if (error) throw new Error(error.message);
    if (data && data.user) {
      await fetchProfile(data.user.id, data.user.email);
    }
    return data;
  }

  /**
   * Déconnexion
   */
  async function logout() {
    var sb = getClient();
    if (sb) {
      try { await sb.auth.signOut(); } catch (e) {}
    }
    setProfile(null);
    notifyAuthStateChange();
    if (App.router && App.router.route) {
      App.router.route();
    }
  }

  /**
   * Réinitialisation de session / vérification initiale au chargement
   */
  async function checkSession() {
    var sb = getClient();
    if (!sb) {
      setProfile(null);
      return null;
    }

    try {
      var { data: { session }, error } = await sb.auth.getSession();
      if (error || !session || !session.user) {
        setProfile(null);
        return null;
      }

      var profile = await fetchProfile(session.user.id, session.user.email);
      if (profile && !profile.is_active) {
        await sb.auth.signOut();
        setProfile(null);
        return null;
      }
      return profile;
    } catch (e) {
      console.warn('Erreur vérification session:', e);
      setProfile(null);
      return null;
    }
  }

  function onAuthStateChange(listener) {
    authListeners.push(listener);
  }

  function notifyAuthStateChange() {
    authListeners.forEach(function (fn) {
      try { fn(getProfile()); } catch (e) {}
    });
  }

  /**
   * Rendu de l'écran de connexion / configuration / création premier admin
   */
  async function renderLogin(container) {
    var configured = isConfigured();
    var esc = App.util ? App.util.escapeHtml : function (s) { return s; };
    var isFirstSetup = false;

    if (configured) {
      try {
        var sb = getClient();
        if (sb) {
          var { count, error } = await sb.from('profiles').select('*', { count: 'exact', head: true });
          if (!error && count === 0) {
            isFirstSetup = true;
          }
        }
      } catch (e) {
        console.warn('Vérification premier admin:', e);
      }
    }

    var authMode = isFirstSetup ? 'setup-admin' : 'login';

    function renderForm() {
      var html =
        '<div class="auth-screen">' +
        '<div class="auth-card">' +
        '<div class="auth-logo">' +
        '<div class="auth-icon">🏢</div>' +
        '<h1>ESCALAR MEDIA</h1>' +
        '<p class="muted">Système de gestion devis &amp; factures · NFC Maroc</p>' +
        '</div>';

      if (!configured) {
        // Écran d'initialisation Supabase si non configuré
        html +=
          '<div class="auth-divider"></div>' +
          '<div class="auth-section">' +
          '<h2>Configuration de la base de données</h2>' +
          '<p class="small muted">Connectez l’application à votre projet Supabase pour activer la gestion multi-utilisateur et la persistance centralisée.</p>' +
          '<div class="alerts" id="auth-setup-alerts"></div>' +
          '<div class="grid" style="gap:10px">' +
          '<label class="f"><span>URL du projet Supabase</span>' +
          '<input type="text" id="cfg-url" placeholder="https://xxxxxxxx.supabase.co" autocomplete="off">' +
          '</label>' +
          '<label class="f"><span>Clé d’API publique (Anon Key)</span>' +
          '<input type="password" id="cfg-key" placeholder="eyJhbGciOiJIUzI1NiIsIn..." autocomplete="off">' +
          '</label>' +
          '<button class="btn primary" id="btn-save-cfg" style="width:100%;margin-top:4px">Enregistrer et connecter</button>' +
          '</div>' +
          '<p class="muted small" style="margin-top:14px">Consultez <code>supabase/README.md</code> pour créer votre projet et exécuter le script de migration en 2 minutes.</p>' +
          '</div>';
      } else if (authMode === 'setup-admin') {
        // Écran de création du premier compte Super Admin
        html +=
          '<div class="auth-divider"></div>' +
          '<div class="auth-section">' +
          '<h2>Créer le compte Super Admin</h2>' +
          '<p class="small muted">Configurez le compte propriétaire principal pour initialiser la gestion de l’équipe et des documents.</p>' +
          '<div class="alerts" id="auth-login-alerts"></div>' +
          '<form id="auth-form" onsubmit="return false;">' +
          '<div class="grid" style="gap:12px">' +
          '<label class="f"><span>Nom et prénom</span>' +
          '<input type="text" id="auth-name" placeholder="ex. Sohaib Bahla" required autocomplete="name">' +
          '</label>' +
          '<label class="f"><span>Adresse e-mail</span>' +
          '<input type="email" id="auth-email" placeholder="contact@nfcmaroc.com" required autocomplete="username">' +
          '</label>' +
          '<label class="f"><span>Mot de passe (au moins 6 caractères)</span>' +
          '<div style="position:relative">' +
          '<input type="password" id="auth-password" placeholder="••••••••" required autocomplete="new-password" style="padding-right:38px">' +
          '<button type="button" id="btn-toggle-pw" class="btn ghost icon sm" style="position:absolute;right:4px;top:3px;height:28px;width:30px;color:var(--muted)" title="Afficher/masquer">👁️</button>' +
          '</div>' +
          '</label>' +
          '<button type="submit" class="btn primary" id="btn-submit-login" style="width:100%;margin-top:6px;height:38px;font-size:14px">Créer mon compte Super Admin</button>' +
          '</div>' +
          '</form>' +
          '<div style="text-align:center;margin-top:14px">' +
          '<a href="#" id="btn-switch-login" class="small" style="text-decoration:none">Déjà un compte ? Se connecter</a>' +
          '</div>' +
          '</div>';
      } else {
        // Écran standard de connexion Email / Mot de passe
        html +=
          '<div class="auth-divider"></div>' +
          '<div class="auth-section">' +
          '<h2>Connexion à votre espace</h2>' +
          '<div class="alerts" id="auth-login-alerts"></div>' +
          '<form id="auth-form" onsubmit="return false;">' +
          '<div class="grid" style="gap:12px">' +
          '<label class="f"><span>Adresse e-mail</span>' +
          '<input type="email" id="auth-email" placeholder="votre.nom@nfcmaroc.com" required autocomplete="username">' +
          '</label>' +
          '<label class="f"><span>Mot de passe</span>' +
          '<div style="position:relative">' +
          '<input type="password" id="auth-password" placeholder="••••••••" required autocomplete="current-password" style="padding-right:38px">' +
          '<button type="button" id="btn-toggle-pw" class="btn ghost icon sm" style="position:absolute;right:4px;top:3px;height:28px;width:30px;color:var(--muted)" title="Afficher/masquer">👁️</button>' +
          '</div>' +
          '</label>' +
          '<button type="submit" class="btn primary" id="btn-submit-login" style="width:100%;margin-top:6px;height:38px;font-size:14px">Se connecter</button>' +
          '</div>' +
          '</form>' +
          '<div style="margin-top:14px;text-align:center">' +
          '<a href="#" id="btn-switch-admin" class="small muted" style="text-decoration:none">Première installation ? Créer le Super Admin</a>' +
          '</div>' +
          '<div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center">' +
          '<button type="button" class="btn ghost sm" id="btn-edit-db-cfg" style="font-size:11.5px">⚙️ Config base</button>' +
          '<span class="muted small">Accès sécurisé RLS</span>' +
          '</div>' +
          '</div>';
      }

      html += '</div></div>';
      container.innerHTML = html;

      // Configuration Supabase si pas configuré
      if (!configured) {
        var btnSaveCfg = container.querySelector('#btn-save-cfg');
        var cfgUrlInp  = container.querySelector('#cfg-url');
        var cfgKeyInp  = container.querySelector('#cfg-key');
        var alertsBox  = container.querySelector('#auth-setup-alerts');

        var existingCfg = App.supabaseClient.loadConfig();
        if (existingCfg.url) cfgUrlInp.value = existingCfg.url;
        if (existingCfg.anonKey) cfgKeyInp.value = existingCfg.anonKey;

        btnSaveCfg.addEventListener('click', function () {
          var u = cfgUrlInp.value.trim();
          var k = cfgKeyInp.value.trim();
          if (!u || !k) {
            alertsBox.innerHTML = '<div class="alert err">Veuillez renseigner l’URL et la clé anonyme Supabase.</div>';
            return;
          }
          App.supabaseClient.saveConfig(u, k);
          App.ui.toast('Configuration enregistrée.', 'ok');
          renderLogin(container);
        });
        return;
      }

      // Liens de basculement entre connexion et création admin
      var btnSwitchAdmin = container.querySelector('#btn-switch-admin');
      if (btnSwitchAdmin) {
        btnSwitchAdmin.addEventListener('click', function (e) {
          e.preventDefault();
          authMode = 'setup-admin';
          renderForm();
        });
      }
      var btnSwitchLogin = container.querySelector('#btn-switch-login');
      if (btnSwitchLogin) {
        btnSwitchLogin.addEventListener('click', function (e) {
          e.preventDefault();
          authMode = 'login';
          renderForm();
        });
      }

      // Gestion formulaire
      var form        = container.querySelector('#auth-form');
      var nameInp     = container.querySelector('#auth-name');
      var emailInp    = container.querySelector('#auth-email');
      var pwInp       = container.querySelector('#auth-password');
      var btnSubmit   = container.querySelector('#btn-submit-login');
      var btnTogglePw = container.querySelector('#btn-toggle-pw');
      var alertsBox   = container.querySelector('#auth-login-alerts');
      var btnEditCfg  = container.querySelector('#btn-edit-db-cfg');

      if (btnTogglePw) {
        btnTogglePw.addEventListener('click', function () {
          if (pwInp.type === 'password') {
            pwInp.type = 'text';
            btnTogglePw.textContent = '🔒';
          } else {
            pwInp.type = 'password';
            btnTogglePw.textContent = '👁️';
          }
        });
      }

      if (btnEditCfg) {
        btnEditCfg.addEventListener('click', function () {
          if (window.confirm('Voulez-vous modifier les paramètres de connexion à Supabase ?')) {
            App.supabaseClient.saveConfig('', '');
            renderLogin(container);
          }
        });
      }

      async function handleSubmit() {
        var em = emailInp.value.trim();
        var pw = pwInp.value;
        if (!em || !pw) {
          alertsBox.innerHTML = '<div class="alert err">Veuillez renseigner votre email et mot de passe.</div>';
          return;
        }

        alertsBox.innerHTML = '';
        btnSubmit.disabled = true;

        if (authMode === 'setup-admin') {
          var name = (nameInp && nameInp.value.trim()) || '';
          if (pw.length < 6) {
            alertsBox.innerHTML = '<div class="alert err">Le mot de passe doit comporter au moins 6 caractères.</div>';
            btnSubmit.disabled = false;
            return;
          }
          btnSubmit.textContent = 'Création du compte Super Admin…';

          try {
            var res = await signUpFirstAdmin(em, pw, name);
            if (res.session) {
              App.ui.toast('Bienvenue Super Admin !', 'ok');
              if (App.router && App.router.route) {
                App.router.route();
              }
            } else {
              alertsBox.innerHTML =
                '<div class="alert warn" style="line-height:1.4">' +
                '<b>Compte Super Admin créé !</b><br>' +
                'Si Supabase requiert la confirmation d’e-mail, cliquez sur le lien reçu dans votre boîte de réception.<br>' +
                '<i>(Astuce : pour vous connecter immédiatement sans e-mail, désactivez "Confirm email" dans Supabase ➔ Auth ➔ Providers ➔ Email, ou exécutez la migration <code>002_auto_confirm.sql</code>)</i>' +
                '</div>';
              btnSubmit.disabled = false;
              btnSubmit.textContent = 'Créer mon compte Super Admin';
            }
          } catch (err) {
            alertsBox.innerHTML = '<div class="alert err">' + esc(err.message) + '</div>';
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Créer mon compte Super Admin';
          }
        } else {
          btnSubmit.textContent = 'Connexion en cours…';
          try {
            var profile = await login(em, pw);
            App.ui.toast('Bienvenue, ' + (profile.full_name || profile.email) + ' !', 'ok');
            if (App.router && App.router.route) {
              App.router.route();
            }
          } catch (err) {
            alertsBox.innerHTML = '<div class="alert err">' + esc(err.message) + '</div>';
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Se connecter';
            pwInp.value = '';
            pwInp.focus();
          }
        }
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        handleSubmit();
      });

      if (nameInp) nameInp.focus();
      else if (emailInp) emailInp.focus();
    }

    renderForm();
  }

  App.auth = {
    isConfigured: isConfigured,
    getProfile: getProfile,
    getUser: getUser,
    getRole: getRole,
    isAdmin: isAdmin,
    isMember: isMember,
    isGuest: isGuest,
    isAuthenticated: isAuthenticated,
    login: login,
    logout: logout,
    signUpFirstAdmin: signUpFirstAdmin,
    checkSession: checkSession,
    onAuthStateChange: onAuthStateChange,
    renderLogin: renderLogin
  };
})(typeof window !== 'undefined' ? (window.App = window.App || {}) : (typeof global !== 'undefined' ? (global.window = global.window || {}, global.window.App = global.window.App || {}) : {}));
