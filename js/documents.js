/* Modèle de document (devis / facture) : création, duplication, validation. */
(function (App) {
  'use strict';

  var util = App.util;

  var STATUSES = {
    devis: [
      { id: 'brouillon', label: 'Brouillon' },
      { id: 'envoye', label: 'Envoyé' },
      { id: 'accepte', label: 'Accepté' },
      { id: 'refuse', label: 'Refusé' }
    ],
    facture: [
      { id: 'brouillon', label: 'Brouillon' },
      { id: 'emise', label: 'Émise' },
      { id: 'payee', label: 'Payée' },
      { id: 'annulee', label: 'Annulée' }
    ]
  };

  var PAYMENT_METHODS = ['Virement bancaire', 'Chèque', 'Espèces', 'Effet de commerce', 'Carte bancaire'];

  function typeLabel(type) {
    return type === 'facture' ? 'Facture' : 'Devis';
  }

  function statusLabel(type, status) {
    var s = (STATUSES[type] || []).filter(function (x) { return x.id === status; })[0];
    return s ? s.label : '';
  }

  function newLine(settings) {
    return {
      id: util.uid(),
      description: '',
      qty: '1',
      price: '',
      discount: '',
      taxRate: (settings || App.store.getSettings()).defaults.taxRate
    };
  }

  function newDoc(type) {
    var settings = App.store.getSettings();
    var d = settings.defaults;
    var issue = util.todayISO();
    var isFacture = type === 'facture';
    return {
      id: util.uid(),
      type: type,
      number: App.numbering.peek(type, issue),
      numberAuto: true,   // numéro proposé automatiquement, pas encore consommé
      saved: false,
      status: 'brouillon',
      issueDate: issue,
      validUntil: isFacture ? '' : util.addDaysISO(issue, Number(d.devisValidityDays) || 30),
      deliveryTime: '',
      dueDate: isFacture && d.factureDueDays ? util.addDaysISO(issue, Number(d.factureDueDays)) : '',
      paymentMethod: '',
      paymentRef: '',
      paymentTerms: isFacture ? d.facturePaymentTerms : d.devisPaymentTerms,
      sourceRef: '',
      client: { name: '', contact: '', address: '', email: '', phone: '', ice: '' },
      subject: '',
      lines: [newLine(settings)],
      globalDiscount: { type: 'percent', value: '' },
      notesTitle: 'Notes',
      notes: isFacture ? d.factureNotes : '',
      conditions: isFacture ? '' : d.devisConditions,
      showSignature: true,
      showAcceptance: false,
      showStamp: !!App.store.stampSrc(settings),
      drive: null
    };
  }

  /** Copie avec un nouveau numéro (non consommé avant enregistrement). */
  function duplicate(doc, newType) {
    var copy = util.clone(doc);
    var type = newType || doc.type;
    var issue = util.todayISO();
    var settings = App.store.getSettings();
    copy.id = util.uid();
    copy.type = type;
    copy.issueDate = issue;
    copy.number = App.numbering.peek(type, issue);
    copy.numberAuto = true;
    copy.saved = false;
    copy.status = 'brouillon';
    copy.drive = null;
    delete copy.createdAt;
    delete copy.updatedAt;
    copy.lines.forEach(function (l) { l.id = util.uid(); });
    if (type === 'facture') {
      if (doc.type === 'devis') {
        copy.sourceRef = doc.number;
        copy.conditions = '';
        copy.showAcceptance = false;
        copy.paymentTerms = doc.paymentTerms || settings.defaults.facturePaymentTerms;
        copy.notes = doc.notes || settings.defaults.factureNotes;
      }
      copy.validUntil = '';
      var days = Number(settings.defaults.factureDueDays);
      copy.dueDate = days ? util.addDaysISO(issue, days) : '';
    } else {
      copy.validUntil = util.addDaysISO(issue, Number(settings.defaults.devisValidityDays) || 30);
    }
    return copy;
  }

  /** Erreurs bloquantes et avertissements avant export. */
  function validate(doc, totals) {
    var errors = totals.errors.map(function (e) { return e.msg; });
    var warnings = [];
    if (!String(doc.number || '').trim()) errors.push('Le numéro du document est vide.');
    if (!util.isValidISODate(doc.issueDate)) errors.push('Date d’émission invalide.');
    if (doc.type === 'devis' && doc.validUntil && !util.isValidISODate(doc.validUntil)) errors.push('Date de validité invalide.');
    if (doc.type === 'facture' && doc.dueDate && !util.isValidISODate(doc.dueDate)) errors.push('Date d’échéance invalide.');
    if (doc.validUntil && util.isValidISODate(doc.validUntil) && doc.validUntil < doc.issueDate && doc.type === 'devis') warnings.push('La date de validité est antérieure à la date d’émission.');
    if (doc.dueDate && util.isValidISODate(doc.dueDate) && doc.dueDate < doc.issueDate && doc.type === 'facture') warnings.push('L’échéance est antérieure à la date de facture.');
    if (!String(doc.client.name || '').trim()) warnings.push('Le nom du client / de la société est vide.');
    if (!totals.lines.some(function (l) { return !l.textOnly; })) warnings.push('Aucune ligne chiffrée.');
    if (App.numbering.numberExists(doc.number, doc.id)) warnings.push('Le numéro ' + doc.number + ' est déjà utilisé par un autre document.');
    return { errors: errors, warnings: warnings };
  }

  function fileName(doc) {
    var client = util.sanitizeFilePart(doc.client.name) || 'Client';
    var num = util.sanitizeFilePart(doc.number) || 'SANS_NUMERO';
    return (doc.type === 'facture' ? 'FACTURE' : 'DEVIS') + '_' + num + '_' + client + '.pdf';
  }

  App.documents = {
    STATUSES: STATUSES,
    PAYMENT_METHODS: PAYMENT_METHODS,
    typeLabel: typeLabel,
    statusLabel: statusLabel,
    newDoc: newDoc,
    newLine: newLine,
    duplicate: duplicate,
    validate: validate,
    fileName: fileName
  };
})(window.App = window.App || {});
