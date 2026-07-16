/**
 * PosExportButton - Bouton d'export PDF réutilisable pour les vues cuisine POS
 *
 * Utilise pdfUtils.exportElementToPdf() : capture html2canvas (scale 2) du DOM
 * identifié par `printId`, puis génère un PDF A4 branded Samper (en-tête logo +
 * établissement + titre + date, pagination "X / Y", coupes propres multi-pages).
 *
 * Le service pdfUtils est partagé avec les exports Recettes / Carte / Fiches salle :
 * même charte d'en-tête, même gestion des CSS vars en hex (pas de crash oklch).
 *
 * Les boutons et éléments `.no-print` du DOM capturé sont retirés automatiquement.
 *
 * @param {{
 *   printId:       string,    - id de l'élément DOM à capturer
 *   title:         string,    - titre du document (affiché dans l'en-tête PDF)
 *   etablissement: object,    - { nom, logo_url, adresse? }
 *   fileName?:     string,    - nom du fichier (défaut: dérivé du titre)
 *   label?:        string,    - texte du bouton (défaut: "📥 Exporter PDF")
 *   disabled?:     boolean,
 *   style?:        object,
 * }} props
 */

import { useState } from 'react';
import { pdfUtils } from '../../../services/pdf.js';
import { notify, dismissNotify } from '../../../components/toast/index.js';

const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

function slugifyFileName(s) {
  const slug = (s || '')
    .toLowerCase()
    .normalize('NFD').replace(DIACRITICS, '')   // retire les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'export-pos'}.pdf`;
}

export function PosExportButton({ printId, title, etablissement, fileName, label, disabled, style }) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (!printId || busy) return;
    setBusy(true);
    const loadingId = notify('Génération du PDF…', 'info', { duration: 0 });
    try {
      await pdfUtils.exportElementToPdf(
        printId,
        fileName || slugifyFileName(title),
        { etablissement, title: title ?? 'Export POS' },
      );
      notify('PDF généré', 'success');
    } catch (e) {
      // pdfUtils.exportElementToPdf affiche déjà un toast d'erreur explicite ;
      // on évite ici un double toast, on garde une trace console.
      console.error('[PosExportButton] export PDF', e);
    } finally {
      dismissNotify(loadingId);
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={disabled || busy}
      className="no-print"
      style={{
        display:     'inline-flex',
        alignItems:  'center',
        gap:         6,
        padding:     '7px 16px',
        background:  (disabled || busy) ? 'var(--bg)' : 'var(--surface)',
        border:      '1px solid var(--border)',
        borderRadius: 8,
        fontSize:    13,
        fontWeight:  600,
        color:       (disabled || busy) ? 'var(--text3)' : 'var(--text)',
        cursor:      (disabled || busy) ? 'not-allowed' : 'pointer',
        fontFamily:  'var(--font)',
        transition:  'opacity 0.15s',
        opacity:     busy ? 0.6 : 1,
        flexShrink:  0,
        ...style,
      }}
    >
      {busy ? 'Génération…' : (label ?? '📥 Exporter PDF')}
    </button>
  );
}
