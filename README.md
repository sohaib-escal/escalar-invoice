# ESCALAR MEDIA — Devis & factures

A small, offline invoicing tool for ESCALAR MEDIA (commercial brand NFC Maroc). HTML, CSS and vanilla JavaScript only: no server, no database, no build step, no account.

## Opening it

**Normal use:** double-click `index.html`. It opens in Chrome and everything works except Google Drive: documents, live preview, PDF download, printing, backup.

**With Google Drive:** Google only allows sign-in from an `http://` address, so serve the folder locally:

```bash
cd "/path/to/this/folder" && python3 -m http.server 8080 --bind 127.0.0.1
```

Then open <http://localhost:8080>. Always use the same address, because browser storage is tied to it. Documents saved under `file://` are not visible at `http://localhost:8080`, and the reverse is also true. To move data between them, use *Exporter mes données* / *Importer une sauvegarde*.

## Using it

- **Documents**: history, search (number or customer), Devis/Factures filter, date sort. Actions: Ouvrir, Dupliquer, PDF, Supprimer (two clicks to confirm).
- **+ Nouveau devis / + Nouvelle facture** opens the editor: the form is on the left and the live A4 preview on the right. On narrow screens they stack.
- **Line descriptions**: the first line is printed in bold as the title, and the following lines are detail text. `**text**` makes text bold. A line with no quantity and no price is printed as a plain text row.
- **Enregistrer le brouillon** (⌘S) saves. *Télécharger le PDF*, *Imprimer* and *Enregistrer sur Google Drive* validate the document first and save it automatically.
- **Aperçu PDF** shows the actual PDF with its exact page breaks. The on-screen preview has the same content and dimensions but is not split into pages.
- **Plus ▾ → Dupliquer / Convertir en facture**: the copy gets a new number. A converted facture keeps a "Réf. devis" pointing to the source devis.
- **Paramètres**: company details, logo, optional stamp image, defaults (TVA, validity, due days, default conditions), numbering prefixes and next number, Google Drive, backup.

## Signature stamp

The ESCALAR MEDIA stamp and signature is built in (`js/assets/stamp.js`, background made transparent). It is printed under "Cachet et signature" on every new document. To leave it off one document, untick *Apposer le cachet et la signature* in the editor. In *Paramètres → Logo et cachet* you can replace it, remove it, or go back to the built-in one.

## Fill the customer from an image (Google Gemini)

In the editor, in the **Client** section, paste a screenshot (⌘V), drag an image onto the box, or click it to choose a file. This works with a business card, letterhead, purchase order, ICE certificate or e-mail signature. Google Gemini reads the image and fills in the company, contact, address, e-mail, phone and ICE / IF. **Annuler** puts back what was there before. Always check the result before sending the document.

Setup (one time):

1. Create an API key at <https://aistudio.google.com/apikey> (free tier available).
2. Paste it in *Paramètres → Remplissage automatique (Google Gemini)*, click **Tester la clé**, then **Enregistrer les paramètres**.
3. Recommended: in Google Cloud Console → Credentials, restrict the key to the "Generative Language API" only. Do **not** add an HTTP-referrer restriction if you open the app by double-clicking `index.html`: `file://` pages send no referrer, so the key would be refused.

Notes:

- Only images you paste or drop are sent, directly to Google's API. Nothing else leaves your computer.
- The key is stored in this browser's localStorage. It is also included in *Exporter mes données*, so keep backup files private.
- The model is `gemini-2.5-flash` by default. If Google retires it, the app automatically switches to the newest available "flash" model. *Tester la clé* shows the models your key can use.
- The ESCALAR MEDIA / NFC Maroc details on a document are ignored: only the customer's details are extracted.

## Calculations

- Amounts are computed in integer centimes and rounded half away from zero to 2 decimals.
- Line: `qty × unit price HT`, minus the line discount %, gives the line total HT. A negative unit price is allowed for discount lines; a negative quantity is not.
- The optional global discount (% or MAD HT) is split across TVA rates in proportion to each rate's base. Any rounding remainder goes to the last rate, so the totals always add up.
- TVA is chosen per line from the Moroccan rates: 20, 14, 10, 7 and 0 %.
- The amount in words is generated in French from the TTC total ("Arrêté le présent devis…" / "Arrêtée la présente facture…").
- Tests: open `tests/index.html` (48 checks covering calculations, amount in words, numbering and file names).

## Numbering

- **Devis:** `D` + year (2 digits) + month + day + a 2-digit counter for that day, for example `D26102101` (first devis of 21/10/2026). The counter restarts at 01 each day.
- **Factures:** `F` + year (2 digits) + month + a 3-digit counter for that month, for example `F2610001`. The counter restarts at 001 each month.
- The day or month comes from the document's issue date.
- A number is used up only when the document is **first saved**. Opening the editor never uses one.
- Deleted numbers are never given out again. Editing a document keeps its number. Duplicating gives the copy a new one.
- **Continuing an existing series:** in *Paramètres → Numérotation*, set "Prochaine facture de <mois>" (for example `4` if you already sent F2610001 to F2610003). The resulting number is shown as you type. You can also type any number directly into a document. If it is higher than the counter, the series continues after it. The app warns you if the number is already used by another saved document.

**Limitation:** counters live in this browser only. Two browsers or two computers each keep their own sequence and can produce the same number, so issue documents from one browser.

## Storage and backup

Everything (documents, counters, settings, logo) is in the browser's `localStorage`. It is lost if you clear site data or uninstall the browser, and it is not visible from another browser or device.

- **Exporter mes données** downloads a JSON backup of all documents, counters and settings.
- **Importer une sauvegarde** validates the file first, then asks for confirmation. Current documents are **replaced**. Counters keep the higher value, so restoring an old backup never reuses numbers.
- PDFs uploaded to Google Drive are copies of the finished documents. They are **not** a backup of the editable records: keep exporting the JSON backup regularly.

## PDF generation

- Library: **jsPDF 2.5.1** (MIT), stored locally in `js/lib/`, so no internet is needed.
- Font: **Carlito** (SIL OFL, metric-compatible with Calibri, the font of the reference devis), embedded in `js/assets/fonts.js` so French accents, `’`, `—`, `«»` and `€` all render correctly.
- The layout is drawn directly in the PDF (`js/pdf.js`), so text is real, selectable and sharp; it is not a screenshot. The renderer:
  - uses A4 portrait;
  - wraps long descriptions and splits very tall rows across pages;
  - repeats the table header on every page;
  - keeps the totals, the amount in words and the signature block each together on one page;
  - puts the legal footer and `Page x / n` on every page.
- The preview (`js/preview.js`) and the PDF are both built from the same data model (`js/layout.js`), so they always show the same information.
- **Imprimer** prints that exact PDF, not the web page.

## Google Drive setup (one time, about 10 minutes)

The app uses Google's browser sign-in (Google Identity Services, token model) and the Drive REST API. It needs **no client secret** and no server.

1. Go to <https://console.cloud.google.com/>, create a project (for example "Facturation ESCALAR").
2. **APIs & Services → Library → Google Drive API → Enable.**
3. **APIs & Services → OAuth consent screen**: user type *External*, fill in the app name and your email. Add the scope `https://www.googleapis.com/auth/drive.file`. Under *Test users*, add your Google account. You can stay in "Testing" mode: you are the only user.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**: type *Web application*. Under **Authorized JavaScript origins**, add `http://localhost:8080` (and `http://127.0.0.1:8080` if you use that address). No redirect URI is needed.
5. Copy the **Client ID** (`…apps.googleusercontent.com`) into *Paramètres → Google Drive* and save.
6. Start the local server (see above), open <http://localhost:8080>, then click *Se connecter et préparer les dossiers*.

What happens next:

- The app creates `Facturation ESCALAR MEDIA/Devis` and `Facturation ESCALAR MEDIA/Factures` in your Drive. If they are deleted, it recreates them.
- Files are named `DEVIS_D26100001_NomClient.pdf` / `FACTURE_F26100001_NomClient.pdf`, with accents and special characters removed. Existing files are never overwritten: a new upload of the same document becomes `…_v2.pdf`, `…_v3.pdf`.
- Permission is `drive.file`: the app can only see files and folders it created itself.
- The access token stays in memory and is never written to localStorage. It expires after about 1 hour, or when you reload the page. Google then asks again, usually with one click.
- Success is reported only after Drive returns the new file's ID. Refused permission, a closed pop-up, an expired session, network errors and API errors each show a clear message. The document always stays saved locally, and the PDF can still be downloaded.

If Drive is not configured, the button explains how to set it up, and you can upload downloaded PDFs to Drive by hand.

## Files

```
index.html            app shell
css/app.css           interface
css/document.css      document preview (same dimensions as the PDF)
js/util.js            formatting, dates, escaping
js/calc.js            calculations (pure, no DOM)
js/words.js           amount in French words
js/store.js           localStorage, backup validation
js/numbering.js       document numbers
js/documents.js       document model, duplication, validation, file names
js/layout.js          shared presentation model (preview + PDF)
js/preview.js         HTML preview
js/pdf.js             PDF renderer (jsPDF)
js/drive.js           Google Drive upload
js/extract.js         customer details from an image (Gemini)
js/ui.js, backup.js, dashboard.js, editor.js, settings.js, app.js   interface
js/lib/jspdf.umd.min.js   jsPDF 2.5.1
js/assets/fonts.js    Carlito (OFL, see Carlito-OFL.txt)
js/assets/logo.js     ESCALAR MEDIA logo (replaceable in Paramètres)
js/assets/stamp.js    ESCALAR MEDIA stamp and signature (replaceable in Paramètres)
tests/                calculation tests
```

## Not included (by design)

No backend, database, accounts, CRM, product catalogue, stock, accounting, payments, e-signature, e-mail or WhatsApp sending, or multi-company support. The image-to-customer feature fills in the current document only; it does not build a customer list. There is also no "choose an existing Drive folder" picker: with the minimal `drive.file` permission, that would need the Google Picker and an extra API key, so the app creates its own folders instead.
