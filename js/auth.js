/*
 * Gestion des rôles : admin (PIN) vs invité.
 * L'admin a accès complet ; l'invité ne peut que créer des devis et télécharger le PDF.
 * Les documents créés par l'invité sont enregistrés normalement dans localStorage :
 * l'admin les retrouve tous quand il se connecte.
 */
(function (App) {
  'use strict';

  var ROLE_KEY = 'ef.role.v1';
  var PIN_KEY  = 'ef.adminPin.v1';
  var DEFAULT_PIN = '271998';

  /** Retourne le rôle courant : 'admin' | 'guest' | null (pas encore choisi). */
  function getRole() {
    try { return sessionStorage.getItem(ROLE_KEY) || null; }
    catch (e) { return null; }
  }

  function setRole(role) {
    try { sessionStorage.setItem(ROLE_KEY, role); } catch (e) {}
  }

  function isAdmin() { return getRole() === 'admin'; }
  function isGuest() { return getRole() === 'guest'; }

  function getPin() {
    try {
      var p = localStorage.getItem(PIN_KEY);
      if (!p || p === '1234') return DEFAULT_PIN;
      return p;
    } catch (e) {
      return DEFAULT_PIN;
    }
  }

  function setPin(pin) {
    try { localStorage.setItem(PIN_KEY, pin); } catch (e) {}
  }

  function logout() {
    try { sessionStorage.removeItem(ROLE_KEY); } catch (e) {}
    renderLogin(document.getElementById('view'));
  }

  /** Vérifie le PIN et retourne true si correct. */
  function verifyPin(entered) {
    return entered === getPin();
  }

  /** Affiche l'écran de connexion dans le conteneur donné. */
  function renderLogin(container) {
    container.innerHTML =
      '<div class="auth-screen">' +
      '<div class="auth-card">' +
      '<div class="auth-logo">' +
      '<div class="auth-icon">🔐</div>' +
      '<h1>ESCALAR MEDIA</h1>' +
      '<p class="muted">Devis & factures · NFC Maroc</p>' +
      '</div>' +
      '<div class="auth-divider"></div>' +
      '<div class="auth-section">' +
      '<h2>Accès administrateur</h2>' +
      '<p class="muted small">Accès complet : tous les documents, paramètres, exportation, Google Drive.</p>' +
      '<div class="auth-pin-row">' +
      '<input type="password" id="auth-pin" placeholder="Code PIN" maxlength="20" autocomplete="off">' +
      '<button class="btn primary" id="auth-admin">Connexion</button>' +
      '</div>' +
      '<div class="field-msg err" id="auth-err" hidden></div>' +
      '</div>' +
      '<div class="auth-divider"></div>' +
      '<div class="auth-section">' +
      '<h2>Accès invité</h2>' +
      '<p class="muted small">Créez un devis et téléchargez le PDF. Les documents créés seront accessibles à l\'administrateur.</p>' +
      '<button class="btn" id="auth-guest" style="width:100%">Continuer en tant qu\'invité</button>' +
      '</div>' +
      '</div>' +
      '</div>';

    var pinInput = container.querySelector('#auth-pin');
    var errEl    = container.querySelector('#auth-err');

    function tryAdmin() {
      var val = pinInput.value.trim();
      if (!val) { pinInput.focus(); return; }
      if (verifyPin(val)) {
        setRole('admin');
        errEl.hidden = true;
        App.router.route();
      } else {
        errEl.textContent = 'Code PIN incorrect.';
        errEl.hidden = false;
        pinInput.value = '';
        pinInput.focus();
        pinInput.classList.add('invalid');
        setTimeout(function () { pinInput.classList.remove('invalid'); }, 1200);
      }
    }

    container.querySelector('#auth-admin').addEventListener('click', tryAdmin);
    pinInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryAdmin();
    });
    container.querySelector('#auth-guest').addEventListener('click', function () {
      setRole('guest');
      App.router.route();
    });

    pinInput.focus();
  }

  App.auth = {
    getRole: getRole,
    isAdmin: isAdmin,
    isGuest: isGuest,
    getPin: getPin,
    setPin: setPin,
    verifyPin: verifyPin,
    logout: logout,
    renderLogin: renderLogin,
    DEFAULT_PIN: DEFAULT_PIN
  };
})(window.App = window.App || {});
