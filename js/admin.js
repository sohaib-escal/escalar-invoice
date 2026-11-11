/*
 * Tableau de bord Super Admin :
 *  - Statistiques globales (Devis, Factures, Chiffre d'affaires, Équipe)
 *  - Registre complet de tous les documents de l'équipe avec filtres avancés
 *  - Gestion des utilisateurs (Création, Rôles, Activation/Désactivation, Réinitialisation mot de passe)
 *  - Journal d'activité (Audit log)
 */
(function (App) {
  'use strict';

  var ui = App.ui, util = App.util, esc = util.escapeHtml;

  var currentTab = 'overview'; // 'overview' | 'users' | 'audit'
  var allDocs = [];
  var allUsers = [];
  var auditLogs = [];
  var isLoading = false;

  var docFilters = {
    q: '',
    type: 'all',
    status: 'all',
    creator: 'all',
    sort: 'desc'
  };

  function getClient() {
    return App.supabaseClient ? App.supabaseClient.getClient() : null;
  }

  async function loadAdminData() {
    isLoading = true;
    var sb = getClient();

    try {
      // 1. Documents
      allDocs = await App.store.fetchDocs();

      // 2. Utilisateurs
      if (sb) {
        var { data: profiles, error: pErr } = await sb
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (!pErr && profiles) {
          allUsers = profiles;
        }

        // 3. Journal d'audit
        var { data: logs, error: lErr } = await sb
          .from('audit_log')
          .select('*, profiles(email, full_name)')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!lErr && logs) {
          auditLogs = logs;
        }
      }
    } catch (e) {
      console.error('Erreur chargement données admin:', e);
      ui.toast('Erreur de synchronisation admin : ' + e.message, 'err');
    } finally {
      isLoading = false;
    }
  }

  function computeStats() {
    var devisList = allDocs.filter(function (d) { return d.type === 'devis'; });
    var facturesList = allDocs.filter(function (d) { return d.type === 'facture'; });

    var totalDevisTTC = devisList.reduce(function (sum, d) {
      return sum + App.calc.computeTotals(d).totalTTCCents;
    }, 0);

    var totalFacturesTTC = facturesList.reduce(function (sum, d) {
      return sum + App.calc.computeTotals(d).totalTTCCents;
    }, 0);

    var facturesPayees = facturesList.filter(function (d) { return d.status === 'payee'; });
    var totalPayeTTC = facturesPayees.reduce(function (sum, d) {
      return sum + App.calc.computeTotals(d).totalTTCCents;
    }, 0);

    var activeUsersCount = allUsers.filter(function (u) { return u.is_active; }).length || 1;

    return {
      devisCount: devisList.length,
      devisTotal: totalDevisTTC,
      facturesCount: facturesList.length,
      facturesTotal: totalFacturesTTC,
      payeCount: facturesPayees.length,
      payeTotal: totalPayeTTC,
      usersCount: activeUsersCount
    };
  }

  function render(view) {
    if (!App.auth.isAdmin()) {
      ui.toast('Accès restreint au Super Admin.', 'err');
      location.hash = '#/';
      return;
    }

    view.innerHTML =
      '<div class="admin-dashboard">' +
      '<div class="page-head">' +
      '<div>' +
      '<h1>Super Admin · Gestion Facturation</h1>' +
      '<p class="muted small" style="margin:4px 0 0">Supervision centralisée de l’équipe, des documents et des accès</p>' +
      '</div>' +
      '<div class="btn-row">' +
      '<a class="btn primary sm" href="#/nouveau/devis">+ Nouveau devis</a>' +
      '<a class="btn primary sm" href="#/nouveau/facture">+ Nouvelle facture</a>' +
      '<a class="btn sm ghost" href="#/parametres">⚙️ Paramètres</a>' +
      '</div>' +
      '</div>' +

      // Onglets
      '<div class="admin-tabs-bar">' +
      '<button class="admin-tab-btn' + (currentTab === 'overview' ? ' active' : '') + '" data-tab="overview">📊 Vue d’ensemble &amp; Documents</button>' +
      '<button class="admin-tab-btn' + (currentTab === 'users' ? ' active' : '') + '" data-tab="users">👥 Équipe &amp; Utilisateurs (' + (allUsers.length || 1) + ')</button>' +
      '<button class="admin-tab-btn' + (currentTab === 'audit' ? ' active' : '') + '" data-tab="audit">📜 Journal d’activité</button>' +
      '</div>' +

      '<div id="admin-tab-content" style="margin-top:18px"></div>' +
      '</div>';

    // Événements d'onglets
    ui.$$('.admin-tab-btn', view).forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentTab = btn.dataset.tab;
        ui.$$('.admin-tab-btn', view).forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        renderCurrentTab(ui.$('#admin-tab-content', view));
      });
    });

    loadAdminData().then(function () {
      renderCurrentTab(ui.$('#admin-tab-content', view));
    });
  }

  function renderCurrentTab(container) {
    if (!container) return;
    if (currentTab === 'overview') {
      renderOverviewTab(container);
    } else if (currentTab === 'users') {
      renderUsersTab(container);
    } else if (currentTab === 'audit') {
      renderAuditTab(container);
    }
  }

  /* -------------------------------------------------------------------------
   * ONGLET 1 : VUE D'ENSEMBLE & TOUS LES DOCUMENTS
   * ------------------------------------------------------------------------- */
  function renderOverviewTab(container) {
    var stats = computeStats();
    var f = util.formatMoney;

    var creatorsList = [];
    var seenCreators = {};
    allDocs.forEach(function (d) {
      if (d.createdBy && !seenCreators[d.createdBy]) {
        seenCreators[d.createdBy] = true;
        creatorsList.push({
          id: d.createdBy,
          name: (d.creator && d.creator.fullName) || (d.creator && d.creator.email) || 'Membre'
        });
      }
    });

    var creatorOptions = '<option value="all">Tous les collaborateurs</option>' +
      creatorsList.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (docFilters.creator === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('');

    container.innerHTML =
      // Cartes de statistiques
      '<div class="admin-stats-grid">' +
      '<div class="stat-card">' +
      '<div class="stat-label">Total Devis émis</div>' +
      '<div class="stat-value">' + stats.devisCount + '</div>' +
      '<div class="stat-sub">' + f(stats.devisTotal) + ' TTC</div>' +
      '</div>' +
      '<div class="stat-card">' +
      '<div class="stat-label">Total Factures émises</div>' +
      '<div class="stat-value">' + stats.facturesCount + '</div>' +
      '<div class="stat-sub">' + f(stats.facturesTotal) + ' TTC</div>' +
      '</div>' +
      '<div class="stat-card highlight">' +
      '<div class="stat-label">Factures encaissées</div>' +
      '<div class="stat-value">' + stats.payeCount + ' <span class="small muted">/ ' + stats.facturesCount + '</span></div>' +
      '<div class="stat-sub ok">' + f(stats.payeTotal) + ' TTC payés</div>' +
      '</div>' +
      '<div class="stat-card">' +
      '<div class="stat-label">Comptes Utilisateurs</div>' +
      '<div class="stat-value">' + stats.usersCount + '</div>' +
      '<div class="stat-sub"><a href="#" id="go-to-users-tab">Gérer les comptes →</a></div>' +
      '</div>' +
      '</div>' +

      // Registre de documents
      '<div class="card" style="margin-top:20px">' +
      '<div class="toolbar" style="gap:8px">' +
      '<input type="search" id="adm-q" placeholder="Rechercher par n°, client ou objet…" value="' + esc(docFilters.q) + '" style="max-width:280px">' +
      '<div class="seg" id="adm-type">' +
      ['all', 'devis', 'facture'].map(function (t) {
        return '<button data-t="' + t + '" class="' + (docFilters.type === t ? 'on' : '') + '">' + ({ all: 'Tous', devis: 'Devis', facture: 'Factures' })[t] + '</button>';
      }).join('') +
      '</div>' +
      '<select id="adm-status" style="max-width:160px">' +
      '<option value="all">Tous statuts</option>' +
      '<option value="brouillon"' + (docFilters.status === 'brouillon' ? ' selected' : '') + '>Brouillon</option>' +
      '<option value="envoye"' + (docFilters.status === 'envoye' ? ' selected' : '') + '>Envoyé</option>' +
      '<option value="emise"' + (docFilters.status === 'emise' ? ' selected' : '') + '>Émise</option>' +
      '<option value="payee"' + (docFilters.status === 'payee' ? ' selected' : '') + '>Payée</option>' +
      '<option value="accepte"' + (docFilters.status === 'accepte' ? ' selected' : '') + '>Accepté</option>' +
      '<option value="refuse"' + (docFilters.status === 'refuse' ? ' selected' : '') + '>Refusé</option>' +
      '<option value="annulee"' + (docFilters.status === 'annulee' ? ' selected' : '') + '>Annulée</option>' +
      '</select>' +
      '<select id="adm-creator" style="max-width:180px">' + creatorOptions + '</select>' +
      '<select id="adm-sort" style="max-width:160px">' +
      '<option value="desc"' + (docFilters.sort === 'desc' ? ' selected' : '') + '>Plus récents d’abord</option>' +
      '<option value="asc"' + (docFilters.sort === 'asc' ? ' selected' : '') + '>Plus anciens d’abord</option>' +
      '</select>' +
      '<span class="muted small" id="adm-count" style="margin-left:auto"></span>' +
      '</div>' +
      '<div id="adm-doc-list"></div>' +
      '</div>';

    var linkToUsers = container.querySelector('#go-to-users-tab');
    if (linkToUsers) {
      linkToUsers.addEventListener('click', function (e) {
        e.preventDefault();
        currentTab = 'users';
        ui.$$('.admin-tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === 'users'); });
        renderCurrentTab(container);
      });
    }

    function updateDocList() {
      var q = docFilters.q.trim().toLowerCase();
      var filtered = allDocs.filter(function (d) {
        if (docFilters.type !== 'all' && d.type !== docFilters.type) return false;
        if (docFilters.status !== 'all' && d.status !== docFilters.status) return false;
        if (docFilters.creator !== 'all' && d.createdBy !== docFilters.creator) return false;
        if (!q) return true;

        var numMatch = String(d.number || '').toLowerCase().indexOf(q) !== -1;
        var clientMatch = String((d.client && d.client.name) || '').toLowerCase().indexOf(q) !== -1;
        var subjectMatch = String(d.subject || '').toLowerCase().indexOf(q) !== -1;
        var creatorMatch = String((d.creator && (d.creator.fullName || d.creator.email)) || '').toLowerCase().indexOf(q) !== -1;

        return numMatch || clientMatch || subjectMatch || creatorMatch;
      });

      filtered.sort(function (a, b) {
        var k = (a.issueDate || '').localeCompare(b.issueDate || '') || String(a.number).localeCompare(String(b.number));
        return docFilters.sort === 'asc' ? k : -k;
      });

      var countEl = container.querySelector('#adm-count');
      if (countEl) countEl.textContent = filtered.length + ' document' + (filtered.length > 1 ? 's' : '');

      var listEl = container.querySelector('#adm-doc-list');
      if (!listEl) return;

      if (!filtered.length) {
        listEl.innerHTML = '<div class="empty">Aucun document ne correspond à vos filtres.</div>';
        return;
      }

      listEl.innerHTML =
        '<table class="list"><thead><tr>' +
        '<th>Numéro</th>' +
        '<th>Type</th>' +
        '<th class="hide-sm">Date</th>' +
        '<th>Client</th>' +
        '<th>Créé par</th>' +
        '<th class="amount">Total TTC</th>' +
        '<th>Statut</th>' +
        '<th style="text-align:right">Actions</th>' +
        '</tr></thead><tbody>' +
        filtered.map(function (d) {
          var ttc = App.calc.computeTotals(d).totalTTCCents;
          var creatorLabel = (d.creator && (d.creator.fullName || d.creator.email)) || '—';
          return '<tr data-id="' + esc(d.id) + '">' +
            '<td class="num"><a href="#/doc/' + esc(d.id) + '">' + esc(d.number) + '</a></td>' +
            '<td><span class="badge ' + d.type + '">' + App.documents.typeLabel(d.type) + '</span></td>' +
            '<td class="hide-sm">' + esc(util.formatDate(d.issueDate)) + '</td>' +
            '<td class="client-cell" title="' + esc(d.client && d.client.name) + '">' +
            (d.client && d.client.name ? esc(d.client.name) : '<span class="muted">—</span>') +
            '</td>' +
            '<td><span class="user-pill" title="Créateur du document">' + esc(creatorLabel) + '</span></td>' +
            '<td class="amount">' + util.formatMoney(ttc) + '</td>' +
            '<td>' +
            '<span class="badge s-' + esc(d.status) + '">' + esc(App.documents.statusLabel(d.type, d.status)) + '</span>' +
            (d.drive ? '<span class="drive-tag" title="Google Drive ✓">Drive ✓</span>' : '') +
            '</td>' +
            '<td class="actions">' +
            '<a class="btn sm" href="#/doc/' + esc(d.id) + '">Ouvrir</a>' +
            '<button class="btn sm" data-act="dup">Dupliquer</button>' +
            '<button class="btn sm" data-act="pdf">PDF</button>' +
            '<button class="btn sm danger" data-act="del">Supprimer</button>' +
            '</td>' +
            '</tr>';
        }).join('') +
        '</tbody></table>';
    }

    // Gestion des filtres
    container.querySelector('#adm-q').addEventListener('input', function (e) {
      docFilters.q = e.target.value;
      updateDocList();
    });

    container.querySelector('#adm-status').addEventListener('change', function (e) {
      docFilters.status = e.target.value;
      updateDocList();
    });

    container.querySelector('#adm-creator').addEventListener('change', function (e) {
      docFilters.creator = e.target.value;
      updateDocList();
    });

    container.querySelector('#adm-sort').addEventListener('change', function (e) {
      docFilters.sort = e.target.value;
      updateDocList();
    });

    container.querySelector('#adm-type').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      docFilters.type = b.dataset.t;
      ui.$$('#adm-type button', container).forEach(function (x) { x.classList.toggle('on', x === b); });
      updateDocList();
    });

    // Actions sur les documents
    container.querySelector('#adm-doc-list').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.closest('tr').dataset.id;
      var doc = App.store.getDoc(id);
      if (!doc) return;

      if (btn.dataset.act === 'dup') {
        App.editor.openDraft(App.documents.duplicate(doc));
      } else if (btn.dataset.act === 'pdf') {
        btn.disabled = true;
        App.pdf.download(doc).then(function (r) {
          ui.toast('PDF téléchargé : ' + r.fileName, 'ok');
        }).catch(function (err) {
          ui.toast('Erreur PDF : ' + err.message, 'err');
        }).then(function () {
          btn.disabled = false;
        });
      } else if (btn.dataset.act === 'del') {
        ui.confirmInline(btn, async function () {
          try {
            await App.store.deleteDocAsync(id);
            allDocs = allDocs.filter(function (x) { return x.id !== id; });
            ui.toast('Document ' + doc.number + ' supprimé définitivement.', 'ok');
            updateDocList();
          } catch (err) {
            ui.toast('Erreur suppression : ' + err.message, 'err');
          }
        }, 'Confirmer la suppression');
      }
    });

    updateDocList();
  }

  /* -------------------------------------------------------------------------
   * ONGLET 2 : GESTION DES UTILISATEURS (TEAM MEMBERS & ROLES)
   * ------------------------------------------------------------------------- */
  function renderUsersTab(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="section" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">' +
      '<div>' +
      '<h2>Utilisateurs &amp; Droits d’accès</h2>' +
      '<p class="small muted" style="margin:0">Créez des accès individuels pour vos collaborateurs et contrôlez leurs autorisations.</p>' +
      '</div>' +
      '<button class="btn primary sm" id="btn-new-user">+ Créer un compte utilisateur</button>' +
      '</div>' +
      '<div id="users-table-container"></div>' +
      '</div>';

    var tableBox = container.querySelector('#users-table-container');

    function updateUsersTable() {
      if (!allUsers.length) {
        tableBox.innerHTML = '<div class="empty">Aucun compte utilisateur trouvé.</div>';
        return;
      }

      tableBox.innerHTML =
        '<table class="list"><thead><tr>' +
        '<th>Utilisateur</th>' +
        '<th>Email</th>' +
        '<th>Rôle</th>' +
        '<th>Statut</th>' +
        '<th class="hide-sm">Date de création</th>' +
        '<th style="text-align:right">Actions</th>' +
        '</tr></thead><tbody>' +
        allUsers.map(function (u) {
          var isCurrent = App.auth.getUser() && App.auth.getUser().id === u.id;
          var roleBadge = u.role === 'super_admin'
            ? '<span class="badge badge-admin">🔑 Super Admin</span>'
            : '<span class="badge badge-guest">👤 Membre</span>';

          var statusBadge = u.is_active
            ? '<span class="badge s-payee">Actif</span>'
            : '<span class="badge s-refuse">Désactivé</span>';

          return '<tr data-uid="' + esc(u.id) + '">' +
            '<td><b>' + esc(u.full_name || '—') + '</b>' + (isCurrent ? ' <span class="muted small">(Vous)</span>' : '') + '</td>' +
            '<td><code>' + esc(u.email) + '</code></td>' +
            '<td>' + roleBadge + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td class="hide-sm muted small">' + (u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—') + '</td>' +
            '<td class="actions">' +
            '<button class="btn sm" data-uact="edit">Modifier</button>' +
            '<button class="btn sm" data-uact="reset-pw">Mot de passe</button>' +
            (!isCurrent
              ? '<button class="btn sm ' + (u.is_active ? 'danger' : 'primary') + '" data-uact="toggle-active">' +
                (u.is_active ? 'Désactiver' : 'Activer') + '</button>'
              : '') +
            '</td>' +
            '</tr>';
        }).join('') +
        '</tbody></table>';
    }

    container.querySelector('#btn-new-user').addEventListener('click', function () {
      openCreateUserModal(function () {
        loadAdminData().then(function () {
          updateUsersTable();
        });
      });
    });

    tableBox.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-uact]');
      if (!btn) return;
      var uid = btn.closest('tr').dataset.uid;
      var user = allUsers.find(function (x) { return x.id === uid; });
      if (!user) return;

      var action = btn.dataset.uact;
      if (action === 'edit') {
        openEditUserModal(user, function () {
          loadAdminData().then(function () { updateUsersTable(); });
        });
      } else if (action === 'reset-pw') {
        openResetPasswordModal(user);
      } else if (action === 'toggle-active') {
        var newStatus = !user.is_active;
        var promptMsg = newStatus
          ? 'Réactiver le compte de ' + (user.full_name || user.email) + ' ?'
          : 'Désactiver le compte de ' + (user.full_name || user.email) + ' ? Il ne pourra plus se connecter.';

        if (window.confirm(promptMsg)) {
          var sb = getClient();
          sb.rpc('admin_set_user_status', {
            p_user_id: user.id,
            p_is_active: newStatus
          }).then(function (res) {
            if (res.error) throw res.error;
            user.is_active = newStatus;
            ui.toast('Statut mis à jour.', 'ok');
            updateUsersTable();
          }).catch(function (err) {
            ui.toast('Erreur : ' + err.message, 'err');
          });
        }
      }
    });

    updateUsersTable();
  }

  /* -------------------------------------------------------------------------
   * ONGLET 3 : JOURNAL D'AUDIT
   * ------------------------------------------------------------------------- */
  function renderAuditTab(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="section">' +
      '<h2>Journal d’audit &amp; Traçabilité</h2>' +
      '<p class="small muted" style="margin:0">Historique des actions réalisées sur les documents, comptes et paramètres.</p>' +
      '</div>' +
      '<div id="audit-table-container"></div>' +
      '</div>';

    var box = container.querySelector('#audit-table-container');
    if (!auditLogs.length) {
      box.innerHTML = '<div class="empty">Aucune action enregistrée pour le moment.</div>';
      return;
    }

    box.innerHTML =
      '<table class="list"><thead><tr>' +
      '<th>Date &amp; Heure</th>' +
      '<th>Utilisateur</th>' +
      '<th>Action</th>' +
      '<th>Type</th>' +
      '<th>Détails</th>' +
      '</tr></thead><tbody>' +
      auditLogs.map(function (log) {
        var userName = (log.profiles && (log.profiles.full_name || log.profiles.email)) || 'Système';
        var actionLabel = ({
          document_created: 'Création document',
          document_updated: 'Modification document',
          document_deleted: 'Suppression document',
          user_created: 'Création compte',
          user_updated: 'Modification compte',
          user_activated: 'Activation compte',
          user_deactivated: 'Désactivation compte',
          password_reset: 'Changement mot de passe'
        })[log.action] || log.action;

        var detailsStr = '';
        if (log.details && typeof log.details === 'object') {
          detailsStr = Object.keys(log.details).map(function (k) {
            return k + ': ' + log.details[k];
          }).join(', ');
        }

        return '<tr>' +
          '<td class="muted small">' + new Date(log.created_at).toLocaleString('fr-FR') + '</td>' +
          '<td><b>' + esc(userName) + '</b></td>' +
          '<td><span class="badge">' + esc(actionLabel) + '</span></td>' +
          '<td><code>' + esc(log.entity_type) + '</code></td>' +
          '<td class="small muted">' + esc(detailsStr || '—') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  /* -------------------------------------------------------------------------
   * MODALES DE GESTION DES UTILISATEURS
   * ------------------------------------------------------------------------- */

  function openCreateUserModal(onSuccess) {
    var body =
      '<div class="grid" style="gap:12px">' +
      '<label class="f"><span>Nom complet</span>' +
      '<input type="text" id="m-user-name" placeholder="ex. Youssef Bennani">' +
      '</label>' +
      '<label class="f"><span>Adresse e-mail (identifiant de connexion)</span>' +
      '<input type="email" id="m-user-email" placeholder="youssef@nfcmaroc.com">' +
      '</label>' +
      '<label class="f"><span>Mot de passe provisoire (au moins 6 caractères)</span>' +
      '<input type="password" id="m-user-pw" placeholder="••••••••">' +
      '</label>' +
      '<label class="f"><span>Rôle et privilèges</span>' +
      '<select id="m-user-role">' +
      '<option value="member" selected>Membre (Création de devis &amp; factures, vue limitée à ses documents)</option>' +
      '<option value="super_admin">Super Admin (Accès total, gestion utilisateurs et paramètres)</option>' +
      '</select>' +
      '</label>' +
      '<div id="m-user-err" class="field-msg err" hidden></div>' +
      '</div>';

    ui.dialog('Créer un nouveau compte utilisateur', body, [
      { id: 'cancel', label: 'Annuler' },
      {
        id: 'submit',
        label: 'Créer le compte',
        cls: 'primary',
        keepOpen: true,
        onClick: async function () {
          var name = ui.$('#m-user-name').value.trim();
          var email = ui.$('#m-user-email').value.trim();
          var pw = ui.$('#m-user-pw').value;
          var role = ui.$('#m-user-role').value;
          var errEl = ui.$('#m-user-err');

          if (!email || !pw) {
            errEl.textContent = 'L’email et le mot de passe sont obligatoires.';
            errEl.hidden = false;
            return;
          }
          if (pw.length < 6) {
            errEl.textContent = 'Le mot de passe doit comporter au moins 6 caractères.';
            errEl.hidden = false;
            return;
          }

          errEl.hidden = true;
          var sb = getClient();
          try {
            var { data, error } = await sb.rpc('admin_create_user', {
              p_email: email,
              p_password: pw,
              p_full_name: name || email.split('@')[0],
              p_role: role
            });
            if (error) throw error;

            ui.toast('Compte créé pour ' + email + '.', 'ok');
            document.querySelector('.overlay').remove();
            if (onSuccess) onSuccess();
          } catch (err) {
            errEl.textContent = 'Erreur : ' + err.message;
            errEl.hidden = false;
          }
        }
      }
    ]);
  }

  function openEditUserModal(user, onSuccess) {
    var body =
      '<div class="grid" style="gap:12px">' +
      '<label class="f"><span>Adresse e-mail</span>' +
      '<input type="text" value="' + esc(user.email) + '" disabled>' +
      '</label>' +
      '<label class="f"><span>Nom complet</span>' +
      '<input type="text" id="me-user-name" value="' + esc(user.full_name || '') + '">' +
      '</label>' +
      '<label class="f"><span>Rôle</span>' +
      '<select id="me-user-role">' +
      '<option value="member"' + (user.role === 'member' ? ' selected' : '') + '>Membre</option>' +
      '<option value="super_admin"' + (user.role === 'super_admin' ? ' selected' : '') + '>Super Admin</option>' +
      '</select>' +
      '</label>' +
      '<div id="me-user-err" class="field-msg err" hidden></div>' +
      '</div>';

    ui.dialog('Modifier l’utilisateur', body, [
      { id: 'cancel', label: 'Annuler' },
      {
        id: 'save',
        label: 'Enregistrer',
        cls: 'primary',
        keepOpen: true,
        onClick: async function () {
          var name = ui.$('#me-user-name').value.trim();
          var role = ui.$('#me-user-role').value;
          var errEl = ui.$('#me-user-err');

          var sb = getClient();
          try {
            var { error } = await sb.rpc('admin_update_user', {
              p_user_id: user.id,
              p_full_name: name,
              p_role: role
            });
            if (error) throw error;

            ui.toast('Informations mises à jour.', 'ok');
            document.querySelector('.overlay').remove();
            if (onSuccess) onSuccess();
          } catch (err) {
            errEl.textContent = 'Erreur : ' + err.message;
            errEl.hidden = false;
          }
        }
      }
    ]);
  }

  function openResetPasswordModal(user) {
    var body =
      '<div class="grid" style="gap:12px">' +
      '<p class="small muted">Définir un nouveau mot de passe pour <b>' + esc(user.email) + '</b> :</p>' +
      '<label class="f"><span>Nouveau mot de passe</span>' +
      '<input type="password" id="mpw-new" placeholder="••••••••">' +
      '</label>' +
      '<div id="mpw-err" class="field-msg err" hidden></div>' +
      '</div>';

    ui.dialog('Réinitialiser le mot de passe', body, [
      { id: 'cancel', label: 'Annuler' },
      {
        id: 'submit',
        label: 'Appliquer le mot de passe',
        cls: 'primary',
        keepOpen: true,
        onClick: async function () {
          var pw = ui.$('#mpw-new').value;
          var errEl = ui.$('#mpw-err');

          if (!pw || pw.length < 6) {
            errEl.textContent = 'Le mot de passe doit comporter au moins 6 caractères.';
            errEl.hidden = false;
            return;
          }

          var sb = getClient();
          try {
            var { error } = await sb.rpc('admin_reset_user_password', {
              p_user_id: user.id,
              p_new_password: pw
            });
            if (error) throw error;

            ui.toast('Mot de passe réinitialisé pour ' + user.email + '.', 'ok');
            document.querySelector('.overlay').remove();
          } catch (err) {
            errEl.textContent = 'Erreur : ' + err.message;
            errEl.hidden = false;
          }
        }
      }
    ]);
  }

  App.admin = {
    render: render,
    loadAdminData: loadAdminData
  };
})(typeof window !== 'undefined' ? (window.App = window.App || {}) : (typeof global !== 'undefined' ? (global.window = global.window || {}, global.window.App = global.window.App || {}) : {}));

