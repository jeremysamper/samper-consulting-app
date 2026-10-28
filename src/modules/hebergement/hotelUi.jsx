import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Puce } from '../dashboard/tableauUi.jsx';
import { STATUTS_SEJOUR, PENSIONS, dateCourte, libelleDe, personnes, tonDe } from './hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Briques partagées par Hébergement et Étages : ligne de séjour, champ de
// formulaire, rangée d'étiquettes. Couleurs par jetons de thème seulement.
// Les noms d'hôtes, numéros de chambre et dates sont des données : ils vont
// dans leurs propres nœuds (data-no-translate pour les noms) et la phrase
// autour reste une entrée du glossaire.
// ─────────────────────────────────────────────────────────────────────────────

export function LigneSejour({ sejour, chambre, onClick, aujourdhui }) {
  const s = sejour;
  const nuits = Math.max(1, Math.round((Date.parse(`${s.depart}T12:00:00`) - Date.parse(`${s.arrivee}T12:00:00`)) / 86400000));
  const contenu = (
    <>
      <span style={h.ligneGauche}>
        <span style={h.nomHote} data-no-translate>{s.nomHote}</span>
        <span style={h.detail}>
          <span data-no-translate>{dateCourte(s.arrivee)} - {dateCourte(s.depart)}</span>
          <span aria-hidden="true"> </span>
          <span>({nuits}</span>
          <span aria-hidden="true"> </span>
          <span>{nuits > 1 ? 'nuits' : 'nuit'})</span>
        </span>
      </span>
      <span style={h.ligneDroite}>
        <span style={h.chambre}>
          {chambre ? <><span>Chambre</span><span aria-hidden="true"> </span><span data-no-translate>{chambre.numero}</span></> : <span>Sans chambre</span>}
        </span>
        <span style={h.detail}>
          <span>{personnes(s)}</span>
          <span aria-hidden="true"> </span>
          <span>{personnes(s) > 1 ? 'personnes' : 'personne'}</span>
          <span aria-hidden="true"> </span>
          <span>{libelleDe(PENSIONS, s.pension)}</span>
        </span>
        <Puce ton={tonDe(STATUTS_SEJOUR, s.statut)}>
          {s.statut === 'prevu' && s.arrivee === aujourdhui ? 'Arrive aujourd\'hui' : libelleDe(STATUTS_SEJOUR, s.statut)}
        </Puce>
        <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text3)' }} />
      </span>
    </>
  );
  return (
    <button type="button" className="tdb-lien" onClick={onClick} style={h.ligne} data-sejour={s.id}>
      {contenu}
    </button>
  );
}

export function Champ({ label, children, large = false }) {
  return (
    <label style={{ ...h.champ, ...(large ? { gridColumn: '1 / -1' } : null) }}>
      <span style={h.champLabel}>{label}</span>
      {children}
    </label>
  );
}

export function Vide({ children }) {
  return <div style={h.vide}>{children}</div>;
}

export function Liste({ children }) {
  return <div style={h.liste}>{children}</div>;
}

export const h = {
  liste: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  ligne: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', width: '100%',
    minHeight: 56, padding: '10px 14px', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box',
    background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', fontFamily: 'var(--font)',
  },
  ligneGauche: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 200px' },
  ligneDroite: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 },
  nomHote: { fontSize: 15, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chambre: { fontSize: 13, fontWeight: 500, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  detail: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 },
  champ: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  champLabel: { fontSize: 12, fontWeight: 500, color: 'var(--text2)' },
  saisie: {
    width: '100%', minHeight: 44, padding: '10px 12px', boxSizing: 'border-box', fontSize: 14, fontFamily: 'var(--font)',
    background: 'var(--bg)', color: 'var(--text)', borderRadius: 8,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 },
  vide: { padding: '18px 14px', fontSize: 14, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 'var(--r)' },
  sousTitre: { fontSize: 12, fontWeight: 500, color: 'var(--text3)', margin: '6px 0 0' },
  erreur: { fontSize: 13, color: 'var(--danger-text)', lineHeight: 1.45 },
};
