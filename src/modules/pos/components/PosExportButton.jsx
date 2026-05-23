/**
 * PosExportButton — Bouton d'impression PDF réutilisable pour les vues cuisine POS
 *
 * Utilise pdfUtils.printElement() : ouvre une fenêtre d'impression A4 branded
 * (en-tête Samper Consulting, logo établissement, pagination).
 *
 * Le contenu imprimé = le DOM identifié par `printId`.
 * Les boutons et éléments `.no-print` sont automatiquement masqués.
 *
 * @param {{
 *   printId:       string,    — id de l'élément DOM à imprimer
 *   title:         string,    — titre du document (affiché dans l'en-tête PDF)
 *   etablissement: object,    — { nom, logo_url, adresse? }
 *   label?:        string,    — texte du bouton (défaut: "🖨 Imprimer")
 *   disabled?:     boolean,
 *   style?:        object,
 * }} props
 */

import { useState } from 'react';
import { pdfUtils } from '../../../services/pdf.js';
import { notify } from '../../../components/toast/index.js';

export function PosExportButton({ printId, title, etablissement, label, disabled, style }) {
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    if (!printId) return;
    setPrinting(true);
    try {
      pdfUtils.printElement(printId, title ?? 'Export POS', { etablissement });
    } catch (e) {
      notify(e?.message ?? "Erreur lors de l'impression", 'error');
    } finally {
      // La fenêtre d'impression est gérée par le navigateur — on remet busy à false
      // après un court délai pour que l'UI ne reste pas bloquée
      setTimeout(() => setPrinting(false), 800);
    }
  }

  return (
    <button
      onClick={handlePrint}
      disabled={disabled || printing}
      className="no-print"
      style={{
        display:     'inline-flex',
        alignItems:  'center',
        gap:         6,
        padding:     '7px 16px',
        background:  (disabled || printing) ? 'var(--bg)' : 'var(--surface)',
        border:      '1px solid var(--border)',
        borderRadius: 8,
        fontSize:    13,
        fontWeight:  600,
        color:       (disabled || printing) ? 'var(--text3)' : 'var(--text)',
        cursor:      (disabled || printing) ? 'not-allowed' : 'pointer',
        fontFamily:  'var(--font)',
        transition:  'opacity 0.15s',
        opacity:     printing ? 0.6 : 1,
        flexShrink:  0,
        ...style,
      }}
    >
      {printing ? '…' : (label ?? '🖨 Imprimer')}
    </button>
  );
}
