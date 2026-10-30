import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Grande carte de l'accueil : un libellé, un chiffre, deux ou trois lignes qui
// disent d'où il vient et comment il bouge. Bouton entier quand un écran de
// détail existe (toucher la carte l'ouvre), simple bloc sinon. Même fond que
// les tuiles de l'accueil (data-cadre : la règle « Plus de carrés » la garde).
//
//   etat : 'loading' | 'error' | 'ready'
//   ton  : 'danger' pour un résultat négatif
// ─────────────────────────────────────────────────────────────────────────────

export default function CarteChiffre({ id, titre, Icone, valeur, lignes = [], onClick, etat = 'ready', ton }) {
  const contenu = (
    <>
      <span style={st.tete}>
        {Icone && <Icone size={16} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />}
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
    padding: '16px 16px 14px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)', color: 'var(--text)',
    border: 'none', fontFamily: 'var(--font)', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box',
  },
  tete: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--accent)', lineHeight: 1.3 },
  valeur: { fontFamily: 'var(--font-num)', fontWeight: 500, color: 'var(--text)', lineHeight: 1.15, marginTop: 4, overflowWrap: 'anywhere' },
  attente: { fontFamily: 'var(--font)', fontSize: 14, fontWeight: 400, color: 'var(--text2)' },
  ligne: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, marginTop: 2 },
  // --text2 et non --text3 : 4,27:1 seulement sur --surface2 en sombre.
  ligneSeconde: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 },
};
