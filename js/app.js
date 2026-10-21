/* Routeur minimal par hash : #/  ·  #/nouveau/devis  ·  #/doc/<id>  ·  #/brouillon  ·  #/parametres */
(function (App) {
  'use strict';

  var view = document.getElementById('view');
  var current = location.hash;
  var inEditor = false;

  function setNav(name) {
    App.ui.$$('.nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === name); });
  }

  function updateNavVisibility() {
    var nav = document.querySelector('.nav');
    var topbar = document.querySelector('.topbar');
    if (!App.auth.getRole()) {
      if (nav) nav.style.display = 'none';
      var old = topbar ? topbar.querySelector('.auth-role-badge') : null;
      if (old) old.remove();
    } else {
      if (nav) nav.style.display = '';
      // Seul l'administrateur accède à la liste des documents et aux paramètres
      App.ui.$$('.nav a', topbar).forEach(function (a) {
        if (a.dataset.nav === 'settings') a.style.display = App.auth.isAdmin() ? '' : 'none';
        if (a.dataset.nav === 'docs') a.style.display = App.auth.isAdmin() ? '' : 'none';
      });
      // Badge rôle + bouton déconnexion dans la topbar
      if (topbar) {
        var badge = topbar.querySelector('.auth-role-badge');
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'auth-role-badge';
          topbar.appendChild(badge);
        }
        badge.innerHTML = '<span class="badge ' + (App.auth.isAdmin() ? 'badge-admin' : 'badge-guest') + '">' +
          (App.auth.isAdmin() ? '🔑 Admin' : '👤 Invité') + '</span>' +
          '<button class="btn sm ghost auth-logout-btn" title="Se déconnecter">Déconnexion</button>';
        badge.querySelector('.auth-logout-btn').addEventListener('click', function () {
          if (inEditor && !App.editor.canLeave()) return;
          App.auth.logout();
          updateNavVisibility();
        });
      }
    }
  }

  function route() {
    var h = location.hash || '#/';
    var m;
    if (inEditor) App.editor.close();
    inEditor = false;
    window.scrollTo(0, 0);

    // ---- Portail d'authentification ----
    if (!App.auth.getRole()) {
      // Retirer l'ancien badge si on se déconnecte
      var oldBadge = document.querySelector('.auth-role-badge');
      if (oldBadge) oldBadge.remove();
      updateNavVisibility();
      App.auth.renderLogin(view);
      document.title = 'Connexion — Facturation ESCALAR MEDIA';
      return;
    }
    updateNavVisibility();

    // ---- Restrictions pour les invités ----
    if (App.auth.isGuest()) {
      if (h === '#/parametres') { location.hash = '#/nouveau/devis'; return; }
      if (/^#\/nouveau\/facture$/.test(h)) { App.ui.toast('Les invités ne peuvent créer que des devis.', 'err'); location.hash = '#/nouveau/devis'; return; }
      if (/^#\/doc\//.test(h)) { App.ui.toast('Les invités ne peuvent pas accéder aux documents existants.', 'err'); location.hash = '#/nouveau/devis'; return; }
    }

    if ((m = /^#\/nouveau\/(devis|facture)$/.exec(h))) {
      setNav('docs'); inEditor = true; App.editor.openNew(view, m[1]);
    } else if ((m = /^#\/doc\/(.+)$/.exec(h))) {
      setNav('docs'); inEditor = true; App.editor.openExisting(view, decodeURIComponent(m[1]));
    } else if (h === '#/brouillon') {
      setNav('docs'); inEditor = true; App.editor.openDraftView(view);
    } else if (h === '#/parametres') {
      setNav('settings'); App.settings.render(view);
    } else {
      // Invité va directement à #/nouveau/devis au lieu du tableau de bord
      if (App.auth.isGuest()) {
        location.hash = '#/nouveau/devis';
        return;
      }
      setNav('docs'); App.dashboard.render(view);
    }
    current = location.hash;
    document.title = (inEditor ? 'Éditeur' : h === '#/parametres' ? 'Paramètres' : 'Documents') + ' — Facturation ESCALAR MEDIA';
  }

  window.addEventListener('hashchange', function () {
    // Protection contre la perte de modifications non enregistrées
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
  route();
})(window.App = window.App || {});
