/* Exporter mes données / Importer une sauvegarde (JSON). */
(function (App) {
  'use strict';

  var ui = App.ui;

  function exportBackup() {
    var data = App.store.exportData();
    var name = 'sauvegarde-facturation-escalar-' + App.util.todayISO() + '.json';
    ui.downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name);
    ui.toast('Sauvegarde téléchargée : ' + data.docs.length + ' document(s).', 'ok');
  }

  /** Ouvre le sélecteur, valide le fichier, demande confirmation puis restaure. */
  function importBackup(onDone) {
    var input = ui.$('#import-file');
    input.value = '';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      ui.readFileAsText(file).then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { throw new Error('Ce fichier n’est pas un JSON valide.'); }
        var check = App.store.validateBackup(data);
        if (!check.ok) throw new Error('Sauvegarde invalide : ' + check.errors.join(' '));
        var current = App.store.listDocs().length;
        var body = '<p>Fichier : <b>' + App.util.escapeHtml(file.name) + '</b><br>' +
          'Exporté le ' + App.util.escapeHtml(data.exportedAt ? new Date(data.exportedAt).toLocaleString('fr-FR') : '?') + ' · ' +
          data.docs.length + ' document(s)</p>' +
          '<p class="info warn">Vos ' + current + ' document(s) actuels seront <b>remplacés</b> par ceux de la sauvegarde, ainsi que les paramètres. ' +
          'Les compteurs de numérotation gardent la valeur la plus haute pour ne jamais réutiliser un numéro.</p>';
        return ui.dialog('Restaurer cette sauvegarde ?', body, [
          { id: 'backup', label: 'Exporter mes données actuelles d’abord', keepOpen: true, onClick: exportBackup },
          { id: 'cancel', label: 'Annuler' },
          { id: 'ok', label: 'Restaurer', cls: 'primary' }
        ]).then(function (choice) {
          if (choice !== 'ok') return;
          App.store.importData(data);
          ui.toast('Sauvegarde restaurée : ' + data.docs.length + ' document(s).', 'ok');
          if (onDone) onDone();
        });
      }).catch(function (err) {
        ui.toast(err.message, 'err');
      });
    };
    input.click();
  }

  App.backup = { exportBackup: exportBackup, importBackup: importBackup };
})(window.App = window.App || {});
