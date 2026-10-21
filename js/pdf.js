/*
 * Génération du PDF (A4, texte vectoriel sélectionnable) avec jsPDF.
 * Mise en page dessinée à la main : retour à la ligne, sauts de page,
 * en-tête de tableau répété, totaux et signature gardés ensemble, pied de page légal sur chaque page.
 */
(function (App) {
  'use strict';

  var MM_PER_PT = 25.4 / 72;
  var PAGE_W = 210, PAGE_H = 297;
  var ML = 15, MR = 15, CW = PAGE_W - ML - MR;
  var TOP = 14, CONT_TOP = 20;
  var GAP = 8, COL_W = (CW - GAP) / 2;
  var FONT = 'Carlito';

  var COLOR = {
    blue: [46, 122, 181],
    text: [33, 37, 41],
    muted: [98, 104, 112],
    light: [236, 242, 249],
    border: [178, 192, 209],
    red: [196, 38, 38],
    orange: [226, 154, 56],
    white: [255, 255, 255]
  };

  function lineH(size, factor) {
    return size * MM_PER_PT * (factor || 1.25);
  }

  function baselineOffset(size) {
    return size * MM_PER_PT * 0.95;
  }

  function createPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('La bibliothèque jsPDF n’est pas chargée.');
    var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    var F = window.APP_FONTS;
    [['Regular', 'normal'], ['Bold', 'bold'], ['Italic', 'italic'], ['BoldItalic', 'bolditalic']].forEach(function (f) {
      pdf.addFileToVFS('Carlito-' + f[0] + '.ttf', F[f[0]]);
      pdf.addFont('Carlito-' + f[0] + '.ttf', FONT, f[1]);
    });
    return pdf;
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.onload = function () { resolve({ src: src, w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function imageFormat(src) {
    return /^data:image\/jpe?g/i.test(src) ? 'JPEG' : 'PNG';
  }

  /* ------------------------------------------------------------------ */
  /* Moteur de texte enrichi (gras / italique) avec retour à la ligne     */
  /* ------------------------------------------------------------------ */

  function Writer(pdf) {
    this.pdf = pdf;
  }

  Writer.prototype.font = function (size, bold, italic, color) {
    var style = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
    this.pdf.setFont(FONT, style);
    this.pdf.setFontSize(size);
    if (color) this.pdf.setTextColor(color[0], color[1], color[2]);
  };

  Writer.prototype.width = function (text, size, bold, italic) {
    this.font(size, bold, italic);
    return this.pdf.getTextWidth(text);
  };

  /** Coupe une suite de segments en lignes de largeur maximale `maxW`. */
  Writer.prototype.wrap = function (runs, maxW, size, italic) {
    var self = this;
    var lines = [];
    var cur = { pieces: [], width: 0 };
    var pendingSpace = false;

    function pushLine() {
      lines.push(cur);
      cur = { pieces: [], width: 0 };
    }

    function addWord(word, bold) {
      var space = pendingSpace && cur.pieces.length ? ' ' : '';
      var w = self.width(space + word, size, bold, italic);
      if (cur.width + w > maxW + 0.01 && cur.pieces.length) {
        pushLine();
        space = '';
        w = self.width(word, size, bold, italic);
      }
      if (w > maxW + 0.01) {
        // Mot plus long que la ligne : coupe par caractères
        var chunk = '';
        for (var i = 0; i < word.length; i++) {
          var test = chunk + word[i];
          if (self.width(test, size, bold, italic) > maxW && chunk) {
            cur.pieces.push({ text: chunk, bold: bold, x: cur.width });
            cur.width += self.width(chunk, size, bold, italic);
            pushLine();
            chunk = word[i];
          } else {
            chunk = test;
          }
        }
        word = chunk;
        space = '';
        w = self.width(word, size, bold, italic);
      }
      var last = cur.pieces[cur.pieces.length - 1];
      if (last && last.bold === bold) {
        last.text += space + word;
      } else {
        cur.pieces.push({ text: space + word, bold: bold, x: cur.width });
      }
      cur.width += w;
      pendingSpace = false;
    }

    runs.forEach(function (run) {
      String(run.text).split(/([ \t\n]+)/).forEach(function (tok) {
        if (!tok) return;
        if (/^[ \t\n]+$/.test(tok)) { pendingSpace = true; return; }
        addWord(tok, !!run.bold);
      });
    });
    if (cur.pieces.length || !lines.length) pushLine();
    return lines;
  };

  /** Dessine une ligne (issue de wrap) ; yTop = haut de la ligne. */
  Writer.prototype.drawLine = function (line, x, yTop, size, opts) {
    opts = opts || {};
    var offset = 0;
    if (opts.align === 'right') offset = opts.width - line.width;
    else if (opts.align === 'center') offset = (opts.width - line.width) / 2;
    var self = this;
    line.pieces.forEach(function (p) {
      self.font(size, p.bold || opts.bold, opts.italic, (p.bold && opts.boldColor) || opts.color || COLOR.text);
      self.pdf.text(p.text, x + offset + p.x, yTop + baselineOffset(size));
    });
  };

  Writer.prototype.drawLines = function (lines, x, yTop, size, opts) {
    var lh = lineH(size, opts && opts.factor);
    var self = this;
    lines.forEach(function (l, i) { self.drawLine(l, x, yTop + i * lh, size, opts); });
    return lines.length * lh;
  };

  /* ------------------------------------------------------------------ */
  /* Rendu du document                                                    */
  /* ------------------------------------------------------------------ */

  function render(vm, images) {
    var pdf = createPdf();
    var W = new Writer(pdf);
    var y = TOP;

    // Pied de page : calculé une fois pour connaître la limite basse du contenu
    var FOOT_SIZE = 7.5;
    var footLines = [];
    vm.footer.forEach(function (runs) { footLines = footLines.concat(W.wrap(runs, CW, FOOT_SIZE)); });
    var footTop = PAGE_H - 9 - footLines.length * lineH(FOOT_SIZE, 1.3);
    var footRule = footTop - 2.5;
    var BOTTOM = footRule - 6;

    function newPage() {
      pdf.addPage();
      W.font(8, false, false, COLOR.muted);
      pdf.text(vm.continuationLabel, ML, 13);
      y = CONT_TOP;
    }

    function fits(h) {
      return y + h <= BOTTOM;
    }

    function setDraw(c, w) {
      pdf.setDrawColor(c[0], c[1], c[2]);
      pdf.setLineWidth(w);
    }

    function setFill(c) {
      pdf.setFillColor(c[0], c[1], c[2]);
    }

    /* ---- En-tête ---- */
    var logoH = 0;
    if (images.logo) {
      var maxW = 40, maxH = 25;
      var ratio = Math.min(maxW / images.logo.w, maxH / images.logo.h);
      var lw = images.logo.w * ratio, lh = images.logo.h * ratio;
      pdf.addImage(images.logo.src, imageFormat(images.logo.src), ML, y, lw, lh, 'logo', 'FAST');
      logoH = lh;
    }
    var rx = PAGE_W - MR;
    W.font(21, true, false, COLOR.blue);
    pdf.text(vm.title, rx, y + 7, { align: 'right' });
    var my = y + 10;
    var metaRuns = [[{ text: 'N° ' }, { text: vm.number || '—', bold: true }]].concat(vm.meta.map(function (m) {
      return [{ text: m.label + ' : ' }, { text: m.value, bold: true }];
    }));
    metaRuns.forEach(function (runs) {
      var l = W.wrap(runs, 100, 10)[0];
      W.drawLine(l, rx - 100, my, 10, { align: 'right', width: 100, color: COLOR.muted, boldColor: COLOR.text });
      my += 4.9;
    });
    y = Math.max(y + logoH, my) + 6;

    /* ---- Émetteur / destinataire ---- */
    function partyColumn(x, label, name, nameSize, sub, lines, lineSize, draw) {
      var yy = y;
      if (draw) { W.font(7.5, true, false, COLOR.blue); pdf.text(label, x, yy + baselineOffset(7.5)); }
      yy += 4.6;
      var nameLines = W.wrap([{ text: name || ' ', bold: true }], COL_W, nameSize);
      if (draw) W.drawLines(nameLines, x, yy, nameSize, { color: COLOR.text });
      yy += nameLines.length * lineH(nameSize) + 0.6;
      if (sub) {
        var subLines = W.wrap([{ text: sub }], COL_W, 8.5, true);
        if (draw) W.drawLines(subLines, x, yy, 8.5, { italic: true, color: COLOR.muted });
        yy += subLines.length * lineH(8.5) + 0.8;
      }
      lines.forEach(function (runs) {
        var ls = W.wrap(runs, COL_W, lineSize);
        if (draw) W.drawLines(ls, x, yy, lineSize, { color: COLOR.text });
        yy += ls.length * lineH(lineSize, 1.3);
      });
      return yy - y;
    }
    var issuerRuns = vm.issuer.lines.map(function (t) { return [{ text: t }]; });
    var hL = partyColumn(ML, 'ÉMETTEUR', vm.issuer.name, 12.5, vm.issuer.brandLine, issuerRuns, 8.6, true);
    var hR = partyColumn(ML + COL_W + GAP, 'DESTINATAIRE', vm.client.name || 'Client à renseigner', 12.5, '', vm.client.lines, 9.5, true);
    y += Math.max(hL, hR) + 4;

    /* ---- Objet ---- */
    if (vm.subject) {
      var sl = W.wrap([{ text: 'Objet : ', bold: true }, { text: vm.subject }], CW - 6, 10);
      var sh = sl.length * lineH(10) + 3.2;
      setFill(COLOR.light); setDraw(COLOR.blue, 0.35);
      pdf.rect(ML, y, CW, sh, 'FD');
      sl.forEach(function (l, i) {
        // "Objet :" en bleu, le reste en couleur texte
        var yy = y + 1.6 + i * lineH(10);
        l.pieces.forEach(function (p) {
          W.font(10, p.bold, false, p.bold && i === 0 && p.x === 0 ? COLOR.blue : COLOR.text);
          pdf.text(p.text, ML + 3 + p.x, yy + baselineOffset(10));
        });
      });
      y += sh + 5;
    }

    /* ---- Tableau des prestations ---- */
    var cols = [{ key: 'desc', title: 'Désignation des prestations', align: 'left' }];
    cols.push({ key: 'qty', title: 'Qté', w: 15, align: 'center' });
    cols.push({ key: 'price', title: 'P.U. HT', w: 25, align: 'right' });
    if (vm.columns.discount) cols.push({ key: 'discount', title: 'Remise', w: 16, align: 'right' });
    if (vm.columns.tax) cols.push({ key: 'tax', title: 'TVA', w: 13, align: 'center' });
    cols.push({ key: 'total', title: 'Total HT', w: 28, align: 'right' });
    var fixed = cols.reduce(function (s, c) { return s + (c.w || 0); }, 0);
    cols[0].w = CW - fixed;
    var cx = ML;
    cols.forEach(function (c) { c.x = cx; cx += c.w; });

    var PAD_X = 2.4, PAD_Y = 1.8, HEAD_H = 7, NUM_SIZE = 9.4;

    function drawTableHeader() {
      setFill(COLOR.blue); setDraw(COLOR.border, 0.25);
      pdf.rect(ML, y, CW, HEAD_H, 'FD');
      cols.forEach(function (c, i) {
        if (i > 0) { setDraw(COLOR.border, 0.25); pdf.line(c.x, y, c.x, y + HEAD_H); }
        W.font(9.5, true, false, COLOR.white);
        var tx = c.align === 'right' ? c.x + c.w - PAD_X : c.align === 'center' ? c.x + c.w / 2 : c.x + PAD_X;
        pdf.text(c.title, tx, y + HEAD_H / 2 + 1.2, { align: c.align === 'left' ? 'left' : c.align });
      });
      y += HEAD_H;
    }

    function rowItems(row) {
      var items = [];
      var descW = cols[0].w - PAD_X * 2;
      row.paragraphs.forEach(function (p, pi) {
        var size = p.title ? 9.8 : (row.paragraphs.length > 1 ? 8.9 : 9.3);
        var ls = W.wrap(p.runs, descW, size);
        ls.forEach(function (l, li) {
          var gap = 0;
          if (li === 0 && pi > 0) gap = row.paragraphs[pi - 1].gapAfter ? 2.4 : 1.0;
          items.push({ line: l, size: size, h: lineH(size, 1.2), gap: gap });
        });
      });
      return items;
    }

    function chunkHeight(items) {
      var h = items.reduce(function (s, it, i) { return s + it.h + (i ? it.gap : 0); }, 0);
      return Math.max(h, lineH(NUM_SIZE)) + PAD_Y * 2;
    }

    function drawRowChunk(row, items, withNumbers) {
      var h = chunkHeight(items);
      setDraw(COLOR.border, 0.25);
      pdf.rect(ML, y, CW, h, 'S');
      cols.forEach(function (c, i) { if (i > 0) pdf.line(c.x, y, c.x, y + h); });
      var yy = y + PAD_Y;
      items.forEach(function (it, i) {
        if (i) yy += it.gap;
        W.drawLine(it.line, cols[0].x + PAD_X, yy, it.size, { color: COLOR.text });
        yy += it.h;
      });
      if (withNumbers && !row.textOnly) {
        var ny = y + h / 2 - lineH(NUM_SIZE) / 2 + baselineOffset(NUM_SIZE);
        cols.slice(1).forEach(function (c) {
          var val = row[c.key];
          if (!val) return;
          var red = row.negative && (c.key === 'price' || c.key === 'total');
          W.font(NUM_SIZE, false, false, red ? COLOR.red : COLOR.text);
          var tx = c.align === 'right' ? c.x + c.w - PAD_X : c.x + c.w / 2;
          pdf.text(val, tx, ny, { align: c.align });
        });
      }
      y += h;
    }

    drawTableHeader();
    vm.rows.forEach(function (row) {
      var items = rowItems(row);
      var full = chunkHeight(items);
      // Une ligne courte n'est jamais coupée ; une ligne haute peut l'être s'il reste de la place
      var canSplit = full > 50 && BOTTOM - y >= 35;
      if (!fits(full) && !canSplit) {
        newPage(); drawTableHeader();
      }
      if (!items.length) { drawRowChunk(row, items, true); return; }
      var idx = 0, first = true;
      while (idx < items.length) {
        var avail = BOTTOM - y - PAD_Y * 2;
        var take = [], h = 0;
        while (idx < items.length) {
          var add = items[idx].h + (take.length ? items[idx].gap : 0);
          if (h + add > avail) break;
          take.push(items[idx]); h += add; idx++;
        }
        if (!take.length) { newPage(); drawTableHeader(); continue; }
        drawRowChunk(row, take, first);
        first = false;
        if (idx < items.length) { newPage(); drawTableHeader(); }
      }
    });
    if (!vm.rows.length) {
      setDraw(COLOR.border, 0.25);
      pdf.rect(ML, y, CW, 9, 'S');
      W.font(9, false, true, COLOR.muted);
      pdf.text('Aucune prestation', ML + PAD_X, y + 5.8);
      y += 9;
    }

    /* ---- Totaux (gardés ensemble, alignés sous la colonne Total HT) ---- */
    var valueW = cols[cols.length - 1].w;
    var labelW = Math.max(46, cols.slice(2, cols.length - 1).reduce(function (s, c) { return s + c.w; }, 0));
    var tx0 = PAGE_W - MR - valueW - labelW;
    var totalsH = vm.totals.reduce(function (s, r) { return s + (r.style === 'grand' ? 7.6 : 6.4); }, 0) + (vm.discountNote ? 5.5 : 0);
    if (!fits(totalsH)) newPage();
    vm.totals.forEach(function (r) {
      var h = r.style === 'grand' ? 7.6 : 6.4;
      var size = r.style === 'grand' ? 10.5 : 9.4;
      var bold = r.style === 'grand' || r.style === 'sub';
      if (r.style === 'grand') setFill(COLOR.blue); else if (r.style === 'sub') setFill(COLOR.light); else setFill(COLOR.white);
      setDraw(COLOR.border, 0.25);
      pdf.rect(tx0, y, labelW, h, 'FD');
      pdf.rect(tx0 + labelW, y, valueW, h, 'FD');
      var color = r.style === 'grand' ? COLOR.white : COLOR.text;
      var by = y + h / 2 - lineH(size) / 2 + baselineOffset(size);
      W.font(size, bold, false, color);
      pdf.text(r.label, tx0 + labelW - PAD_X, by, { align: 'right' });
      W.font(size, bold, false, r.style === 'negative' ? COLOR.red : color);
      pdf.text(r.value, tx0 + labelW + valueW - PAD_X, by, { align: 'right' });
      y += h;
    });
    if (vm.discountNote) {
      W.font(8, false, true, COLOR.muted);
      pdf.text(vm.discountNote, PAGE_W - MR, y + 4, { align: 'right' });
      y += 5.5;
    }

    /* ---- Montant en lettres ---- */
    y += 5;
    var cs = vm.closing;
    var wl = W.wrap([{ text: cs.prefix }, { text: cs.words, bold: true }, { text: cs.suffix, bold: true }], CW - 6, 9.8);
    var wh = wl.length * lineH(9.8) + 4;
    if (!fits(wh)) newPage();
    setFill(COLOR.white); setDraw(COLOR.orange, 0.45);
    pdf.rect(ML, y, CW, wh, 'FD');
    W.drawLines(wl, ML + 3, y + 2, 9.8, { color: COLOR.text });
    y += wh + 6;

    /* ---- Notes / conditions (gauche) · conditions + signature (droite) ---- */
    var ITEM_SIZE = 9, STACK_GAP = 5;
    function blockLayout(block, width) {
      var items = block.items.map(function (runs) { return W.wrap(runs, width - 3.8, ITEM_SIZE); });
      var h = 5.5 + items.reduce(function (s, ls) { return s + ls.length * lineH(ITEM_SIZE) + 0.9; }, 0);
      return { title: block.title.toUpperCase(), items: items, h: h };
    }
    function drawBullet(x, yy) {
      setFill(COLOR.orange);
      pdf.circle(x + 0.9, yy + lineH(ITEM_SIZE) / 2, 0.55, 'F');
    }
    function blockPart(block, width) {
      var lay = blockLayout(block, width);
      return {
        h: lay.h, lay: lay, draw: function (x, y0) {
          var yy = y0;
          W.font(8, true, false, COLOR.blue);
          pdf.text(lay.title, x, yy + baselineOffset(8));
          yy += 5.5;
          lay.items.forEach(function (ls) {
            drawBullet(x, yy);
            W.drawLines(ls, x + 3.8, yy, ITEM_SIZE, { color: COLOR.text });
            yy += ls.length * lineH(ITEM_SIZE) + 0.9;
          });
        }
      };
    }
    function drawBlockFlow(lay) {
      if (!fits(5.5 + lineH(ITEM_SIZE))) newPage();
      W.font(8, true, false, COLOR.blue);
      pdf.text(lay.title, ML, y + baselineOffset(8));
      y += 5.5;
      lay.items.forEach(function (ls) {
        ls.forEach(function (l, i) {
          if (!fits(lineH(ITEM_SIZE))) newPage();
          if (i === 0) drawBullet(ML, y);
          W.drawLine(l, ML + 3.8, y, ITEM_SIZE, { color: COLOR.text });
          y += lineH(ITEM_SIZE);
        });
        y += 0.9;
      });
      y += 4;
    }
    var signaturePart = {
      h: images.stamp ? 37 : 32, draw: function (x, y0) {
        W.font(9.5, false, false, COLOR.text);
        pdf.text(vm.signature.place, x + COL_W / 2, y0 + baselineOffset(9.5), { align: 'center' });
        W.font(9.5, true, false, COLOR.text);
        pdf.text(vm.signature.label, x + COL_W / 2, y0 + 4.8 + baselineOffset(9.5), { align: 'center' });
        if (images.stamp) {
          var r2 = Math.min(58 / images.stamp.w, 26 / images.stamp.h);
          var sw = images.stamp.w * r2, shh = images.stamp.h * r2;
          pdf.addImage(images.stamp.src, imageFormat(images.stamp.src), x + (COL_W - sw) / 2, y0 + 10, sw, shh, 'stamp', 'FAST');
        }
      }
    };
    var acceptancePart = {
      h: 32, draw: function (x, y0) {
        W.font(9.5, true, false, COLOR.text);
        pdf.text('Bon pour accord', x, y0 + baselineOffset(9.5));
        W.font(8.5, false, false, COLOR.muted);
        pdf.text('Date, nom, cachet et signature du client', x, y0 + 4.8 + baselineOffset(8.5));
        setDraw(COLOR.border, 0.25);
        pdf.rect(x, y0 + 10, COL_W - 10, 22, 'S');
      }
    };

    var left = [], right = [];
    var singleFull = vm.blocks.length === 1 && !vm.signature.show && !vm.acceptance;
    if (vm.blocks[0]) left.push(blockPart(vm.blocks[0], singleFull ? CW : COL_W));
    if (vm.blocks[1]) right.push(blockPart(vm.blocks[1], COL_W));
    if (vm.acceptance) left.push(acceptancePart);
    if (vm.signature.show) right.push(signaturePart);
    function stackH(parts) {
      return parts.reduce(function (s, p, i) { return s + p.h + (i ? STACK_GAP : 0); }, 0);
    }
    function drawStack(parts, x, y0) {
      parts.forEach(function (p) { p.draw(x, y0); y0 += p.h + STACK_GAP; });
    }
    var bottomH = Math.max(stackH(left), stackH(right));
    if (bottomH > 0) {
      if (!fits(bottomH) && bottomH <= BOTTOM - CONT_TOP) newPage();
      if (fits(bottomH)) {
        drawStack(left, ML, y);
        drawStack(right, ML + COL_W + GAP, y);
        y += bottomH;
      } else {
        // Notes trop longues pour une page : flux pleine largeur, puis signatures ensemble
        vm.blocks.forEach(function (b) { drawBlockFlow(blockLayout(b, CW)); });
        if (vm.signature.show || vm.acceptance) {
          if (!fits(signaturePart.h)) newPage();
          if (vm.acceptance) acceptancePart.draw(ML, y);
          if (vm.signature.show) signaturePart.draw(ML + COL_W + GAP, y);
          y += signaturePart.h;
        }
      }
    }

    /* ---- Pied de page et numérotation sur chaque page ---- */
    var pages = pdf.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      pdf.setPage(p);
      setDraw(COLOR.blue, 0.4);
      pdf.line(ML, footRule, PAGE_W - MR, footRule);
      footLines.forEach(function (l, i) {
        W.drawLine(l, ML, footTop + i * lineH(FOOT_SIZE, 1.3), FOOT_SIZE, { align: 'center', width: CW, color: COLOR.muted });
      });
      if (pages > 1) {
        W.font(7.5, false, false, COLOR.muted);
        pdf.text('Page ' + p + ' / ' + pages, PAGE_W - MR, footRule - 1.5, { align: 'right' });
      }
    }
    return pdf;
  }

  /** Génère le PDF d'un document. Retourne une promesse de { pdf, fileName }. */
  function generate(doc, settings) {
    settings = settings || App.store.getSettings();
    var vm = App.layout.build(doc, settings);
    return Promise.all([loadImage(vm.logo), loadImage(vm.signature.stamp)]).then(function (imgs) {
      var pdf = render(vm, { logo: imgs[0], stamp: imgs[1] });
      var title = (doc.type === 'facture' ? 'Facture ' : 'Devis ') + doc.number + (doc.client.name ? ' — ' + doc.client.name : '');
      pdf.setProperties({ title: title, author: settings.company.legalName, subject: doc.subject || '', creator: settings.company.legalName + ' — Facturation' });
      if (pdf.setLanguage) pdf.setLanguage('fr-FR');
      return { pdf: pdf, fileName: App.documents.fileName(doc) };
    });
  }

  function download(doc) {
    return generate(doc).then(function (r) { r.pdf.save(r.fileName); return r; });
  }

  function toBlob(doc) {
    return generate(doc).then(function (r) { return { blob: r.pdf.output('blob'), fileName: r.fileName }; });
  }

  /**
   * Imprime exactement le PDF généré : chargé dans un cadre invisible puis envoyé à l'impression
   * (aucune fenêtre pop-up). Repli : nouvel onglet avec impression automatique.
   */
  function print(doc) {
    // En file://, Chrome isole le cadre : on ouvre l'onglet tout de suite (pendant le clic) pour éviter le blocage des pop-ups
    if (location.protocol === 'file:') {
      var win = window.open('', '_blank');
      return generate(doc).then(function (r) {
        if (!win) throw new Error('le navigateur a bloqué l’onglet d’impression. Téléchargez le PDF puis imprimez-le.');
        r.pdf.autoPrint({ variant: 'non-conform' });
        win.location.href = URL.createObjectURL(r.pdf.output('blob'));
        return r;
      }, function (err) { if (win) win.close(); throw err; });
    }
    return generate(doc).then(function (r) {
      var url = URL.createObjectURL(r.pdf.output('blob'));
      var old = document.getElementById('pdf-print-frame');
      if (old) old.remove();
      var frame = document.createElement('iframe');
      frame.id = 'pdf-print-frame';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
      return new Promise(function (resolve, reject) {
        frame.onload = function () {
          setTimeout(function () {
            try {
              frame.contentWindow.focus();
              frame.contentWindow.print();
              resolve(r);
            } catch (e) {
              r.pdf.autoPrint({ variant: 'non-conform' });
              var w = window.open(URL.createObjectURL(r.pdf.output('blob')), '_blank');
              if (w) resolve(r);
              else reject(new Error('le navigateur a bloqué l’impression. Téléchargez le PDF puis imprimez-le.'));
            }
          }, 300);
        };
        frame.src = url;
        document.body.appendChild(frame);
        setTimeout(function () { URL.revokeObjectURL(url); }, 300000);
      });
    });
  }

  /** Affiche le PDF réel dans une visionneuse intégrée (pagination exacte). */
  function show(doc) {
    return generate(doc).then(function (r) {
      var url = URL.createObjectURL(r.pdf.output('blob'));
      var ov = document.createElement('div');
      ov.className = 'overlay pdf-viewer';
      ov.innerHTML = '<div class="pdf-box"><div class="pdf-bar"><b></b><span class="btn-row">' +
        '<button class="btn sm" data-x="dl">Télécharger</button><button class="btn sm" data-x="close">Fermer</button></span></div>' +
        '<iframe title="Aperçu PDF"></iframe></div>';
      ov.querySelector('b').textContent = r.fileName;
      ov.querySelector('iframe').src = url + '#view=FitH';
      function close() {
        ov.remove();
        document.removeEventListener('keydown', onKey);
        URL.revokeObjectURL(url);
      }
      function onKey(e) { if (e.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);
      ov.addEventListener('click', function (e) {
        if (e.target === ov || (e.target.dataset && e.target.dataset.x === 'close')) close();
        if (e.target.dataset && e.target.dataset.x === 'dl') r.pdf.save(r.fileName);
      });
      document.body.appendChild(ov);
      return r;
    });
  }

  App.pdf = { generate: generate, download: download, toBlob: toBlob, print: print, show: show };
})(window.App = window.App || {});
