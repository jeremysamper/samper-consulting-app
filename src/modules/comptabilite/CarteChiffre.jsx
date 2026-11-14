import React from 'react';
import { pictoCercleStyle } from '../../components/ui/index.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Grande carte de l'accueil : un libellé, un chiffre, deux ou trois lignes qui
// disent d'où il vient et comment il bouge. Bouton entier quand un écran de
// détail existe (toucher la carte l'ouvre), simple bloc sinon. Même fond que
// les tuiles de l'accueil (data-cadre : la règle « Plus de carrés » la garde).
// Direction Galet : la carte d'un repère (fond --zone, filet doux, ombre
// --sh), le picto dans son cercle, le chiffre en graisse normale.
//
//   etat : 'loading' | 'error' | 'ready'
//   ton  : 'danger' pour un résultat négatif
// ─────────────────────────────────────────────────────────────────────────────

export default function CarteChiffre({ id, titre, Icone, valeur, lignes = [], onClick, etat = 'ready', ton }) {
  const contenu = (
    <>
      <span style={st.tete}>
        {Icone && <span className="compta-carte-picto" style={pictoCercleStyle(36)} aria-hidden="true"><Icone size={18} strokeWidth={1.8} /></span>}
        <span>{titre}</span>
      </span>
      <span className="compta-carte-valeur" style={{ ...st.valeur, ...(ton === 'danger' ? { color: 'var(--danger-text)' } : null) }}>
        {etat === 'loading' ? <span style={st.attente}>Chargement…</span>
          : etat === 'error' ? <span style={st.attente}>Lecture impossible</span>
            : valeur}
      </span>
      {etat === 'ready' && lignes.filter(Boolean).map((l, i) => (
        <span key={i} style={i === 0 ? st.ligne : st.ligneSeconde}>{l}</span>
      ))}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="compta-carte" data-cadre="" data-cliquable="" data-carte={id} style={st.carte} onClick={onClick}>
        {contenu}
      </button>
    );
  }
  return <div className="compta-carte" data-cadre="" data-carte={id} style={{ ...st.carte, cursor: 'default' }}>{contenu}</div>;
}

const st = {
  carte: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 0, width: '100%',
    padding: '14px 16px', borderRadius: 'var(--r-lg)', background: 'var(--zone)', color: 'var(--text)',
    boxShadow: 'inset 0 0 0 1px var(--rule-soft), var(--sh)',
    border: 'none', fontFamily: 'var(--font)', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box',
  },
  tete: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', lineHeight: 1.3 },
  valeur: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', color: 'var(--text)', lineHeight: 1.15, marginTop: 6, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' },
  attente: { fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g1)', color: 'var(--text2)' },
  ligne: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.4, marginTop: 2 },
  // --text2 et non --text3 : 4,27:1 seulement sur --surface2 en sombre.
  ligneSeconde: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.4 },
};
