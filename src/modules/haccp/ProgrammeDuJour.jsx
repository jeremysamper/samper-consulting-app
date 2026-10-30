import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// « Le programme du jour » : les heures de relevé de l'établissement et où en
// est chacune, en mots (Fait, À faire, En retard, Plus tard, Pas fait). Une
// ligne par heure sur téléphone, des blocs côte à côte sur iPad et ordinateur.
// Jamais cliquable : la carte « Maintenant » est la seule entrée du relevé.
//
// tournees : etatTournees (haccpJour.js) ; aujourdhui : faux pour un autre
// jour du registre, où une tournée incomplète se lit « Pas fait ».
// ─────────────────────────────────────────────────────────────────────────────

const ETATS = {
  fait: { mot: 'Fait', couleur: 'var(--success-text)' },
  a_faire: { mot: 'À faire', couleur: 'var(--accent)' },
  en_retard: { mot: 'En retard', couleur: 'var(--warning-text)' },
  plus_tard: { mot: 'Plus tard', couleur: 'var(--text2)' },
  pas_fait: { mot: 'Pas fait', couleur: 'var(--danger-text)' },
};

export default function ProgrammeDuJour({ tournees = [], titre, aujourdhui = true }) {
  if (!tournees.length) return null;
  return (
    <section style={st.section}>
      <div style={st.titre}>{titre}</div>
      <div style={st.grille}>
        {tournees.map(t => {
          const cle = !aujourdhui && t.etat !== 'fait' && t.etat !== 'plus_tard' ? 'pas_fait' : t.etat;
          const e = ETATS[cle] || ETATS.plus_tard;
          const partiel = t.etat !== 'fait' && t.faites > 0;
          return (
            <div key={t.id} style={st.bloc} data-haccp-tournee={t.heure}>
              <span style={st.heure} data-no-translate="">{t.heure}</span>
              <span style={st.libelle} data-no-translate="">{t.label}</span>
              <span style={{ ...st.etat, color: e.couleur }}>
                {e.mot}
                {partiel && <span style={st.compte}> (<span data-no-translate="">{t.faites}</span> sur <span data-no-translate="">{t.total}</span>)</span>}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const st = {
  section: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  titre: { fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  // 165 px : une colonne à 375 px de large, quatre sur un iPad portrait.
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 165px), 1fr))', columnGap: 24 },
  bloc: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 10px', padding: '8px 0', borderBottom: '1px solid var(--border)', minWidth: 0 },
  heure: { fontFamily: 'var(--font-num)', fontSize: 16, fontWeight: 600, color: 'var(--text)', width: 48, flexShrink: 0 },
  libelle: { flex: '1 1 90px', minWidth: 0, fontSize: 14, color: 'var(--text2)' },
  etat: { fontSize: 14, fontWeight: 600 },
  compte: { fontWeight: 400, color: 'var(--text2)' },
};
