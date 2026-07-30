import { getDemoData } from '../data/demoData.js';
import { getBrowserWindow, notifyLegacy } from '../legacy/legacyApi.js';
import { readJson } from '../utils/storage.js';
import { ETIQUETTE_DK11209, ETIQUETTE_FONTS } from '../utils/etiquettesDlc.js';

// ─────────────────────────────────────────────────────
// PDF & IMPRESSION - Mise en page A4 professionnelle
// ─────────────────────────────────────────────────────

export const pdfUtils = {

  // ─── Chargement à la demande des libs lourdes (html2canvas + jsPDF) ──────
  // Importées dynamiquement pour ne PAS alourdir le bundle des modules qui
  // importent pdfUtils mais n'exportent pas systématiquement en PDF.
  // Les deux libs ne sont nécessaires qu'au moment d'un export/print réel.
  async _loadPdfLibs() {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    return { html2canvas, jsPDF };
  },

  // ─── Override CSS variables en HEX pour le rendu PDF / print ────────────
  // html2canvas v1.4 ne supporte PAS oklch() et plante avec
  // "Attempting to parse an unsupported color function oklch".
  // En redéfinissant les CSS variables au niveau du container (.pdf-render-root),
  // toutes les `var(--text)`, `var(--bg)` etc. utilisées dans les inline styles
  // se résolvent en hex au moment où html2canvas lit les computed styles.
  // Pareil pour la fenêtre d'impression qui n'hérite pas des vars du document parent.
  _getThemeVarOverrides() {
    return `
      .pdf-render-root, .pdf-render-root * {
        --bg: #fbf8f3;
        --bg2: #f5efe4;
        --surface: #ffffff;
        --surface2: #faf5ec;
        --border: #d4c5a8;
        --border2: #c8b994;
        --text: #2c2620;
        --text2: #6b5d4a;
        --text3: #8a7d6a;
        --accent: #003042;
        --accent2: #2e6d84;
        --accent-light: #f5efe4;
        --accent-bd: #d4c5a8;
        --nav: #2c2620;
        --nav-text: rgba(255,255,255,0.7);
        --nav-active: rgba(255,255,255,0.11);
        --nav-border: rgba(255,255,255,0.06);
        --success-bg: #dcfce7;
        --success-bg-soft: #f0fdf4;
        --success-text: #15803d;
        --success-bd: #86efac;
        --success-strong: #16a34a;
        --danger-bg: #fee2e2;
        --danger-bg-soft: #fef2f2;
        --danger-text: #991b1b;
        --danger-bd: #fca5a5;
        --danger-strong: #dc2626;
        --warning-bg: #fef3c7;
        --warning-bg-soft: #fffbeb;
        --warning-text: #92400e;
        --warning-bd: #fcd34d;
        --warning-strong: #f59e0b;
        --info-bg: #dbeafe;
        --info-bg-soft: #eff6ff;
        --info-text: #1e40af;
        --info-bd: #93c5fd;
        --info-strong: #3b82f6;
      }
    `;
  },

  _getPrintStyles(orientation = 'portrait') {
    const isLandscape = orientation === 'landscape';
    // ─── Palette Samper - DA sobre et éditoriale ───
    // Crème (#fbf8f3) en fond, gris pierre (#2c2620) pour le texte,
    // bleu petrole (#2e6d84) pour les filets et accents.
    // Titres en italique serif éditorial (Georgia en fallback web-safe).
    return `
      ${this._getThemeVarOverrides()}
      @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 18mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body {
        font-family: 'Helvetica Neue', 'Inter', Arial, sans-serif;
        color: #2c2620;
        background: #fbf8f3;
        margin: 0; padding: 0;
        font-size: 10pt;
        line-height: 1.5;
      }
      .pdf-header {
        display: flex; justify-content: space-between; align-items: flex-start;
        border-bottom: 1px solid #2e6d84;
        padding-bottom: 14px; margin-bottom: 22px;
      }
      .pdf-brand { display: flex; align-items: center; gap: 14px; }
      .pdf-logo {
        width: 44px; height: 44px; border-radius: 8px;
        background: #003042; color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 14pt; letter-spacing: 1.2px;
        overflow: hidden;
      }
      .pdf-logo img { width: 100%; height: 100%; object-fit: cover; }
      .pdf-brand-text .pdf-brand-name { font-size: 12pt; font-weight: 700; color: #2c2620; letter-spacing: 0.2px; }
      .pdf-brand-text .pdf-brand-sub { font-size: 8.5pt; color: #8a7d6a; margin-top: 2px; font-style: italic; }
      .pdf-meta { text-align: right; font-size: 9pt; color: #8a7d6a; }
      .pdf-meta-title {
        font-family: Georgia, 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 17pt; font-weight: 600;
        color: #2c2620; margin-bottom: 4px;
        letter-spacing: 0.2px;
      }
      .pdf-meta-etab { font-weight: 600; color: #2e6d84; margin-top: 6px; letter-spacing: 0.3px; }
      h1, h2, h3 { color: #2c2620; margin: 0 0 10px 0; page-break-after: avoid; }
      h1 {
        font-family: Georgia, 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 18pt; font-weight: 600;
      }
      h2 {
        font-family: Georgia, serif;
        font-size: 12pt; font-weight: 700;
        margin-top: 18px;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: #2e6d84;
        border-bottom: 0.5px solid #d4c5a8;
        padding-bottom: 4px;
      }
      h3 { font-size: 10.5pt; font-weight: 600; margin-top: 12px; color: #2c2620; }
      p { margin: 0 0 8px 0; }
      strong { font-weight: 600; color: #2c2620; }
      em { font-style: italic; color: #6b5d4a; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; page-break-inside: auto; }
      thead { display: table-header-group; background: transparent; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      th {
        text-align: left; font-size: 8.5pt; font-weight: 700;
        color: #2e6d84; text-transform: uppercase; letter-spacing: 0.8px;
        padding: 8px 8px 6px; border-bottom: 1px solid #2e6d84;
      }
      td { padding: 7px 8px; font-size: 10pt; border-bottom: 0.5px solid #e8dfcd; color: #2c2620; }
      .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin: 12px 0 18px; }
      .kpi-card { border: 0.5px solid #d4c5a8; border-radius: 4px; padding: 12px 14px; background: rgba(255,255,255,0.5); }
      .kpi-label { font-size: 7.5pt; font-weight: 700; color: #8a7d6a; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 5px; }
      .kpi-value { font-family: Georgia, serif; font-size: 15pt; font-weight: 600; color: #2c2620; }
      .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 8pt; font-weight: 600; background: rgba(46,109,132,0.12); color: #1e4d63; border: 0.5px solid #d4c5a8; }
      .section { margin-bottom: 20px; page-break-inside: avoid; }

      /* ─── Sublimer les cartes / sections existantes du DOM cloné ────
         Les composants React utilisent inline background: var(--surface)
         qui se résout maintenant en #ffffff via _getThemeVarOverrides.
         On donne un look "carte" subtil à tout div qui a un background
         ou un border inline, pour rendre la structure visible en print. */
      .pdf-content > div { margin-bottom: 12px; }
      .pdf-content div[style*="border"][style*="radius"] {
        border-color: #d4c5a8 !important;
        background: rgba(255,255,255,0.6) !important;
      }
      /* Liens et accents : conserver la couleur Samper */
      .pdf-content a { color: #003042; text-decoration: none; }
      ul, ol { margin: 4px 0 12px 20px; padding: 0; }
      li { margin-bottom: 4px; font-size: 10pt; }
      .no-print, button, .pls-tabs, [class*="no-print"] { display: none !important; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      /* Planning grid pour l'impression */
      [id*="planning-print"] > div > div:nth-child(1) { font-size: 14pt; font-weight: 700; margin-bottom: 8px; }
      /* Input affiché comme texte */
      input, select, textarea { border: none !important; background: transparent !important; padding: 0 !important; font: inherit; color: inherit; }
      input[type="date"], input[type="time"] { font-weight: 600; }
      /* Couleurs de statut préservées */
      [style*="background: #dcfce7"] { background: #dcfce7 !important; color: #15803d !important; }
      [style*="background: #fef9c3"] { background: #fef9c3 !important; color: #92400e !important; }
      [style*="background: #fee2e2"] { background: #fee2e2 !important; color: #dc2626 !important; }
      [style*="background: #e0f2fe"] { background: #e0f2fe !important; color: #0369a1 !important; }
    `;
  },

  _getHeaderHTML(title, etablissement) {
    // Le logo vient de l'établissement (DB) avec fallback sur l'ancien localStorage
    // pour les utilisateurs qui n'ont pas encore migré.
    const logo = etablissement?.logo_url
      || (() => { try { return readJson('sc_app_logo', null); } catch { return null; } })();
    const logoContent = logo
      ? `<div class="pdf-logo"><img src="${logo}" alt="logo"/></div>`
      : `<div class="pdf-logo">SC</div>`;
    const dateFmt = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });
    const etabName = etablissement?.nom || '';
    const etabAdresse = etablissement?.adresse || '';

    return `
      <div class="pdf-header">
        <div class="pdf-brand">
          ${logoContent}
          <div class="pdf-brand-text">
            <div class="pdf-brand-name">Samper Consulting</div>
            <div class="pdf-brand-sub">Gestion culinaire professionnelle</div>
          </div>
        </div>
        <div class="pdf-meta">
          <div class="pdf-meta-title">${title}</div>
          <div>${dateFmt}</div>
          ${etabName ? `<div class="pdf-meta-etab">${etabName}</div>` : ''}
          ${etabAdresse ? `<div style="font-size:8pt;">${etabAdresse}</div>` : ''}
        </div>
      </div>
    `;
  },

  _getCurrentEtablissement() {
    // L'établissement courant est désormais en DB (user_settings).
    // On lit la préférence DB si dispo, sinon fallback localStorage legacy, sinon premier de la liste.
    // Cette fonction reste synchrone : elle utilise DEMO_DATA hydraté + un fallback rapide.
    try {
      const etabId = readJson('sc_current_etab', null); // legacy fallback
      if (etabId) {
        const found = getDemoData().etablissements.find(e => e.id === etabId);
        if (found) return found;
      }
    } catch {}
    return getDemoData().etablissements[0];
  },

  _prepareClone(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.no-print, button').forEach(el => el.remove());
    clone.querySelectorAll('input, select, textarea').forEach(el => {
      const span = document.createElement('span');
      const val = el.tagName === 'SELECT'
        ? (el.options[el.selectedIndex]?.textContent || el.value || '')
        : (el.value || el.textContent || '');
      span.textContent = val;
      span.style.cssText = 'font-weight: 600;';
      el.replaceWith(span);
    });
    // Pas de strip des inline styles : les var() utilisées dans le DOM cloné
    // se résoudront via _getThemeVarOverrides() qui redéfinit ces vars en HEX
    // au niveau du container .pdf-render-root.
    return clone;
  },

  // ── IMPRESSION DIRECTE
  printElement(elementId, title = 'Document', options = {}) {
    const element = document.getElementById(elementId);
    if (!element) {
      notifyLegacy('Zone à imprimer introuvable : ' + elementId, 'error');
      return;
    }

    const etab = options.etablissement || this._getCurrentEtablissement();
    const orientation = options.orientation || 'portrait';
    const noBrand = !!options.noBrandHeader;
    const noHeader = !!options.noHeader;
    const printWindow = getBrowserWindow()?.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) { notifyLegacy('Impossible d’ouvrir la fenêtre d’impression.', 'error'); return; }
    const clone = this._prepareClone(element);

    // noHeader = aucun en-tête du tout (le contenu cloné parle de lui-même)
    // noBrand = un mini-header sobre avec juste titre + date, sans logo Samper
    // par défaut = full header avec brand Samper + meta
    let headerHTML = '';
    if (!noHeader) {
      headerHTML = noBrand
        ? `<div style="margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #d4c8a0;"><div style="font-size:16pt;font-weight:700;font-family:Georgia,serif;color:#333;">${title}</div>${etab?.nom ? `<div style="font-size:10pt;color:#666;margin-top:2px;">${etab.nom}${etab.adresse ? ' - ' + etab.adresse : ''}</div>` : ''}<div style="font-size:9pt;color:#888;margin-top:2px;">${new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>`
        : this._getHeaderHTML(title, etab);
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8"/>
        <title>${title}</title>
        <style>${this._getPrintStyles(orientation)}</style>
      </head>
      <body class="pdf-render-root">
        ${headerHTML}
        <div class="pdf-content">${clone.innerHTML}</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500);
  },

  // ── EXPORT PDF
  async exportElementToPdf(elementId, fileName = 'document.pdf', options = {}) {
    const element = document.getElementById(elementId);
    if (!element) { notifyLegacy('Zone à exporter introuvable : ' + elementId, 'error'); return; }

    const title = options.title || fileName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
    const etab = options.etablissement || this._getCurrentEtablissement();
    const orientation = options.orientation || 'portrait';
    const noBrand = !!options.noBrandHeader;
    const noHeader = !!options.noHeader;
    const fitOnePage = !!options.fitOnePage;

    const container = document.createElement('div');
    container.className = 'pdf-render-root';
    container.style.cssText = `
      position: fixed; left: -9999px; top: 0;
      width: ${orientation === 'landscape' ? '1120px' : '794px'};
      background: #fff; padding: 40px;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      z-index: -1;
    `;

    const clone = this._prepareClone(element);
    let headerHTML = '';
    if (!noHeader) {
      headerHTML = noBrand
        ? `<div style="margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #d4c8a0;"><div style="font-size:15pt;font-weight:700;font-family:Georgia,serif;color:#333;">${title}</div>${etab?.nom ? `<div style="font-size:9pt;color:#666;margin-top:2px;">${etab.nom}${etab.adresse ? ' - ' + etab.adresse : ''}</div>` : ''}<div style="font-size:8pt;color:#888;margin-top:2px;">${new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>`
        : this._getHeaderHTML(title, etab);
    }

    container.innerHTML = `
      <style>${this._getPrintStyles(orientation)}</style>
      ${headerHTML}
      <div class="pdf-content">${clone.innerHTML}</div>
    `;
    document.body.appendChild(container);

    try {
      const { html2canvas, jsPDF } = await this._loadPdfLibs();
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fbf8f3',
        logging: false,
      });

      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error('Le rendu HTML→Canvas a produit une image vide. Vérifie que la zone à exporter contient du contenu visible.');
      }

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF(orientation === 'landscape' ? 'l' : 'p', 'mm', 'a4');
      const pageWidth = orientation === 'landscape' ? 297 : 210;
      const pageHeight = orientation === 'landscape' ? 210 : 297;
      const margin = 10;
      const imgWidth = pageWidth - margin * 2;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (fitOnePage) {
        const availableHeight = pageHeight - margin * 2 - 8;
        if (imgHeight > availableHeight) {
          const scale = availableHeight / imgHeight;
          const finalWidth = imgWidth * scale;
          const finalHeight = availableHeight;
          const xOffset = margin + (imgWidth - finalWidth) / 2;
          pdf.addImage(imgData, 'PNG', xOffset, margin, finalWidth, finalHeight);
        } else {
          pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
        }
      } else {
        let heightLeft = imgHeight;
        let position = margin;
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - margin * 2);

        while (heightLeft > 0) {
          position = margin - (imgHeight - heightLeft);
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
          heightLeft -= (pageHeight - margin * 2);
        }
      }

      if (!noHeader) {
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          pdf.setPage(i);
          pdf.setFontSize(7.5);
          pdf.setTextColor(138, 125, 106);
          if (noBrand) {
            pdf.text(totalPages > 1 ? `${i} / ${totalPages}` : '', margin, pageHeight - 6);
          } else {
            pdf.text(`Samper Consulting · ${i} / ${totalPages}`, margin, pageHeight - 6);
          }
          pdf.text(new Date().toLocaleDateString('fr-CH'), pageWidth - margin, pageHeight - 6, { align: 'right' });
        }
      }

      pdf.save(fileName);
    } catch (err) {
      console.error('[pdf exportElementToPdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    } finally {
      try { document.body.removeChild(container); } catch (e) { /* déjà retiré */ }
    }
  },

  // ── EXPORT PDF en Blob (pour upload programmatique)
  async elementToBlobPDF(elementId, options = {}) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error('Zone à exporter introuvable : ' + elementId);

    const title = options.title || 'Document';
    const etab = options.etablissement || this._getCurrentEtablissement();
    const orientation = options.orientation || 'portrait';
    const noBrand = !!options.noBrandHeader;
    const noHeader = !!options.noHeader;
    const fitOnePage = !!options.fitOnePage;

    const container = document.createElement('div');
    container.className = 'pdf-render-root';
    container.style.cssText = `
      position: fixed; left: -9999px; top: 0;
      width: ${orientation === 'landscape' ? '1120px' : '794px'};
      background: #fff; padding: 40px;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      z-index: -1;
    `;

    const clone = this._prepareClone(element);
    let headerHTML = '';
    if (!noHeader) {
      headerHTML = noBrand
        ? `<div style="margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #d4c8a0;"><div style="font-size:15pt;font-weight:700;font-family:Georgia,serif;color:#333;">${title}</div>${etab?.nom ? `<div style="font-size:9pt;color:#666;margin-top:2px;">${etab.nom}${etab.adresse ? ' - ' + etab.adresse : ''}</div>` : ''}<div style="font-size:8pt;color:#888;margin-top:2px;">${new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>`
        : this._getHeaderHTML(title, etab);
    }

    container.innerHTML = `
      <style>${this._getPrintStyles(orientation)}</style>
      ${headerHTML}
      <div class="pdf-content">${clone.innerHTML}</div>
    `;
    document.body.appendChild(container);

    try {
      const { html2canvas, jsPDF } = await this._loadPdfLibs();
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fbf8f3',
        logging: false,
      });

      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error('Le rendu HTML→Canvas a produit une image vide.');
      }

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF(orientation === 'landscape' ? 'l' : 'p', 'mm', 'a4');
      const pageWidth = orientation === 'landscape' ? 297 : 210;
      const pageHeight = orientation === 'landscape' ? 210 : 297;
      const margin = 10;
      const imgWidth = pageWidth - margin * 2;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (fitOnePage) {
        const availableHeight = pageHeight - margin * 2 - 8;
        if (imgHeight > availableHeight) {
          const scale = availableHeight / imgHeight;
          const finalWidth = imgWidth * scale;
          const finalHeight = availableHeight;
          const xOffset = margin + (imgWidth - finalWidth) / 2;
          pdf.addImage(imgData, 'PNG', xOffset, margin, finalWidth, finalHeight);
        } else {
          pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
        }
      } else {
        let heightLeft = imgHeight;
        let position = margin;
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - margin * 2);

        while (heightLeft > 0) {
          position = margin - (imgHeight - heightLeft);
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
          heightLeft -= (pageHeight - margin * 2);
        }
      }

      if (!noHeader) {
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          pdf.setPage(i);
          pdf.setFontSize(7.5);
          pdf.setTextColor(138, 125, 106);
          if (noBrand) {
            pdf.text(totalPages > 1 ? `${i} / ${totalPages}` : '', margin, pageHeight - 6);
          } else {
            pdf.text(`Samper Consulting · ${i} / ${totalPages}`, margin, pageHeight - 6);
          }
          pdf.text(new Date().toLocaleDateString('fr-CH'), pageWidth - margin, pageHeight - 6, { align: 'right' });
        }
      }

      // Retourne le PDF sous forme de Blob (pas de download)
      return pdf.output('blob');
    } catch (err) {
      console.error('[pdf elementToBlobPDF]', err);
      throw err;
    } finally {
      try { document.body.removeChild(container); } catch (e) { /* déjà retiré */ }
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // FICHE RECETTE - génération jsPDF NATIVE (vectorielle, 1 page A4)
  // ───────────────────────────────────────────────────────────────
  // Une fiche recette est un document texte à structure fixe : on la
  // génère en vectoriel plutôt qu'en capture html2canvas. Bénéfices :
  // net à l'impression, 1 page A4 garantie (fit-to-page), identique
  // desktop/mobile (ne lit plus le DOM écran), insensible au crash
  // oklch de html2canvas. jsPDF reste lazy-loaded (sans html2canvas).
  // Réservé à la fiche recette individuelle - les autres exports
  // (POS, J6b…) continuent d'utiliser exportElementToPdf.
  // ═══════════════════════════════════════════════════════════════

  async _loadJsPdf() {
    const { jsPDF } = await import('jspdf');
    return jsPDF;
  },

  // Logo établissement → dataURL pour doc.addImage (jsPDF n'accepte pas
  // une URL distante directement). Échec silencieux : la fiche reste
  // propre sans logo (seul le nom de l'établissement subsiste).
  async _resolveLogoDataUrl(etablissement) {
    const src = etablissement?.logo_url
      || (() => { try { return readJson('sc_app_logo', null); } catch { return null; } })();
    if (!src || typeof src !== 'string') return null;
    if (src.startsWith('data:')) return src;
    const win = getBrowserWindow();
    if (!win || typeof win.Image === 'undefined') return null;
    return new Promise((resolve) => {
      try {
        const img = new win.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = win.document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch { resolve(null); } // canvas « tainted » (CORS) → on abandonne le logo
        };
        img.onerror = () => resolve(null);
        img.src = src;
      } catch { resolve(null); }
    });
  },

  // Point d'entrée public. `recette` est un objet déjà normalisé par le
  // module appelant (plat, famille, metaCells, ingredients, etapes,
  // notes, allergenesText) : la logique de rôle (food cost consultant)
  // et la résolution des allergènes restent côté module.
  // options : { etablissement, accent?, autoPrint?, filename?, logoDataUrl? }
  async exportRecettePdf(recette, options = {}) {
    try {
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = this._buildRecettePDF(jsPDF, recette, { ...options, etablissement: etab, logoDataUrl });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'fiche-recette.pdf');
      } else {
        doc.save(options.filename || 'fiche-recette.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportRecettePdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  // Export GROUPÉ : plusieurs fiches recette dans un seul PDF (1 fiche = 1 page A4).
  // Utilisé par « Export multiple » (un plat = toutes ses recettes, ou une sélection).
  async exportRecettesPdf(recettes, options = {}) {
    try {
      const list = (recettes || []).filter(Boolean);
      if (!list.length) { notifyLegacy('Aucune fiche à exporter.', 'warning'); return null; }
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      list.forEach((rec, i) => {
        if (i > 0) doc.addPage();
        this._renderRecettePage(doc, rec, { ...options, etablissement: etab, logoDataUrl, pageNum: i + 1, pageCount: list.length });
      });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'fiches-recettes.pdf');
      } else {
        doc.save(options.filename || 'fiches-recettes.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportRecettesPdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // ÉTIQUETTES DLC - poste d'étiquetage (onglet Étiquettes du module HACCP)
  // ───────────────────────────────────────────────────────────────
  // Une étiquette = UNE page à la dimension exacte du media (défaut :
  // Brother DK-11209, 62 × 29 mm). Jamais une page longue contenant
  // plusieurs étiquettes : sur rouleau prédécoupé, le cutter couperait
  // une seule fois et sortirait un ruban d'étiquettes attachées.
  // Texte vectoriel natif, jsPDF lazy-loadé, aucun html2canvas.
  // Les dimensions viennent de utils/etiquettesDlc.js - rien en dur ici.
  //
  // etiquettes : [{ lignes: [{ role, text?, segments?, bold? }] }]
  //   role 'nom' | 'dlc' | 'corps' choisit la police, le contenu est
  //   construit par le module (lignesEtiquette).
  // options : { format?, autoPrint?, filename?, onProgress? }
  // ═══════════════════════════════════════════════════════════════
  async exportEtiquettesDlcPdf(etiquettes, options = {}) {
    try {
      const list = (etiquettes || []).filter(e => e && Array.isArray(e.lignes) && e.lignes.length);
      if (!list.length) { notifyLegacy('Aucune étiquette à générer.', 'warning'); return null; }
      const cfg = { ...ETIQUETTE_DK11209, ...(options.format || {}) };
      const format = [cfg.widthMm, cfg.heightMm];
      const jsPDF = await this._loadJsPdf();
      const doc = new jsPDF({ unit: 'mm', format, orientation: 'landscape' });
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

      for (let i = 0; i < list.length; i += 1) {
        if (i > 0) doc.addPage(format, 'landscape');
        this._renderEtiquetteDlc(doc, list[i], cfg);
        // Génération synchrone : on rend la main au navigateur par paquets pour
        // que l'indicateur de progression s'affiche réellement sur un gros lot.
        if (onProgress && (i % 20 === 19 || i === list.length - 1)) {
          onProgress(i + 1, list.length);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      const filename = options.filename || 'etiquettes-dlc.pdf';
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        // Popup bloquée (ou pas de window) : on retombe sur le téléchargement,
        // l'impression AirPrint se fait alors depuis le fichier.
        const opened = win ? win.open(url, '_blank') : null;
        if (!opened) doc.save(filename);
      } else {
        doc.save(filename);
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportEtiquettesDlcPdf]', err);
      notifyLegacy('Génération des étiquettes échouée : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  // Rend UNE étiquette sur la page courante. Les lignes sont ajustées à la
  // largeur imprimable (paliers de police puis troncature) et réparties
  // verticalement sur la hauteur restante : le mode Surgélation, six lignes sur
  // 29 mm, sert de calibre.
  _renderEtiquetteDlc(doc, etiquette, cfg) {
    const MM_PER_PT = 0.3528;
    const LINE_FACTOR = 1.15;   // interligne relatif au corps de police
    const SEGMENT_GAP = 3;      // mm entre température et mention en gras
    const F = ETIQUETTE_FONTS;
    const m = cfg.marginMm;
    const usableW = cfg.widthMm - 2 * m;
    const usableH = cfg.heightMm - 2 * m;

    doc.setTextColor(0, 0, 0);

    const widthAt = (text, size, bold) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      return doc.getTextWidth(text);
    };

    // Tronque au plancher de police : la lisibilité à bout de bras dans une
    // chambre froide passe avant la complétude du texte.
    // Marque de troncature en points ASCII et NON '…' : jsPDF mesure bien
    // l'ellipsie Unicode mais la supprime au rendu avec les polices standard
    // (vérifié : 'X…Y' sort '(XY) Tj'), on perdrait le marqueur en silence.
    const ELLIPSIS = '...';
    const truncate = (text, size, bold) => {
      if (widthAt(text, size, bold) <= usableW) return text;
      let cut = text;
      while (cut.length > 1 && widthAt(cut.trimEnd() + ELLIPSIS, size, bold) > usableW) cut = cut.slice(0, -1);
      return cut.trimEnd() + ELLIPSIS;
    };

    // Chaque ligne : segments + taille de police retenue.
    const lignes = etiquette.lignes.map((l) => {
      const segments = (Array.isArray(l.segments) ? l.segments : [{ text: l.text, bold: l.bold }])
        .map(s => ({ text: pdfSafeText(s.text || ''), bold: !!(s.bold ?? l.bold) }))
        .filter(s => s.text !== '');
      const measure = (size) => segments.reduce(
        (w, s, i) => w + widthAt(s.text, size, s.bold) + (i > 0 ? SEGMENT_GAP : 0), 0);

      if (l.role === 'nom') {
        const size = F.nomLadder.find(s => measure(s) <= usableW) ?? F.nomLadder[F.nomLadder.length - 1];
        const fitted = measure(size) <= usableW
          ? segments
          : segments.map(s => ({ ...s, text: truncate(s.text, size, s.bold) }));
        return { segments: fitted, size };
      }

      // Lignes de corps et de DLC : on descend par demi-point jusqu'au plancher.
      let size = l.role === 'dlc' ? F.dlc : F.ligne;
      while (size > F.min && measure(size) > usableW) size -= 0.5;
      const fitted = measure(size) <= usableW
        ? segments
        : segments.map(s => ({ ...s, text: truncate(s.text, size, s.bold) }));
      return { segments: fitted, size };
    }).filter(l => l.segments.length);

    if (!lignes.length) return;

    // Répartition verticale : hauteur restante distribuée uniformément, ce qui
    // absorbe la différence entre un mode à cinq lignes et un à six.
    const hauteurs = lignes.map(l => l.size * MM_PER_PT * LINE_FACTOR);
    const totalTexte = hauteurs.reduce((s, h) => s + h, 0);
    const gap = Math.max(0, (usableH - totalTexte) / lignes.length);

    let y = m;
    lignes.forEach((l, i) => {
      y += hauteurs[i] * 0.8 + gap / 2;   // baseline
      let x = m;
      l.segments.forEach((s, j) => {
        doc.setFont('helvetica', s.bold ? 'bold' : 'normal');
        doc.setFontSize(l.size);
        doc.text(s.text, x, y);
        if (j < l.segments.length - 1) x += doc.getTextWidth(s.text) + SEGMENT_GAP;
      });
      y += hauteurs[i] * 0.2 + gap / 2;
    });
  },

  _buildRecettePDF(jsPDF, recette, options = {}) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    this._renderRecettePage(doc, recette, options);
    return doc;
  },

  // Rend UNE fiche recette sur la page courante de `doc`. Pour un export
  // multi-fiches, l'appelant fait doc.addPage() entre chaque appel.
  // options.pageNum / options.pageCount alimentent la pagination du pied.
  _renderRecettePage(doc, recette, options = {}) {
    const MM_PER_PT = 0.3528;
    const {
      logoDataUrl = null,
      accent = [0, 48, 66], // Bleu petrole Samper #003042 - charte app (défaut, hex/rgb jamais oklch)
    } = options;
    const etablissement = pdfSafeText((options.etablissement?.nom || 'Samper Consulting').toString());
    const pageNum = options.pageNum || 1;
    const pageCount = options.pageCount || 1;

    const plat       = pdfSafeText((recette.plat || recette.nom || 'Recette').toString().trim());
    const famille    = pdfSafeText((recette.famille || recette.categorie || '').toString().trim());
    const allergenes = pdfSafeText((recette.allergenesText || recette.allergenes || 'Aucun').toString().trim()) || 'Aucun';
    const metaCells  = (Array.isArray(recette.metaCells) ? recette.metaCells.filter(c => c && c.k && c.v) : [])
      .map(c => ({ k: pdfSafeText(c.k), v: pdfSafeText(c.v) }));
    const notes      = (Array.isArray(recette.notes)
      ? recette.notes.filter(n => n && n.label && n.text && String(n.text).trim())
      : []).map(n => ({ label: pdfSafeText(n.label), text: pdfSafeText(n.text) }));

    const ingredients = normalizeIngredients(recette.ingredients)
      .map(ing => ({ ...ing, nom: pdfSafeText(ing.nom), unite: pdfSafeText(ing.unite), qte: pdfSafeText(ing.qte) }));
    const etapes      = normalizeSteps(recette.etapes || recette.process || recette.steps).map(pdfSafeText);

    const PAGE_W = 210, PAGE_H = 297, M = 15;
    const contentW = PAGE_W - 2 * M;
    const headerH = 12, footerH = 15;

    const ACC  = accent;
    const INK  = [26, 26, 28];
    const MUTE = [121, 124, 126];
    const HAIR = [215, 220, 224];

    // ---- Géométrie verticale (sans collision) ----
    const ruleTopY  = M + headerH;
    const titleY    = ruleTopY + 10;
    const tUnderY   = titleY + 2.6;
    const familleY  = tUnderY + 5;
    const metaTop   = familleY + 3.5;
    const metaH     = 11;
    const bodyTop   = metaTop + metaH + 5;
    const bodyBottom = PAGE_H - M - footerH;
    const bodyH = bodyBottom - bodyTop;

    // ---- Colonnes : gauche 40 % (ingrédients + notes), droite 58 % (process) ----
    const gutter = 7;
    const colLW = contentW * 0.40;
    const colRW = contentW - colLW - gutter;
    const colLX = M;
    const colRX = M + colLW + gutter;

    // ---- Fit-to-page : corps 10 pt → -0,25 pt jusqu'à tenir, plancher 7 pt ----
    const LINE_FACTOR = 1.28;
    const BODY_MIN = 7;
    let body = 10;
    let geom = layoutGeom(body);
    let L = measure(body, geom);
    while (L.maxColH > bodyH && body > BODY_MIN) {
      body -= 0.25;
      geom = layoutGeom(body);
      L = measure(body, geom);
    }

    function layoutGeom(fontPt) {
      const lineMm = fontPt * MM_PER_PT * LINE_FACTOR;
      const headPt = Math.min(fontPt + 1, 10.5);
      const headMm = headPt * MM_PER_PT * 1.3 + 2.5;
      const pastD  = Math.max(3.2, fontPt * 0.52);
      const pastInset = pastD + 2.5;
      const numPt  = Math.max(6, fontPt * 0.82);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(fontPt);
      let qtyW = 0;
      ingredients.forEach((ing) => {
        const q = ing.qte ? `${ing.qte}${ing.unite ? ' ' + ing.unite : ''}` : '';
        qtyW = Math.max(qtyW, doc.getTextWidth(q));
      });
      qtyW = Math.min(qtyW + 2.5, 22);
      return { lineMm, headPt, headMm, pastD, pastInset, numPt, qtyW };
    }

    function measure(fontPt, g) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(fontPt);
      // Colonne gauche : ingrédients (hanging indent) + notes (dressage/conservation)
      let leftH = g.headMm;
      ingredients.forEach((ing) => {
        const nameLines = doc.splitTextToSize(ing.nom || '', colLW - g.qtyW);
        leftH += Math.max(1, nameLines.length) * g.lineMm;
      });
      notes.forEach((n) => {
        const t = doc.splitTextToSize(String(n.text), colLW);
        leftH += 4 + g.headMm + t.length * g.lineMm;
      });
      // Colonne droite : étapes avec pastilles
      let rightH = g.headMm;
      etapes.forEach((s) => {
        const lines = doc.splitTextToSize(s, colRW - g.pastInset);
        const txtH = lines.length * g.lineMm;
        rightH += Math.max(g.pastD, txtH) + 2.4;
      });
      return { fontPt, ...g, maxColH: Math.max(leftH, rightH) };
    }

    // ---------- RENDU ----------
    // En-tete : logo + etablissement (accent, capitales espacees)
    if (logoDataUrl) {
      try {
        const fmt = logoDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
        doc.addImage(logoDataUrl, fmt, M, M - 1, 20, headerH);
      } catch (e) { /* logo illisible, ignore */ }
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ACC);
    doc.text(etablissement.toUpperCase(), PAGE_W - M, M + 6, { align: 'right', charSpace: 0.4 });
    doc.setDrawColor(...ACC); doc.setLineWidth(0.8);
    doc.line(M, ruleTopY, PAGE_W - M, ruleTopY);

    // Titre + soulignement accent, auto-reduit s'il est long
    let tSize = 21;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(tSize);
    while (doc.getTextWidth(plat) > contentW && tSize > 13) { tSize -= 0.5; doc.setFontSize(tSize); }
    doc.setTextColor(...INK);
    doc.text(plat, M, titleY);
    doc.setDrawColor(...ACC); doc.setLineWidth(1.2);
    doc.line(M, tUnderY, M + 26, tUnderY);
    if (famille) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...MUTE);
      doc.text(famille.toUpperCase(), M, familleY, { charSpace: 0.6 });
    }

    // Bandeau métadonnées - N cellules égales, séparateurs fins
    if (metaCells.length) {
      const cellW = contentW / metaCells.length;
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.3);
      doc.line(M, metaTop, M + contentW, metaTop);
      doc.line(M, metaTop + metaH, M + contentW, metaTop + metaH);
      metaCells.forEach((c, i) => {
        const cx = M + i * cellW + 3;
        if (i > 0) { doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M + i * cellW, metaTop + 1.5, M + i * cellW, metaTop + metaH - 1.5); }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...ACC);
        doc.text(String(c.k), cx, metaTop + 4.3, { charSpace: 0.5 });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK);
        doc.text(String(c.v), cx, metaTop + 9, { maxWidth: cellW - 5 });
      });
    }

    // Helper titre de section : carré accent + label espacé + filet
    function sectionHead(label, x, yy, w, g) {
      doc.setFillColor(...ACC);
      doc.rect(x, yy - 2.2, 2, 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(g.headPt); doc.setTextColor(...ACC);
      doc.text(label, x + 3.4, yy, { charSpace: 0.5 });
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.3);
      doc.line(x, yy + 2, x + w, yy + 2);
      return yy + g.headMm;
    }

    // Colonne gauche - INGRÉDIENTS (quantité accent gras + nom, hanging indent)
    let ly = bodyTop + L.headPt * MM_PER_PT;
    ly = sectionHead('INGRÉDIENTS', colLX, ly, colLW, L);
    ingredients.forEach((ing) => {
      const q = ing.qte ? `${ing.qte}${ing.unite ? ' ' + ing.unite : ''}` : '';
      if (q) { doc.setFont('helvetica', 'bold'); doc.setFontSize(L.fontPt); doc.setTextColor(...ACC); doc.text(q, colLX, ly); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(L.fontPt); doc.setTextColor(...INK);
      const nameLines = doc.splitTextToSize(ing.nom || '', colLW - L.qtyW);
      nameLines.forEach((line, k) => { doc.text(line, colLX + L.qtyW, ly + k * L.lineMm); });
      ly += Math.max(1, nameLines.length) * L.lineMm;
    });

    // Notes (Dressage / Conservation) sous les ingrédients
    notes.forEach((n) => {
      ly += 4;
      ly = sectionHead(String(n.label).toUpperCase(), colLX, ly, colLW, L);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(L.fontPt); doc.setTextColor(...INK);
      doc.splitTextToSize(String(n.text), colLW).forEach((line) => { doc.text(line, colLX, ly); ly += L.lineMm; });
    });

    // Colonne droite - PROCESS avec pastilles rondes numérotées
    let ry = bodyTop + L.headPt * MM_PER_PT;
    ry = sectionHead('PROCESS', colRX, ry, colRW, L);
    etapes.forEach((s, i) => {
      const lines = doc.splitTextToSize(s, colRW - L.pastInset);
      const txtH = lines.length * L.lineMm;
      const rowH = Math.max(L.pastD, txtH);
      const cx = colRX + L.pastD / 2;
      const cy = ry + L.pastD / 2 - 0.3;
      doc.setFillColor(...ACC); doc.circle(cx, cy, L.pastD / 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(L.numPt); doc.setTextColor(255, 255, 255);
      doc.text(String(i + 1), cx, cy + L.numPt * MM_PER_PT * 0.36, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(L.fontPt); doc.setTextColor(...INK);
      lines.forEach((line, k) => { doc.text(line, colRX + L.pastInset, ry + L.lineMm * 0.78 + k * L.lineMm); });
      ry += rowH + 2.4;
    });

    // Séparateur vertical entre colonnes
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.2);
    doc.line(colRX - gutter / 2, bodyTop, colRX - gutter / 2, bodyBottom);

    // Pied : filet accent + ALLERGENES + signature etablissement, date, page
    const fRule = PAGE_H - M - footerH;
    doc.setDrawColor(...ACC); doc.setLineWidth(0.8);
    doc.line(M, fRule, PAGE_W - M, fRule);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...ACC);
    doc.text('ALLERGÈNES', M, fRule + 4.5, { charSpace: 0.5 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...INK);
    doc.text(allergenes, M + 22, fRule + 4.5, { maxWidth: contentW - 24 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTE);
    const dateStr = new Date().toLocaleDateString('fr-CH');
    doc.text(etablissement, M, fRule + 10);
    doc.text(`${dateStr}   ·   ${pageNum}/${pageCount}`, PAGE_W - M, fRule + 10, { align: 'right' });
  },

  // ═══════════════════════════════════════════════════════════════
  // LISTE DE COMMANDE - génération jsPDF native (vectorielle, DA Samper)
  // Bon de commande propre, multi-pages, dans la charte (bleu petrole #003042,
  // titre serif, sections par catégorie, cases à cocher). Cohérent avec
  // la fiche recette plutôt qu'une capture html2canvas de l'écran.
  // payload : { groups:[{categorie, items:[{nom, besoinText, qtyText, coche}]}], totalCount, cocheCount }
  // options : { etablissement, autoPrint, filename, logoDataUrl }
  // ═══════════════════════════════════════════════════════════════
  async exportCommandePdf(payload, options = {}) {
    try {
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      this._renderCommande(doc, payload || {}, { ...options, etablissement: etab, logoDataUrl });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'liste-commande.pdf');
      } else {
        doc.save(options.filename || 'liste-commande.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportCommandePdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  _renderCommande(doc, payload, options = {}) {
    const ACC = [0, 48, 66];   // bleu petrole Samper
    const INK = [26, 26, 28];
    const MUTE = [121, 124, 126];
    const HAIR = [215, 220, 224];
    const PAGE_W = 210, PAGE_H = 297, M = 15;
    const contentW = PAGE_W - 2 * M;
    const headerH = 12;
    const etabName = (options.etablissement?.nom || 'Samper Consulting').toString();
    const logoDataUrl = options.logoDataUrl || null;
    const groups = Array.isArray(payload.groups) ? payload.groups : [];
    const totalCount = payload.totalCount != null ? payload.totalCount : groups.reduce((s, g) => s + (g.items?.length || 0), 0);
    const cocheCount = payload.cocheCount || 0;
    const cartesLabel = (payload.cartesLabel || '').toString().trim();
    const dateStr = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });

    // Colonnes calquees sur la liste de reference : ingredient a gauche, colonne
    // « Commande » a droite (case a cocher + espace pour ecrire la quantite a la
    // main). Aucun grammage recommande : ce sont les cuisiniers qui saisissent.
    const boxSize = 3.8;
    const checkRight = PAGE_W - M;         // bord droit de la case a cocher
    const checkX = checkRight - boxSize;   // coin gauche de la case
    const qtyRight = checkX - 4;           // quantite saisie, alignee a droite de la case
    const nomX = M;
    const nomMaxW = qtyRight - nomX - 20;  // laisse la place a la quantite manuscrite
    const bodyBottom = PAGE_H - M - 12;

    const drawHeader = () => {
      if (logoDataUrl) {
        try {
          const fmt = logoDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
          doc.addImage(logoDataUrl, fmt, M, M - 1, 20, headerH);
        } catch (e) { /* logo illisible */ }
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ACC);
      doc.text(etabName.toUpperCase(), PAGE_W - M, M + 6, { align: 'right', charSpace: 0.4 });
      const ruleTopY = M + headerH;
      doc.setDrawColor(...ACC); doc.setLineWidth(0.8); doc.line(M, ruleTopY, PAGE_W - M, ruleTopY);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...INK);
      doc.text('Liste de commande', M, ruleTopY + 9);
      doc.setDrawColor(...ACC); doc.setLineWidth(1.2); doc.line(M, ruleTopY + 11.5, M + 26, ruleTopY + 11.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTE);
      doc.text(`${dateStr}  ·  ${totalCount} produit${totalCount > 1 ? 's' : ''}  ·  ${cocheCount} coché${cocheCount > 1 ? 's' : ''}`, M, ruleTopY + 17);
      if (cartesLabel) {
        const line = doc.splitTextToSize(`Cartes : ${cartesLabel}`, contentW)[0];
        doc.setFontSize(7.5); doc.setTextColor(...ACC);
        doc.text(line, M, ruleTopY + 21.5);
        return ruleTopY + 29;
      }
      return ruleTopY + 25;
    };
    const drawFooter = () => {
      const fy = PAGE_H - M - 4;
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, fy - 3, PAGE_W - M, fy - 3);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTE);
      doc.text('Samper Consulting', M, fy);
      doc.text(dateStr, PAGE_W - M, fy, { align: 'right' });
    };

    let y = drawHeader();
    const ensureSpace = (h) => {
      if (y + h > bodyBottom) { drawFooter(); doc.addPage(); y = drawHeader(); }
    };
    const colLabels = () => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...MUTE);
      doc.text('INGRÉDIENT', nomX, y, { charSpace: 0.4 });
      doc.text('COMMANDE', checkRight, y, { align: 'right', charSpace: 0.4 });
      y += 4;
    };

    if (!groups.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTE);
      doc.text('Aucun produit dans la liste.', M, y + 4);
    }

    groups.forEach((group) => {
      ensureSpace(16);
      doc.setFillColor(...ACC); doc.rect(M, y - 2.2, 2, 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ACC);
      doc.text(String(group.categorie || 'Autres'), M + 3.4, y);
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, y + 2, M + contentW, y + 2);
      y += 7;
      colLabels();

      (group.items || []).forEach((it) => {
        const nameLines = doc.splitTextToSize(String(it.nom || ''), nomMaxW);
        const rowH = Math.max(7, nameLines.length * 4.6 + 2.4);
        ensureSpace(rowH);
        const boxY = y - 3;
        // Nom de l'ingredient a gauche
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK);
        nameLines.forEach((line, k) => doc.text(line, nomX, y + k * 4.6));
        // Quantite saisie (si renseignee) a gauche de la case ; sinon espace vierge a remplir
        if (it.qtyText) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK);
          doc.text(String(it.qtyText), qtyRight, y, { align: 'right' });
        }
        // Case a cocher a droite (colonne « Commande »)
        if (it.coche) {
          doc.setFillColor(...ACC); doc.setDrawColor(...ACC); doc.setLineWidth(0.3);
          doc.rect(checkX, boxY, boxSize, boxSize, 'F');
          doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5);
          doc.line(checkX + 0.9, boxY + 2.0, checkX + 1.6, boxY + 2.9);
          doc.line(checkX + 1.6, boxY + 2.9, checkX + 3.1, boxY + 1.1);
        } else {
          doc.setDrawColor(...MUTE); doc.setLineWidth(0.3); doc.rect(checkX, boxY, boxSize, boxSize, 'S');
        }
        doc.setDrawColor(...HAIR); doc.setLineWidth(0.15);
        doc.line(nomX, y + rowH - 3.2, checkRight, y + rowH - 3.2);
        y += rowH;
      });
      y += 3;
    });

    drawFooter();
    // Pagination centrée, ajoutée une fois le nombre total de pages connu.
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTE);
      doc.text(`${i} / ${totalPages}`, PAGE_W / 2, PAGE_H - M - 4, { align: 'center' });
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // MISE EN PLACE - liste de production (jsPDF natif, vectoriel, DA Samper)
  // Deux sections : Urgent (non congelable) en PREMIER, puis Grosse production.
  // Cases a cocher imprimees, multi-pages A4. Document lisible comme ecrit a la
  // main : pas de capitales criardes sur les titres de section, pas de tirets
  // cadratins, pas de marqueur genere.
  // payload : { titre, sousTitre, sections:[{ titre, hint, items:[{label, qtyText, aQualifier, fait}] }] }
  // options : { etablissement, autoPrint, filename, logoDataUrl }
  // ═══════════════════════════════════════════════════════════════
  async exportMepPdf(payload, options = {}) {
    try {
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      this._renderMep(doc, payload || {}, { ...options, etablissement: etab, logoDataUrl });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'mise-en-place.pdf');
      } else {
        doc.save(options.filename || 'mise-en-place.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportMepPdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  _renderMep(doc, payload, options = {}) {
    const ACC = [0, 48, 66];    // bleu petrole Samper
    const INK = [26, 26, 28];
    const MUTE = [121, 124, 126];
    const HAIR = [215, 220, 224];
    const WARN = [176, 96, 0];  // ambre discret pour « a qualifier »
    const PAGE_W = 210, PAGE_H = 297, M = 15;
    const contentW = PAGE_W - 2 * M;
    const headerH = 12;
    const etabName = (options.etablissement?.nom || 'Samper Consulting').toString();
    const logoDataUrl = options.logoDataUrl || null;
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    const totalCount = sections.reduce((s, g) => s + (g.items?.length || 0), 0);
    const faitCount = sections.reduce((s, g) => s + (g.items || []).filter(i => i.fait).length, 0);
    const titre = (payload.titre || 'Liste de mise en place').toString();
    const sousTitre = (payload.sousTitre || '').toString().trim();
    const dateStr = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });

    // Meme visuel que la liste de commande : preparation a gauche, colonne « fait »
    // (case a cocher) a droite, quantite cible juste a gauche de la case.
    const boxSize = 3.8;
    const checkRight = PAGE_W - M;
    const checkX = checkRight - boxSize;
    const qtyRight = checkX - 4;
    const nomX = M;
    const nomMaxW = qtyRight - nomX - 24;
    const bodyBottom = PAGE_H - M - 12;

    const drawHeader = () => {
      if (logoDataUrl) {
        try {
          const fmt = logoDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
          doc.addImage(logoDataUrl, fmt, M, M - 1, 20, headerH);
        } catch (e) { /* logo illisible */ }
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ACC);
      doc.text(etabName.toUpperCase(), PAGE_W - M, M + 6, { align: 'right', charSpace: 0.4 });
      const ruleTopY = M + headerH;
      doc.setDrawColor(...ACC); doc.setLineWidth(0.8); doc.line(M, ruleTopY, PAGE_W - M, ruleTopY);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...INK);
      doc.text(titre, M, ruleTopY + 9);
      doc.setDrawColor(...ACC); doc.setLineWidth(1.2); doc.line(M, ruleTopY + 11.5, M + 26, ruleTopY + 11.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTE);
      const meta = `${sousTitre ? sousTitre + '  ·  ' : ''}${totalCount} préparation${totalCount > 1 ? 's' : ''}  ·  ${faitCount} faite${faitCount > 1 ? 's' : ''}`;
      doc.text(meta, M, ruleTopY + 17);
      return ruleTopY + 25;
    };
    const drawFooter = () => {
      const fy = PAGE_H - M - 4;
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, fy - 3, PAGE_W - M, fy - 3);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTE);
      doc.text('Samper Consulting', M, fy);
      doc.text(dateStr, PAGE_W - M, fy, { align: 'right' });
    };

    let y = drawHeader();
    const ensureSpace = (h) => {
      if (y + h > bodyBottom) { drawFooter(); doc.addPage(); y = drawHeader(); }
    };

    if (!totalCount) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTE);
      doc.text('Aucune préparation dans cette liste.', M, y + 4);
    }

    sections.forEach((section) => {
      if (!(section.items || []).length) return;
      ensureSpace(18);
      doc.setFillColor(...ACC); doc.rect(M, y - 2.2, 2, 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ACC);
      doc.text(String(section.titre || ''), M + 3.4, y);
      y += 4.5;
      if (section.hint) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(...MUTE);
        doc.text(String(section.hint), M + 3.4, y);
        y += 2.5;
      }
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, y, M + contentW, y);
      y += 5;

      (section.items || []).forEach((it) => {
        const nameLines = doc.splitTextToSize(String(it.label || ''), nomMaxW);
        const rowH = Math.max(7, nameLines.length * 4.6 + 2.4);
        ensureSpace(rowH);
        const boxY = y - 3;
        // Nom de la preparation a gauche
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK);
        nameLines.forEach((line, k) => doc.text(line, nomX, y + k * 4.6));
        if (it.aQualifier) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...WARN);
          doc.text('à qualifier', nomX + doc.getTextWidth(nameLines[0]) + 3, y);
        }
        // Quantite cible (si renseignee) a gauche de la case
        if (it.qtyText) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK);
          doc.text(String(it.qtyText), qtyRight, y, { align: 'right' });
        }
        // Case a cocher a droite
        if (it.fait) {
          doc.setFillColor(...ACC); doc.setDrawColor(...ACC); doc.setLineWidth(0.3);
          doc.rect(checkX, boxY, boxSize, boxSize, 'F');
          doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5);
          doc.line(checkX + 0.9, boxY + 2.0, checkX + 1.6, boxY + 2.9);
          doc.line(checkX + 1.6, boxY + 2.9, checkX + 3.1, boxY + 1.1);
        } else {
          doc.setDrawColor(...MUTE); doc.setLineWidth(0.3); doc.rect(checkX, boxY, boxSize, boxSize, 'S');
        }
        doc.setDrawColor(...HAIR); doc.setLineWidth(0.15);
        doc.line(nomX, y + rowH - 3.2, checkRight, y + rowH - 3.2);
        y += rowH;
      });
      y += 4;
    });

    drawFooter();
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTE);
      doc.text(`${i} / ${totalPages}`, PAGE_W / 2, PAGE_H - M - 4, { align: 'center' });
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // REGISTRE HACCP - relevés de température (jsPDF natif, vectoriel)
  // Journalier ou mensuel : le payload arrive déjà groupé par jour.
  // Généré en vectoriel (pas de capture html2canvas) : lignes jamais
  // coupées entre deux pages, en-têtes répétés, anomalies en rouge -
  // document présentable lors d'un contrôle d'hygiène. Même DA que la
  // fiche recette et la liste de commande (bleu pétrole #003042).
  // payload : { periodeLabel, stats:{total,conformes,anomalies,taux},
  //   days:[{ dateLabel, rows:[{zone,heure,valeur,operateur,conforme,commentaire}] }] }
  // options : { etablissement, autoPrint, filename, logoDataUrl }
  // ═══════════════════════════════════════════════════════════════
  async exportHaccpRelevesPdf(payload, options = {}) {
    try {
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      this._renderHaccpReleves(doc, payload || {}, { ...options, etablissement: etab, logoDataUrl });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'releves-haccp.pdf');
      } else {
        doc.save(options.filename || 'releves-haccp.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportHaccpRelevesPdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  _renderHaccpReleves(doc, payload, options = {}) {
    const ACC = [0, 48, 66];      // bleu pétrole Samper
    const INK = [26, 26, 28];
    const MUTE = [121, 124, 126];
    const HAIR = [215, 220, 224];
    const OK = [21, 128, 61];     // conforme (--success-text)
    const KO = [220, 38, 38];     // anomalie (--danger-strong)
    const PAGE_W = 210, PAGE_H = 297, M = 15;
    const contentW = PAGE_W - 2 * M;
    const headerH = 12;
    const etabName = pdfSafeText((options.etablissement?.nom || 'Samper Consulting').toString());
    const logoDataUrl = options.logoDataUrl || null;
    const periodeLabel = pdfSafeText((payload.periodeLabel || '').toString());
    const stats = payload.stats || null;
    const days = (Array.isArray(payload.days) ? payload.days : []).map(d => ({
      dateLabel: pdfSafeText((d.dateLabel || '').toString()),
      rows: (d.rows || []).map(r => ({
        zone: pdfSafeText((r.zone || '').toString()),
        heure: pdfSafeText((r.heure || '').toString()),
        valeur: pdfSafeText((r.valeur || '').toString()),
        operateur: pdfSafeText((r.operateur || '').toString()),
        conforme: !!r.conforme,
        commentaire: pdfSafeText((r.commentaire || '').toString()),
      })),
    }));
    const dateStr = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });

    // Colonnes : Zone | Heure | Valeur (droite) | Opérateur | Statut | Commentaire
    const zoneX = M,        zoneW = 40;
    const heureX = M + 43;
    const valRight = M + 71;
    const opX = M + 75,     opW = 27;
    const statutX = M + 105;
    const commX = M + 126,  commW = contentW - 126;
    const bodyBottom = PAGE_H - M - 12;
    const LINE_H = 4.3;

    const drawHeader = () => {
      if (logoDataUrl) {
        try {
          const fmt = logoDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
          doc.addImage(logoDataUrl, fmt, M, M - 1, 20, headerH);
        } catch (e) { /* logo illisible */ }
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ACC);
      doc.text(etabName.toUpperCase(), PAGE_W - M, M + 6, { align: 'right', charSpace: 0.4 });
      const ruleTopY = M + headerH;
      doc.setDrawColor(...ACC); doc.setLineWidth(0.8); doc.line(M, ruleTopY, PAGE_W - M, ruleTopY);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...INK);
      doc.text('Relevés de température', M, ruleTopY + 9);
      doc.setDrawColor(...ACC); doc.setLineWidth(1.2); doc.line(M, ruleTopY + 11.5, M + 26, ruleTopY + 11.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ACC);
      doc.text(periodeLabel, M, ruleTopY + 17);
      if (stats && stats.total != null) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTE);
        doc.text(
          `${stats.total} relevé${stats.total > 1 ? 's' : ''}  ·  ${stats.conformes} conforme${stats.conformes > 1 ? 's' : ''}  ·  ${stats.anomalies} anomalie${stats.anomalies > 1 ? 's' : ''}  ·  taux de conformité ${stats.taux}%`,
          M, ruleTopY + 21.5,
        );
        return ruleTopY + 28;
      }
      return ruleTopY + 23;
    };
    const drawFooter = () => {
      const fy = PAGE_H - M - 4;
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, fy - 3, PAGE_W - M, fy - 3);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTE);
      doc.text('Registre HACCP - Samper Consulting', M, fy);
      doc.text(dateStr, PAGE_W - M, fy, { align: 'right' });
    };

    let y = drawHeader();
    const ensureSpace = (h, onNewPage) => {
      if (y + h > bodyBottom) {
        drawFooter(); doc.addPage(); y = drawHeader();
        if (onNewPage) onNewPage();
      }
    };
    const colLabels = () => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...MUTE);
      doc.text('ZONE', zoneX, y, { charSpace: 0.4 });
      doc.text('HEURE', heureX, y, { charSpace: 0.4 });
      doc.text('VALEUR', valRight, y, { align: 'right', charSpace: 0.4 });
      doc.text('OPÉRATEUR', opX, y, { charSpace: 0.4 });
      doc.text('STATUT', statutX, y, { charSpace: 0.4 });
      doc.text('COMMENTAIRE', commX, y, { charSpace: 0.4 });
      y += 4;
    };
    // En-tête de journée (répété avec « (suite) » quand un jour continue sur la page suivante)
    const dayHead = (label, suite = false) => {
      doc.setFillColor(...ACC); doc.rect(M, y - 2.2, 2, 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ACC);
      doc.text((label + (suite ? ' (suite)' : '')).toUpperCase(), M + 3.4, y, { charSpace: 0.5 });
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, y + 2, M + contentW, y + 2);
      y += 7;
      colLabels();
    };

    if (!days.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTE);
      doc.text('Aucun relevé pour cette période.', M, y + 4);
    }

    days.forEach((day) => {
      ensureSpace(20);
      dayHead(day.dateLabel);
      day.rows.forEach((r) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        const zoneLines = doc.splitTextToSize(r.zone || '-', zoneW);
        doc.setFontSize(8.5);
        const opLines = doc.splitTextToSize(r.operateur || '-', opW);
        const commLines = doc.splitTextToSize(r.commentaire || '-', commW);
        const nLines = Math.max(zoneLines.length, opLines.length, commLines.length, 1);
        const rowH = Math.max(6, nLines * LINE_H + 1.7);
        ensureSpace(rowH, () => dayHead(day.dateLabel, true));
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK);
        zoneLines.forEach((l, k) => doc.text(l, zoneX, y + k * LINE_H));
        doc.setFontSize(9); doc.setTextColor(...MUTE);
        doc.text(r.heure || '-', heureX, y);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        doc.setTextColor(...(r.conforme ? OK : KO));
        doc.text(r.valeur || '-', valRight, y, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTE);
        opLines.forEach((l, k) => doc.text(l, opX, y + k * LINE_H));
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        doc.setTextColor(...(r.conforme ? OK : KO));
        doc.text(r.conforme ? 'Conforme' : 'Anomalie', statutX, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        doc.setTextColor(...(r.commentaire ? (r.conforme ? INK : KO) : MUTE));
        commLines.forEach((l, k) => doc.text(l, commX, y + k * LINE_H));
        doc.setDrawColor(...HAIR); doc.setLineWidth(0.15);
        doc.line(M, y + rowH - 3.2, M + contentW, y + rowH - 3.2);
        y += rowH;
      });
      y += 4;
    });

    // Visa du responsable : attendu sur un registre officiel présenté en contrôle
    if (days.length) {
      ensureSpace(18);
      y += 6;
      doc.setDrawColor(...MUTE); doc.setLineWidth(0.3);
      doc.line(PAGE_W - M - 60, y, PAGE_W - M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTE);
      doc.text('Date et visa du responsable', PAGE_W - M, y + 3.5, { align: 'right' });
    }

    drawFooter();
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTE);
      doc.text(`${i} / ${totalPages}`, PAGE_W / 2, PAGE_H - M - 4, { align: 'center' });
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // EXÉCUTION DE SOP / CHECKLIST - génération jsPDF native
  // Rapport d'audit d'une checklist exécutée : qui, quand, quelles
  // étapes validées et - surtout - lesquelles ne l'ont pas été. Même
  // DA que les relevés HACCP (bleu petrole, filets fins, visa en pied)
  // puisque c'est le même usage : un document présenté en contrôle.
  // payload : {
  //   titre, categorie, dateLabel, heureDebut, heureFin, operateur,
  //   statutLabel, statutOk, total, cochees, notes,
  //   sections: [{ titre, etapes: [{ label, critique, cochee, heure, note }] }]
  // }
  // options : { etablissement, autoPrint, filename, logoDataUrl }
  // ═══════════════════════════════════════════════════════════════
  async exportSopExecutionPdf(payload, options = {}) {
    try {
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      this._renderSopExecution(doc, payload || {}, { ...options, etablissement: etab, logoDataUrl });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'checklist.pdf');
      } else {
        doc.save(options.filename || 'checklist.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportSopExecutionPdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  _renderSopExecution(doc, payload, options = {}) {
    const ACC = [0, 48, 66];      // bleu petrole Samper
    const INK = [26, 26, 28];
    const MUTE = [121, 124, 126];
    const HAIR = [215, 220, 224];
    const OK = [21, 128, 61];
    const KO = [220, 38, 38];
    const PAGE_W = 210, PAGE_H = 297, M = 15;
    const contentW = PAGE_W - 2 * M;
    const headerH = 12;
    const etabName = pdfSafeText((options.etablissement?.nom || 'Samper Consulting').toString());
    const logoDataUrl = options.logoDataUrl || null;

    const titre      = pdfSafeText((payload.titre || 'Checklist').toString());
    const categorie  = pdfSafeText((payload.categorie || '').toString());
    const dateLabel  = pdfSafeText((payload.dateLabel || '').toString());
    const heureDebut = pdfSafeText((payload.heureDebut || '-').toString());
    const heureFin   = pdfSafeText((payload.heureFin || '-').toString());
    const operateur  = pdfSafeText((payload.operateur || '-').toString());
    const statutLabel = pdfSafeText((payload.statutLabel || '').toString());
    const notes      = pdfSafeText((payload.notes || '').toString());
    const total   = Number(payload.total) || 0;
    const cochees = Number(payload.cochees) || 0;
    const taux    = total > 0 ? Math.round(cochees / total * 100) : 0;
    // statutOk : true = conforme (vert), false = anomalie (rouge), null = neutre
    const statutColor = payload.statutOk === true ? OK : payload.statutOk === false ? KO : MUTE;
    const sections = (Array.isArray(payload.sections) ? payload.sections : []).map(s => ({
      titre: pdfSafeText((s.titre || '').toString()),
      etapes: (s.etapes || []).map(e => ({
        label: pdfSafeText((e.label || '').toString()),
        note: pdfSafeText((e.note || '').toString()),
        heure: pdfSafeText((e.heure || '').toString()),
        critique: !!e.critique,
        cochee: !!e.cochee,
      })),
    }));
    const dateStr = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });

    // Colonnes : [case] Libellé de l'étape ......... CRITIQUE  heure de validation
    const boxSize = 3.8;
    const labelX = M + 6.5;
    const heureRight = PAGE_W - M;
    const critiqueRight = heureRight - 13;
    const labelW = contentW - 6.5 - 33;
    const bodyBottom = PAGE_H - M - 12;
    const LINE_H = 4.3;

    // L'en-tête est répété sur chaque page : un rapport d'audit doit être
    // identifiable page par page, même si les feuilles sont séparées.
    const drawHeader = () => {
      if (logoDataUrl) {
        try {
          const fmt = logoDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
          doc.addImage(logoDataUrl, fmt, M, M - 1, 20, headerH);
        } catch (e) { /* logo illisible */ }
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ACC);
      doc.text(etabName.toUpperCase(), PAGE_W - M, M + 6, { align: 'right', charSpace: 0.4 });
      const ruleTopY = M + headerH;
      doc.setDrawColor(...ACC); doc.setLineWidth(0.8); doc.line(M, ruleTopY, PAGE_W - M, ruleTopY);

      let ty = ruleTopY + 9;
      let tSize = 18;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(tSize); doc.setTextColor(...INK);
      while (doc.getTextWidth(titre) > contentW && tSize > 11) { tSize -= 0.5; doc.setFontSize(tSize); }
      doc.text(titre, M, ty);
      doc.setDrawColor(...ACC); doc.setLineWidth(1.2); doc.line(M, ty + 2.5, M + 26, ty + 2.5);

      ty += 8;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ACC);
      doc.text(dateLabel + (categorie ? `   ·   ${categorie}` : ''), M, ty);

      ty += 4.5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTE);
      doc.text(`${heureDebut} -> ${heureFin}   ·   Opérateur : ${operateur}`, M, ty);

      ty += 4.5;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...statutColor);
      doc.text(statutLabel, M, ty);
      const statutW = doc.getTextWidth(statutLabel);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTE);
      doc.text(`   ·   ${cochees}/${total} étape${total > 1 ? 's' : ''} validée${cochees > 1 ? 's' : ''} (${taux}%)`, M + statutW, ty);

      return ty + 7;
    };
    const drawFooter = () => {
      const fy = PAGE_H - M - 4;
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, fy - 3, PAGE_W - M, fy - 3);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTE);
      doc.text('Checklist SOP - Samper Consulting', M, fy);
      doc.text(dateStr, PAGE_W - M, fy, { align: 'right' });
    };

    let y = drawHeader();
    const ensureSpace = (h, onNewPage) => {
      if (y + h > bodyBottom) {
        drawFooter(); doc.addPage(); y = drawHeader();
        if (onNewPage) onNewPage();
      }
    };
    // Titre de section, répété avec « (suite) » quand elle déborde sur la page suivante
    const sectionHead = (sec, suite = false) => {
      const done = sec.etapes.filter(e => e.cochee).length;
      doc.setFillColor(...ACC); doc.rect(M, y - 2.2, 2, 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ACC);
      doc.text(((sec.titre || 'Étapes') + (suite ? ' (suite)' : '')).toUpperCase(), M + 3.4, y, { charSpace: 0.5 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTE);
      doc.text(`${done}/${sec.etapes.length}`, PAGE_W - M, y, { align: 'right' });
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, y + 2, M + contentW, y + 2);
      y += 7;
    };

    if (!sections.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTE);
      doc.text('Cette procédure ne contient aucune étape.', M, y + 4);
    }

    sections.forEach((sec) => {
      ensureSpace(18);
      sectionHead(sec);
      sec.etapes.forEach((et) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        const lines = doc.splitTextToSize(et.label || '-', labelW);
        const noteLines = et.note ? doc.splitTextToSize(et.note, labelW) : [];
        const rowH = Math.max(6.5, (lines.length + noteLines.length) * LINE_H + 2);
        ensureSpace(rowH, () => sectionHead(sec, true));

        // Case à cocher : pleine (accent + coche blanche) si validée, vide sinon
        const boxY = y - 3;
        if (et.cochee) {
          doc.setFillColor(...ACC); doc.setDrawColor(...ACC); doc.setLineWidth(0.3);
          doc.rect(M, boxY, boxSize, boxSize, 'F');
          doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5);
          doc.line(M + 0.9, boxY + 2.0, M + 1.6, boxY + 2.9);
          doc.line(M + 1.6, boxY + 2.9, M + 3.1, boxY + 1.1);
        } else {
          doc.setDrawColor(...(et.critique ? KO : MUTE)); doc.setLineWidth(0.3);
          doc.rect(M, boxY, boxSize, boxSize, 'S');
        }

        // Une étape critique non validée est le signal d'audit : elle passe en rouge.
        const manqueCritique = et.critique && !et.cochee;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        doc.setTextColor(...(manqueCritique ? KO : INK));
        lines.forEach((l, k) => doc.text(l, labelX, y + k * LINE_H));

        if (et.critique) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...KO);
          doc.text('CRITIQUE', critiqueRight, y, { align: 'right', charSpace: 0.3 });
        }
        if (et.cochee && et.heure) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTE);
          doc.text(et.heure, heureRight, y, { align: 'right' });
        }
        if (noteLines.length) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...MUTE);
          noteLines.forEach((l, k) => doc.text(l, labelX, y + (lines.length + k) * LINE_H));
        }

        doc.setDrawColor(...HAIR); doc.setLineWidth(0.15);
        doc.line(M, y + rowH - 3.2, M + contentW, y + rowH - 3.2);
        y += rowH;
      });
      y += 4;
    });

    // Notes de l'exécution (anomalies relevées par l'opérateur)
    if (notes) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const noteLines = doc.splitTextToSize(notes, contentW);
      ensureSpace(12 + noteLines.length * LINE_H);
      doc.setFillColor(...ACC); doc.rect(M, y - 2.2, 2, 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ACC);
      doc.text('NOTES DE L\'OPÉRATEUR', M + 3.4, y, { charSpace: 0.5 });
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, y + 2, M + contentW, y + 2);
      y += 7;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK);
      noteLines.forEach((l) => { doc.text(l, M, y); y += LINE_H; });
      y += 2;
    }

    // Visa du responsable : attendu sur un document présenté en contrôle
    ensureSpace(18);
    y += 6;
    doc.setDrawColor(...MUTE); doc.setLineWidth(0.3);
    doc.line(PAGE_W - M - 60, y, PAGE_W - M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTE);
    doc.text('Date et visa du responsable', PAGE_W - M, y + 3.5, { align: 'right' });

    drawFooter();
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTE);
      doc.text(`${i} / ${totalPages}`, PAGE_W / 2, PAGE_H - M - 4, { align: 'center' });
    }
  },
};

// ─── Assainissement texte pour jsPDF ────────────────────────────────
// jsPDF + police standard helvetica n'encode que le jeu cp1252 (Latin-1 + extras
// Windows). Les symboles hors de ce jeu (≈, ≤, ≥, flèches, fractions Unicode…)
// ressortent en charabia (ex. « ≈ » affiché « "H »). On les remplace par un
// équivalent ASCII lisible, et on translittère le reste plutôt que de corrompre.
const PDF_CHAR_REPLACEMENTS = {
  '≈': '~', '≃': '~', '≅': '~', '∼': '~',
  '≤': '<=', '≥': '>=', '≠': '#', '≡': '=',
  '√': 'racine', '∞': 'infini', '∑': 'somme', '∆': 'delta', '∂': 'd',
  '→': '->', '←': '<-', '↔': '<->', '↑': 'haut', '↓': 'bas', '⇒': '=>',
  '⅓': '1/3', '⅔': '2/3', '⅕': '1/5', '⅖': '2/5', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
  '′': "'", '″': '"', '‴': "'''",
  '−': '-', '‐': '-', '‑': '-', '‒': '-', '⁄': '/',
  '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x', '★': '*', '☆': '*', '●': '-', '◦': '-',
};

// Codepoints Unicode > 0xFF mais représentables en cp1252 (à conserver tels quels).
const CP1252_EXTRA = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
]);

function pdfSafeText(value) {
  if (value == null) return '';
  return String(value).replace(/[^\x00-\x7F]/g, (ch) => {
    if (Object.prototype.hasOwnProperty.call(PDF_CHAR_REPLACEMENTS, ch)) return PDF_CHAR_REPLACEMENTS[ch];
    const cp = ch.codePointAt(0);
    if (cp <= 0xFF || CP1252_EXTRA.has(cp)) return ch; // accents FR & extras cp1252 : OK
    const stripped = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return /^[\x20-\x7E]*$/.test(stripped) ? stripped : '';
  });
}

// ─── Normalisation des entrées fiche recette ────────────────────────
// Acceptent un tableau d'objets OU un texte multi-lignes (robustesse).
function normalizeIngredients(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((it) =>
      typeof it === 'string'
        ? { nom: it }
        : { qte: it.qte ?? it.quantite ?? '', unite: it.unite ?? '', nom: it.nom ?? it.libelle ?? '' }
    );
  }
  return String(raw).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => ({ nom: l }));
}

function normalizeSteps(raw) {
  if (!raw) return [];
  // Retire une éventuelle numérotation existante (régénérée dans les pastilles).
  if (Array.isArray(raw)) return raw.map((s) => String(s).replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
  return String(raw).split(/\r?\n/).map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
}

export default pdfUtils;
