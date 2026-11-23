import React from 'react';
import { notify } from '../../components/toast/index.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { ChoixPilules, Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { EtatModule } from '../compte/sections/reglagesModulesUi.jsx';
import { OPTIONS_VUE_MAISON, QUESTIONS, VUE_APP } from './questionsStatistiques.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Statistiques » de la page des réglages (plan 15, lot 5),
// reglages_modules, module 'statistiques' : la vue qui s'ouvre d'office pour
// qui n'a pas encore de vue à lui. La vue de l'app (les ventes sur 30 jours)
// ou une réponse toute faite. Chacun garde ensuite sa propre vue (« Ma vue »).
// Écriture : direction de la maison (RLS de reglages_modules). Les objectifs
// restent dans La maison > Objectifs.
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionReglagesStatistiques({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, status, enregistrer } = useReglagesModule(etabId, 'statistiques');
  const [enCours, setEnCours] = React.useState(false);
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  const valeur = QUESTIONS.some((q) => q.id === reglages.vue_defaut) ? reglages.vue_defaut : VUE_APP;
  const choisir = async (id) => {
    if (enCours) return;
    setEnCours(true);
    const { error } = await enregistrer({ vue_defaut: id === VUE_APP ? null : id });
    setEnCours(false);
    if (error) notify(error, 'error');
  };
  const detail = QUESTIONS.find((q) => q.id === valeur)?.detail || 'Les ventes de la maison sur 30 jours, jour par jour.';

  return (
    <div style={ui.liste} data-section-reglages="statistiques">
      <Ligne colonne derniere titre="Vue d'office" aide="Ce qui s'ouvre pour qui arrive dans les Statistiques sans vue à lui. Chacun garde ensuite la sienne.">
        <ChoixPilules label="Vue d'office" valeur={valeur} options={OPTIONS_VUE_MAISON} onChange={choisir} />
        <p style={st.detail}>{detail}</p>
      </Ligne>
    </div>
  );
}

const st = {
  detail: { margin: '8px 0 0', fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45 },
};
