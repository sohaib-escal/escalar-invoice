/* Routeur et gestionnaire de session : #/ · #/admin · #/nouveau/devis · #/nouveau/facture · #/doc/<id> · #/parametres */
(function (App) {
  'use strict';

  var view = document.getElementById('view');
  var current = location.hash;
  var inEditor = false;

  function setNav(name) {
    App.ui.$$('.nav a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.nav === name);
    });
  }

  function updateNavVisibility() {
    var nav = document.querySelector('.nav');
    var topbar = document.querySelector('.topbar');
    var isAuth = App.auth.isAuthenticated();
    var isAdmin = App.auth.isAdmin();
    var user = App.auth.getUser();

    if (!isAuth) {
      if (nav) nav.style.display = 'none';
      var old = topbar ? topbar.querySelector('.auth-role-badge') : null;
      if (old) old.remove();
      return;
    }

    if (nav) {
      nav.style.display = '';
      if (isAdmin) {
        nav.innerHTML =
          '<a href="#/admin" data-nav="admin">Tableau de bord</a>' +
          '<a href="#/" data-nav="docs">Documents</a>' +
          '<a href="#/parametres" data-nav="settings">Paramètres</a>';
      } else {
        nav.innerHTML =
          '<a href="#/" data-nav="docs">Mes documents</a>' +
          '<a href="#/nouveau/devis" data-nav="new-devis">+ Nouveau devis</a>' +
          '<a href="#/nouveau/facture" data-nav="new-facture">+ Nouvelle facture</a>';
      }
    }

    // Badge profil utilisateur + bouton déconnexion dans la topbar
    if (topbar) {
      var badge = topbar.querySelector('.auth-role-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'auth-role-badge';
        topbar.appendChild(badge);
      }
      var displayName = user ? (user.full_name || user.email.split('@')[0]) : '';
      badge.innerHTML =
        '<div class="topbar-user-info">' +
        '<span class="topbar-user-name" title="' + (user ? user.email : '') + '">' + displayName + '</span>' +
        '<span class="badge ' + (isAdmin ? 'badge-admin' : 'badge-guest') + '">' +
        (isAdmin ? '🔑 Super Admin' : '👤 Membre') + '</span>' +
        '</div>' +
        '<button class="btn sm ghost auth-logout-btn" title="Se déconnecter">Déconnexion</button>';

      badge.querySelector('.auth-logout-btn').addEventListener('click', function () {
        if (inEditor && !App.editor.canLeave()) return;
        App.auth.logout();
        updateNavVisibility();
      });
    }
  }

  async function route() {
    var h = location.hash || '#/';
    var m;
    if (inEditor) App.editor.close();
    inEditor = false;
    window.scrollTo(0, 0);

    // ---- Portail d'authentification ----
    if (!App.auth.isAuthenticated()) {
      var oldBadge = document.querySelector('.auth-role-badge');
      if (oldBadge) oldBadge.remove();
      updateNavVisibility();
      App.auth.renderLogin(view);
      document.title = 'Connexion — Facturation ESCALAR MEDIA';
      return;
    }
    updateNavVisibility();

    // ---- Restrictions pour les membres (non super admin) ----
    if (!App.auth.isAdmin()) {
      if (h === '#/parametres') {
        App.ui.toast('L’accès aux paramètres est réservé au Super Admin.', 'err');
        location.hash = '#/';
        return;
      }
      if (h === '#/admin') {
        App.ui.toast('L’accès au tableau de bord administrateur est réservé au Super Admin.', 'err');
        location.hash = '#/';
        return;
      }
    }

    if (h === '#/admin') {
      setNav('admin');
      App.admin.render(view);
      document.title = 'Super Admin — Facturation ESCALAR MEDIA';
    } else if ((m = /^#\/nouveau\/(devis|facture)$/.exec(h))) {
      setNav(m[1] === 'devis' ? 'new-devis' : 'new-facture');
      inEditor = true;
      App.editor.openNew(view, m[1]);
      document.title = 'Nouveau ' + (m[1] === 'devis' ? 'devis' : 'facture') + ' — Facturation ESCALAR MEDIA';
    } else if ((m = /^#\/doc\/(.+)$/.exec(h))) {
      setNav('docs');
      inEditor = true;
      App.editor.openExisting(view, decodeURIComponent(m[1]));
      document.title = 'Éditeur — Facturation ESCALAR MEDIA';
    } else if (h === '#/brouillon') {
      setNav('docs');
      inEditor = true;
      App.editor.openDraftView(view);
      document.title = 'Brouillon — Facturation ESCALAR MEDIA';
    } else if (h === '#/parametres') {
      setNav('settings');
      App.settings.render(view);
      document.title = 'Paramètres — Facturation ESCALAR MEDIA';
    } else {
      setNav('docs');
      App.dashboard.render(view);
      document.title = 'Documents — Facturation ESCALAR MEDIA';
    }
    current = location.hash;
  }

  window.addEventListener('hashchange', function () {
    if (inEditor && !App.editor.canLeave()) {
      history.replaceState(null, '', current);
      return;
    }
    if (!inEditor && App.settingsView && App.settingsView.isDirty() && current === '#/parametres' &&
      !window.confirm('Paramètres non enregistrés. Quitter sans enregistrer ?')) {
      history.replaceState(null, '', current);
      return;
    }
    route();
  });

  App.router = { route: route, sync: function () { current = location.hash; } };
  App.preview.installFonts();

  // Initialisation de la session au démarrage
  if (App.auth && App.auth.checkSession) {
    App.auth.checkSession().then(function () {
      route();
    });
  } else {
    route();
  }
})(typeof window !== 'undefined' ? (window.App = window.App || {}) : (typeof global !== 'undefined' ? (global.window = global.window || {}, global.window.App = global.window.App || {}) : {}));
