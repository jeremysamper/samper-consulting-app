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
    return `
      @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 15mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body {
        font-family: 'Helvetica Neue', Arial, sans-serif;
        color: #1a1a1a;
        background: #fff;
        margin: 0; padding: 0;
        font-size: 10pt;
        line-height: 1.4;
      }
      .pdf-header {
        display: flex; justify-content: space-between; align-items: flex-start;
        border-bottom: 2px solid #92702A;
        padding-bottom: 10px; margin-bottom: 18px;
      }
      .pdf-brand { display: flex; align-items: center; gap: 12px; }
      .pdf-logo {
        width: 42px; height: 42px; border-radius: 8px;
        background: #92702A; color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 14pt; letter-spacing: 1px;
        overflow: hidden;
      }
      .pdf-logo img { width: 100%; height: 100%; object-fit: cover; }
      .pdf-brand-text .pdf-brand-name { font-size: 13pt; font-weight: 700; color: #1a1a1a; }
      .pdf-brand-text .pdf-brand-sub { font-size: 9pt; color: #666; margin-top: 2px; }
      .pdf-meta { text-align: right; font-size: 9pt; color: #666; }
      .pdf-meta-title { font-size: 14pt; font-weight: 700; color: #1a1a1a; margin-bottom: 2px; }
      .pdf-meta-etab { font-weight: 600; color: #92702A; margin-top: 4px; }
      h1, h2, h3 { color: #1a1a1a; margin: 0 0 10px 0; page-break-after: avoid; }
      h1 { font-size: 16pt; font-weight: 700; }
      h2 { font-size: 13pt; font-weight: 700; margin-top: 14px; }
      h3 { font-size: 11pt; font-weight: 600; margin-top: 10px; }
      p { margin: 0 0 8px 0; }
      strong { font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; page-break-inside: auto; }
      thead { display: table-header-group; background: #f5f0e5; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      th { text-align: left; font-size: 9pt; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.3px; padding: 6px 8px; border-bottom: 1.5px solid #92702A; }
      td { padding: 6px 8px; font-size: 10pt; border-bottom: 1px solid #eee; }
      .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 10px 0 16px; }
      .kpi-card { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; }
      .kpi-label { font-size: 8pt; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; }
      .kpi-value { font-size: 14pt; font-weight: 700; color: #1a1a1a; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 8pt; font-weight: 600; background: #f5f0e5; color: #92702A; }
      .section { margin-bottom: 18px; page-break-inside: avoid; }
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
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF(orientation === 'landscape' ? 'l' : 'p', 'mm', 'a4');
      const pageWidth = orientation === 'landscape' ? 297 : 210;
      const pageHeight = orientation === 'landscape' ? 210 : 297;
      const margin = 10;
      const imgWidth = pageWidth - margin * 2;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (fitOnePage) {
        // Mode "une seule page" : on scale-down l'image pour qu'elle rentre intégralement.
        const availableHeight = pageHeight - margin * 2 - 8; // -8 pour le pied de page
        if (imgHeight > availableHeight) {
          // Réduire proportionnellement la largeur pour que la hauteur rentre
          const scale = availableHeight / imgHeight;
          const finalWidth = imgWidth * scale;
          const finalHeight = availableHeight;
          // Centrer horizontalement
          const xOffset = margin + (imgWidth - finalWidth) / 2;
          pdf.addImage(imgData, 'PNG', xOffset, margin, finalWidth, finalHeight);
        } else {
          pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
        }
      } else {
        // Mode normal : multi-pages si nécessaire
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
          pdf.setFontSize(8);
          pdf.setTextColor(150);
          if (noBrand) {
            pdf.text(totalPages > 1 ? `Page ${i}/${totalPages}` : '', margin, pageHeight - 5);
          } else {
            pdf.text(`Samper Consulting — Page ${i}/${totalPages}`, margin, pageHeight - 5);
          }
          pdf.text(new Date().toLocaleDateString('fr-CH'), pageWidth - margin, pageHeight - 5, { align: 'right' });
        }
      }

      pdf.save(fileName);
    } finally {
      document.body.removeChild(container);
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
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      });
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
          pdf.setFontSize(8);
          pdf.setTextColor(150);
          if (noBrand) {
            pdf.text(totalPages > 1 ? `Page ${i}/${totalPages}` : '', margin, pageHeight - 5);
          } else {
            pdf.text(`Samper Consulting — Page ${i}/${totalPages}`, margin, pageHeight - 5);
          }
          pdf.text(new Date().toLocaleDateString('fr-CH'), pageWidth - margin, pageHeight - 5, { align: 'right' });
        }
      }

      // Retourne le PDF sous forme de Blob (pas de download)
      return pdf.output('blob');
    } finally {
      document.body.removeChild(container);
    }
  },
};

export default pdfUtils;
