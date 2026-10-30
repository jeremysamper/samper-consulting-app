import React from 'react';
import { chf, dateCH } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Descriptions partagées de la Banque : une ligne de relevé
// (« -1 567,45 le 25.10.2026, FELLAY VINS SA ») et une facture d'achat
// (« Fellay Vins n° 2026-311, réglée le 25.10.2026 »). Noms, numéros et
// textes de la banque en data-no-translate ; nombres et dates dans leurs
// propres nœuds.
// ─────────────────────────────────────────────────────────────────────────────

export const montantSigne = (m) => `${Number(m) < 0 ? '-' : '+'}${chf(Math.abs(Number(m) || 0))}`;

export function DescLigne({ ligne, avecTexte = false }) {
  const nom = ligne.contrepartie || ligne.libelle || '';
  return (
    <>
      <span style={{ fontFamily: 'var(--font-num)', whiteSpace: 'nowrap', color: Number(ligne.montant) > 0 ? 'var(--success-text)' : 'var(--text)' }}>
        {montantSigne(ligne.montant)}
      </span>
      {' '}<span>le</span> <span>{dateCH(ligne.dateOperation)}</span>
      {nom ? <>, <span data-no-translate>{nom}</span></> : null}
      {avecTexte && ligne.contrepartie && ligne.libelle
        ? <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', overflowWrap: 'anywhere' }} data-no-translate>{ligne.libelle}</span>
        : null}
    </>
  );
}

export function DescFacture({ facture: f, statut = true }) {
  return (
    <>
      <span data-no-translate>{f.fournisseurNom || 'Fournisseur non lu'}</span>
      {f.numero ? <> <span>n°</span> <span data-no-translate>{f.numero}</span></> : null}
      {statut && (f.regleLe
        ? <>, <span>réglée le</span> <span>{dateCH(f.regleLe)}</span></>
        : f.dateEcheance
          ? <>, <span>à régler, échéance le</span> <span>{dateCH(f.dateEcheance)}</span></>
          : <>, <span>à régler</span></>)}
    </>
  );
}
