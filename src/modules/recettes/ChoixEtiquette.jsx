import React from 'react';
import { makeSearchMatcher } from '../../utils/searchText.js';

// ─────────────────────────────────────────────────────────────────────────────
// Écran « Une étiquette » : les préparations de l'établissement, celles qui
// portent aujourd'hui le bouton Étiquette de la bibliothèque (ni cachées ni
// archivées), filtrées par un champ toujours ouvert. Un toucher ouvre la
// fenêtre d'étiquette d'aujourd'hui (EtiquetteRapideModal) ; on reste sur la
// liste pour l'étiquette suivante.
//
// chargement : la lecture des fiches n'a pas abouti (null sinon) ; tant qu'il
// est posé, une liste vide ne s'annonce pas comme un établissement sans fiche.
// ─────────────────────────────────────────────────────────────────────────────

export default function ChoixEtiquette({ recettes, chargement, onChoisir }) {
  const [frappe, setFrappe] = React.useState('');
  const match = makeSearchMatcher(frappe);
  const liste = recettes
    .filter(r => match(r.nom))
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));

  return (
    <>
      <input
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoFocus
        value={frappe}
        onChange={e => setFrappe(e.target.value)}
        placeholder="Nom de la préparation"
        aria-label="Nom de la préparation"
        style={st.champ}
      />
      {liste.length > 0 ? (
        <div style={st.liste}>
          {liste.map(r => (
            <button key={r.id} type="button" style={st.ligne} onClick={() => onChoisir(r)}>
              <span style={st.nom}>{r.nom}</span>
              {r.categorie && <span style={st.categorie}>{r.categorie}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div style={st.vide}>
          {chargement || (match.active ? 'Aucune préparation ne correspond.' : 'Aucune préparation pour cet établissement.')}
        </div>
      )}
    </>
  );
}

// Champ toujours ouvert d'un écran dont la recherche est la tâche (ici et
// « Je cherche une fiche ») ; 16 px : en dessous, iOS zoome la page à la prise.
export const champRecherche = { width: '100%', padding: '12px 14px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--text)', fontSize: 16, fontFamily: 'var(--font)', boxSizing: 'border-box' };

const st = {
  champ: champRecherche,
  liste: { display: 'flex', flexDirection: 'column', gap: 8 },
  // flexShrink 0 : le min-height global de 44 px des boutons écrase le flex dans une colonne.
  ligne: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', minHeight: 56, flexShrink: 0, padding: '10px 14px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)' },
  nom: { fontSize: 15, fontWeight: 500, lineHeight: 1.3 },
  categorie: { fontSize: 12, color: 'var(--text2)' },
  vide: { padding: '28px 16px', textAlign: 'center', color: 'var(--text2)', fontSize: 13, background: 'var(--surface)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--border)', borderRadius: 'var(--r)' },
};
