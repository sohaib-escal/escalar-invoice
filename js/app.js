/* Routeur minimal par hash : #/  ·  #/nouveau/devis  ·  #/doc/<id>  ·  #/brouillon  ·  #/parametres */
(function (App) {
  'use strict';

  var view = document.getElementById('view');
  var current = location.hash;
  var inEditor = false;

  function setNav(name) {
    App.ui.$$('.nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === name); });
  }

  function route() {
    var h = location.hash || '#/';
    var m;
    if (inEditor) App.editor.close();
    inEditor = false;
    window.scrollTo(0, 0);
    if ((m = /^#\/nouveau\/(devis|facture)$/.exec(h))) {
      setNav('docs'); inEditor = true; App.editor.openNew(view, m[1]);
    } else if ((m = /^#\/doc\/(.+)$/.exec(h))) {
      setNav('docs'); inEditor = true; App.editor.openExisting(view, decodeURIComponent(m[1]));
    } else if (h === '#/brouillon') {
      setNav('docs'); inEditor = true; App.editor.openDraftView(view);
    } else if (h === '#/parametres') {
      setNav('settings'); App.settings.render(view);
    } else {
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
