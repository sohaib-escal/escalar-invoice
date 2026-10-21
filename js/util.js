/* Petites fonctions utilitaires partagées (formatage, dates, échappement). */
(function (App) {
  'use strict';

  var NBSP = ' ';

  /** Formate un montant en centimes : 2508000 -> "25 080,00" (espace insécable). */
  function formatCents(cents) {
    var negative = cents < 0;
    var abs = Math.abs(Math.round(cents));
    var units = Math.floor(abs / 100);
    var dec = String(abs % 100).padStart(2, '0');
    var grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (negative ? '−' : '') + grouped + ',' + dec;
  }

  function formatMoney(cents, currency) {
    return formatCents(cents) + NBSP + (currency || 'MAD');
  }

  /** Formate un nombre décimal (quantité, pourcentage) à la française, sans zéros inutiles. */
  function formatNumber(n, maxDecimals) {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '';
    var d = maxDecimals === undefined ? 3 : maxDecimals;
    var s = Number(n).toFixed(d).replace(/\.?0+$/, '');
    var parts = s.split('.');
    var neg = parts[0].charAt(0) === '-';
    var intPart = (neg ? parts[0].slice(1) : parts[0]).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (neg ? '−' : '') + intPart + (parts[1] ? ',' + parts[1] : '');
  }

  /** Accepte "1 250,50", "1250.5", "1,5" -> nombre, ou NaN si invalide. Chaîne vide -> NaN. */
  function parseNumber(value) {
    if (typeof value === 'number') return value;
    if (value === null || value === undefined) return NaN;
    var s = String(value).trim().replace(/[\s  ]/g, '').replace('−', '-');
    if (s === '') return NaN;
    if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return NaN;
    return parseFloat(s);
  }

  /* ---- Dates (stockées en ISO "YYYY-MM-DD", affichées en JJ/MM/AAAA) ---- */

  function todayISO() {
    var d = new Date();
    return toISO(d);
  }

  function toISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function isValidISODate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    var p = s.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }

  function addDaysISO(iso, days) {
    var p = iso.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2] + days);
    return toISO(d);
  }

  function formatDate(iso) {
    if (!isValidISODate(iso)) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Nom de fichier sûr : retire accents et caractères spéciaux. */
  function sanitizeFilePart(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  App.util = {
    NBSP: NBSP,
    formatCents: formatCents,
    formatMoney: formatMoney,
    formatNumber: formatNumber,
    parseNumber: parseNumber,
    todayISO: todayISO,
    toISO: toISO,
    isValidISODate: isValidISODate,
    addDaysISO: addDaysISO,
    formatDate: formatDate,
    escapeHtml: escapeHtml,
    sanitizeFilePart: sanitizeFilePart,
    uid: uid,
    clone: clone,
    debounce: debounce
  };
})(window.App = window.App || {});
