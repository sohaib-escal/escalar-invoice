/* Petits outils d'interface : notifications, confirmation en ligne, boîte de dialogue, fichiers. */
(function (App) {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /** Notification discrète. `html` permet un lien (contenu déjà échappé). */
  function toast(message, kind, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    if (opts.html) el.innerHTML = message; else el.textContent = message;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, opts.duration || (kind === 'err' ? 8000 : 3500));
  }

  /** Suppression en deux clics : le bouton devient « Confirmer ? » pendant 4 s. */
  function confirmInline(btn, onConfirm, label) {
    if (btn.classList.contains('confirm')) {
      clearTimeout(btn._t);
      onConfirm();
      return;
    }
    var original = btn.textContent;
    btn.classList.add('confirm');
    btn.textContent = label || 'Confirmer ?';
    btn._t = setTimeout(function () {
      btn.classList.remove('confirm');
      btn.textContent = original;
    }, 4000);
  }

  /** Boîte de dialogue simple (réservée aux actions rares : import). Résout avec l'id du bouton. */
  function dialog(title, bodyHtml, buttons) {
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = '<div class="dialog" role="dialog" aria-modal="true"><h3></h3><div class="body"></div><div class="btn-row"></div></div>';
      $('h3', ov).textContent = title;
      $('.body', ov).innerHTML = bodyHtml;
      buttons.forEach(function (b) {
        var el = document.createElement('button');
        el.className = 'btn ' + (b.cls || '');
        el.textContent = b.label;
        el.addEventListener('click', function () {
          if (b.keepOpen) { b.onClick && b.onClick(); return; }
          ov.remove();
          resolve(b.id);
        });
        $('.btn-row', ov).appendChild(el);
      });
      ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') { ov.remove(); resolve(null); } });
      document.body.appendChild(ov);
      var last = $$('.btn-row .btn', ov).pop();
      if (last) last.focus();
    });
  }

  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Lecture du fichier impossible.')); };
      r.readAsText(file, 'utf-8');
    });
  }

  /** Image importée -> PNG redimensionné (max 900 px) pour rester léger dans localStorage. */
  function imageToDataURL(file, maxSide) {
    maxSide = maxSide || 900;
    return new Promise(function (resolve, reject) {
      if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) return reject(new Error('Format non pris en charge (PNG, JPEG, WebP ou SVG).'));
      if (file.size > 8 * 1024 * 1024) return reject(new Error('Image trop lourde (8 Mo maximum).'));
      var r = new FileReader();
      r.onerror = function () { reject(new Error('Lecture de l’image impossible.')); };
      r.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Image illisible.')); };
        img.onload = function () {
          var w = img.naturalWidth || 600, h = img.naturalHeight || 300;
          var k = Math.min(1, maxSide / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  App.ui = {
    $: $, $$: $$,
    toast: toast,
    confirmInline: confirmInline,
    dialog: dialog,
    downloadBlob: downloadBlob,
    readFileAsText: readFileAsText,
    imageToDataURL: imageToDataURL
  };
})(window.App = window.App || {});
