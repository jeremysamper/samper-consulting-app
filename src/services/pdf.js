import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getDemoData } from '../data/demoData.js';
import { getBrowserWindow, notifyLegacy } from '../legacy/legacyApi.js';
import { readJson } from '../utils/storage.js';

// ─────────────────────────────────────────────────────
// PDF & IMPRESSION — Mise en page A4 professionnelle
// ─────────────────────────────────────────────────────

export const pdfUtils = {

  _getPrintStyles(orientation = 'portrait') {
    const isLandscape = orientation === 'landscape';
    // ─── Palette Samper — DA sobre et éditoriale ───
    // Crème (#fbf8f3) en fond, gris pierre (#2c2620) pour le texte,
    // beige doré (#b8985e) pour les filets et accents.
    // Titres en italique serif éditorial (Georgia en fallback web-safe).
    return `
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
        border-bottom: 1px solid #b8985e;
        padding-bottom: 14px; margin-bottom: 22px;
      }
      .pdf-brand { display: flex; align-items: center; gap: 14px; }
      .pdf-logo {
        width: 44px; height: 44px; border-radius: 8px;
        background: #92702A; color: #fff;
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
      .pdf-meta-etab { font-weight: 600; color: #b8985e; margin-top: 6px; letter-spacing: 0.3px; }
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
        color: #b8985e;
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
        color: #b8985e; text-transform: uppercase; letter-spacing: 0.8px;
        padding: 8px 8px 6px; border-bottom: 1px solid #b8985e;
      }
      td { padding: 7px 8px; font-size: 10pt; border-bottom: 0.5px solid #e8dfcd; color: #2c2620; }
      .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin: 12px 0 18px; }
      .kpi-card { border: 0.5px solid #d4c5a8; border-radius: 4px; padding: 12px 14px; background: rgba(255,255,255,0.5); }
      .kpi-label { font-size: 7.5pt; font-weight: 700; color: #8a7d6a; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 5px; }
      .kpi-value { font-family: Georgia, serif; font-size: 15pt; font-weight: 600; color: #2c2620; }
      .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 8pt; font-weight: 600; background: rgba(184,152,94,0.12); color: #8a6b2f; border: 0.5px solid #d4c5a8; }
      .section { margin-bottom: 20px; page-break-inside: avoid; }

      /* ─── Overrides agressifs pour le contenu cloné ────────────────────
         Les composants React utilisent souvent des couleurs inline hardcodées
         (#dcfce7, #15803d, #fff, etc.) qui restent dans le clone DOM.
         html2canvas et la print-window n'ont pas accès aux CSS variables
         du runtime, donc on force ici un fallback cohérent avec la DA Samper.
         Les éléments avec une classe .badge / .pdf-meta-etab gardent leur
         couleur explicite (déjà définie ci-dessus avec leur priorité). */
      .pdf-content, .pdf-content * {
        color: #2c2620;
      }
      .pdf-content [style*="background"] {
        background-image: none !important;
      }
      /* Strip les fonds de cartes/badges colorés qui ne rendent rien en print */
      .pdf-content [style*="background:#"], .pdf-content [style*="background: #"],
      .pdf-content [style*="background-color:"] {
        background: transparent !important;
      }
      /* Conserver les couleurs sémantiques utiles pour les badges status */
      .pdf-content [style*="background: #dcfce7"], .pdf-content [style*="background:#dcfce7"] { background: rgba(184,152,94,0.08) !important; color: #2c2620 !important; }
      .pdf-content [style*="background: #fee2e2"], .pdf-content [style*="background:#fee2e2"] { background: rgba(220,38,38,0.08) !important; color: #991b1b !important; }
      .pdf-content [style*="background: #fef3c7"], .pdf-content [style*="background:#fef3c7"] { background: rgba(245,158,11,0.10) !important; color: #92400e !important; }
      /* Liens et accents : conserver l'or Samper */
      .pdf-content a, .pdf-content [class*="accent"] { color: #92702A; }
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
    // ─── Nettoyage des inline styles couleurs ─────────────────────────────
    // Bug observé : les composants utilisent style={{ color: 'var(--text)' }}
    // qui résout en oklch() au runtime. html2canvas v1.4 plante silencieusement
    // sur oklch et le bouton "imprimer" affiche les styles inline héritage qui
    // écrasent notre CSS print. On strip les color/background-color/border-color
    // dans le clone pour laisser le CSS print prendre le dessus.
    // On garde par contre tout ce qui est layout (display, gap, padding, etc.).
    this._stripColorInlines(clone);
    return clone;
  },

  _stripColorInlines(root) {
    if (!root || !root.querySelectorAll) return;
    const COLOR_PROPS = ['color', 'background', 'backgroundColor', 'backgroundImage', 'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'boxShadow', 'outlineColor', 'fill', 'stroke'];
    const walk = (el) => {
      if (el.nodeType !== 1) return; // ELEMENT_NODE
      if (el.style) {
        // Strip uniquement les propriétés qui contiennent var() ou oklch — les valeurs hex hardcodées
        // restent intactes (et seront overridées par notre CSS !important).
        COLOR_PROPS.forEach(prop => {
          const val = el.style[prop];
          if (val && (/var\(/.test(val) || /oklch\(/i.test(val))) {
            el.style[prop] = '';
          }
        });
      }
    };
    walk(root);
    root.querySelectorAll('*').forEach(walk);
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

    const headerHTML = noBrand
      ? `<div style="margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #d4c8a0;"><div style="font-size:16pt;font-weight:700;font-family:Georgia,serif;color:#333;">${title}</div>${etab?.nom ? `<div style="font-size:10pt;color:#666;margin-top:2px;">${etab.nom}${etab.adresse ? ' — ' + etab.adresse : ''}</div>` : ''}<div style="font-size:9pt;color:#888;margin-top:2px;">${new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>`
      : this._getHeaderHTML(title, etab);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8"/>
        <title>${title}</title>
        <style>${this._getPrintStyles(orientation)}</style>
      </head>
      <body>
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
        ? `<div style="margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #d4c8a0;"><div style="font-size:15pt;font-weight:700;font-family:Georgia,serif;color:#333;">${title}</div>${etab?.nom ? `<div style="font-size:9pt;color:#666;margin-top:2px;">${etab.nom}${etab.adresse ? ' — ' + etab.adresse : ''}</div>` : ''}<div style="font-size:8pt;color:#888;margin-top:2px;">${new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>`
        : this._getHeaderHTML(title, etab);
    }

    container.innerHTML = `
      <style>${this._getPrintStyles(orientation)}</style>
      ${headerHTML}
      <div class="pdf-content">${clone.innerHTML}</div>
    `;
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fbf8f3',
        logging: false,
        // onclone : dernière chance pour neutraliser les couleurs problématiques
        // (var(--*), oklch()) sur le DOM cloné par html2canvas en interne.
        onclone: (clonedDoc) => {
          try {
            clonedDoc.querySelectorAll('*').forEach(el => {
              if (!el.style) return;
              const inline = el.getAttribute('style');
              if (inline && (/var\(/.test(inline) || /oklch\(/i.test(inline))) {
                // Strip color, background-color, border-color qui contiennent var() ou oklch()
                ['color', 'background', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'boxShadow', 'fill', 'stroke'].forEach(prop => {
                  const v = el.style[prop];
                  if (v && (/var\(/.test(v) || /oklch\(/i.test(v))) {
                    el.style[prop] = '';
                  }
                });
              }
            });
          } catch (e) {
            console.warn('[pdf onclone normalize] échec non bloquant', e);
          }
        },
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
        ? `<div style="margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #d4c8a0;"><div style="font-size:15pt;font-weight:700;font-family:Georgia,serif;color:#333;">${title}</div>${etab?.nom ? `<div style="font-size:9pt;color:#666;margin-top:2px;">${etab.nom}${etab.adresse ? ' — ' + etab.adresse : ''}</div>` : ''}<div style="font-size:8pt;color:#888;margin-top:2px;">${new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>`
        : this._getHeaderHTML(title, etab);
    }

    container.innerHTML = `
      <style>${this._getPrintStyles(orientation)}</style>
      ${headerHTML}
      <div class="pdf-content">${clone.innerHTML}</div>
    `;
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fbf8f3',
        logging: false,
        onclone: (clonedDoc) => {
          // Même normalisation oklch/var() que exportElementToPdf
          try {
            clonedDoc.querySelectorAll('*').forEach(el => {
              if (!el.style) return;
              const inline = el.getAttribute('style');
              if (inline && (/var\(/.test(inline) || /oklch\(/i.test(inline))) {
                ['color', 'background', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'boxShadow', 'fill', 'stroke'].forEach(prop => {
                  const v = el.style[prop];
                  if (v && (/var\(/.test(v) || /oklch\(/i.test(v))) {
                    el.style[prop] = '';
                  }
                });
              }
            });
          } catch (e) {
            console.warn('[pdf blob onclone normalize] échec non bloquant', e);
          }
        },
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
};

export default pdfUtils;
