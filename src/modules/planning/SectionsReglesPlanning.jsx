import React from 'react';
import { notify } from '../../components/toast/index.js';
import { useReglagesMaison } from '../../hooks/useReglagesMaison.js';
import { EtatMaison } from '../compte/sections/reglagesMaisonUi.jsx';
import { ChoixPilules, Ligne, ui } from '../compte/sections/reglagesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Réglage du Planning (18.11.2026), table reglages_maison :
//   Pointage : comment les heures pointées se comptent (pointageRegles.js),
//     le pointage brut n'étant jamais réécrit.
// Écriture : consultant et patron (RLS de reglages_maison).
// ─────────────────────────────────────────────────────────────────────────────


function useBloc(etablissement, bloc) {
  const maison = useReglagesMaison(etablissement?.id || null);
  const enregistrer = async (valeur) => {
    const { error } = await maison.enregistrer(bloc, valeur);
    if (error) notify(error, 'error');
  };
  return { maison, valeur: maison[bloc], enregistrer };
}

export function SectionPointage({ etablissement }) {
  const { maison, valeur: p, enregistrer } = useBloc(etablissement, 'pointage');
  if (!etablissement?.id) return null;
  if (maison.status !== 'ready') return <EtatMaison status={maison.status} />;
  return (
    <div style={ui.liste} data-reglages-maison="pointage">
      <p style={st.intro}>Ces règles changent les heures comptées : soldes, relevé CCNT, exports des salaires, Comptabilité et Statistiques. Le pointage lui-même reste affiché et gardé tel quel.</p>
      <Ligne colonne titre="Arrivée en avance" aide="Quand quelqu'un pointe avant l'heure prévue. Un retard compte toujours dès le pointage.">
        <ChoixPilules
          label="Arrivée en avance"
          valeur={p.avance}
          options={[{ id: 'pointee', label: 'Comptée dès le pointage' }, { id: 'prevue', label: "Comptée dès l'heure prévue" }]}
          onChange={(v) => enregistrer({ ...p, avance: v })}
        />
      </Ligne>
      <Ligne colonne derniere titre="Arrondi" aide="Arrivée et départ arrondis au plus proche, vers le haut comme vers le bas : juste pour chacun sur le mois.">
        <ChoixPilules
          label="Arrondi"
          valeur={String(p.arrondiMin)}
          options={[{ id: '0', label: 'À la minute' }, { id: '5', label: '5 minutes' }, { id: '15', label: '15 minutes' }]}
          onChange={(v) => enregistrer({ ...p, arrondiMin: Number(v) })}
        />
      </Ligne>
    </div>
  );
}

const st = {
  intro: { margin: '0 0 4px', fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45 },
};
