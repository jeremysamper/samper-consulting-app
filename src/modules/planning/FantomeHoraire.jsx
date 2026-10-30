import React from 'react';
import { createPortal } from 'react-dom';
import { typeHoraire } from './planningModeles.js';
import { jourCourt, lireCase } from './planningGlisser.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fantôme de l'horaire glissé : il suit le pointeur et dit ce que fera le
// lâcher (déplacer, copier, refus et pourquoi, jour d'absence). Portail dans
// <body>, position fixe, transparent au pointeur (sinon elementFromPoint le
// trouverait lui-même). Sa position est écrite par useGlisserHoraires dans le
// DOM (refRacine), jamais par un rendu React.
//
// Noms en data-no-translate ; heures, jours et motifs dans leurs propres
// nœuds : chaque phrase reste une entrée du glossaire.
// ─────────────────────────────────────────────────────────────────────────────

const FILET = { ok: 'var(--accent)', avertir: 'var(--warning-text)', refus: 'var(--danger-strong)' };

export default function FantomeHoraire({ glisse, refRacine, nomDe }) {
  if (!glisse) return null;
  const h = glisse.horaire;
  const t = typeHoraire(h.typeShift);
  const r = glisse.regle;
  const cible = glisse.cle ? lireCase(glisse.cle) : null;

  let ligne = null;
  if (r && r.bloque === 'chevauche') {
    // Heures en un seul nœud sans lettre : un « à » isolé (moins de trois
    // lettres) ne serait jamais traduit.
    ligne = <>Déjà un horaire ce jour-là : <span>{r.conflit.debut}-{r.conflit.fin}</span></>;
  } else if (r && r.bloque === 'pointe') {
    ligne = glisse.tactile ? <>Déjà pointé : il ne se déplace pas</> : <>Déjà pointé : Alt ou Ctrl pour le copier</>;
  } else if (r && r.effet !== 'rien' && cible) {
    ligne = <>{r.effet === 'copier' ? 'Copier vers' : 'Déplacer vers'} <span data-no-translate>{nomDe(cible.userId)}</span>, <span>{jourCourt(cible.date)}</span></>;
  }

  return createPortal(
    <div ref={refRacine} aria-hidden="true" data-fantome-horaire="" style={{ ...s.fantome, borderColor: glisse.etat ? FILET[glisse.etat] : 'var(--border)' }}>
      {/* Pendant le glisser : main fermée partout, aucune sélection de texte. */}
      <style>{'*{cursor:grabbing!important;-webkit-user-select:none!important;user-select:none!important}'}</style>
      <div style={s.titre}><span>{t.label}</span> <span>{h.debut}-{h.fin}</span></div>
      {ligne && <div style={{ ...s.ligne, color: glisse.etat === 'refus' ? 'var(--danger-strong)' : 'var(--text)' }}>{ligne}</div>}
      {r && r.absence && <div style={{ ...s.ligne, color: 'var(--warning-text)' }}>Jour d'absence : <span>{r.absence}</span></div>}
    </div>,
    document.body,
  );
}

const s = {
  fantome: {
    position: 'fixed', left: 0, top: 0, zIndex: 1100, pointerEvents: 'none', willChange: 'transform',
    maxWidth: 280, padding: '8px 12px', borderRadius: 10, background: 'var(--surface)',
    borderWidth: 2, borderStyle: 'solid', boxShadow: 'var(--sh)',
    fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text)', lineHeight: 1.4,
  },
  titre: { fontWeight: 700, whiteSpace: 'nowrap' },
  ligne: { marginTop: 2 },
};
