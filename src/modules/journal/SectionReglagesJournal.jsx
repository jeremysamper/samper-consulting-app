import React from 'react';
import { notify } from '../../components/toast/index.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { FORMATS_EXPORT_JOURNAL, VUES_JOURNAL } from '../../utils/reglagesModules.js';
import { ChoixPilules, Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { EtatModule } from '../compte/sections/reglagesModulesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Journal » de la page des réglages (plan 15, lot 5),
// reglages_modules, module 'journal' :
//   - la vue d'office : regroupée (les lignes identiques qui se suivent en une
//     seule, « 7 modifications ») ou ligne par ligne ;
//   - le format de l'export : CSV (s'ouvre dans Excel en français) ou classeur
//     Excel.
// Lecture et écriture : consultant et patron, ceux qui lisent le journal (un
// déclencheur de la base refuse les autres rôles pour ce module). Le filtre de
// chacun ne se règle pas ici : il est gardé pour la personne dans le module.
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionReglagesJournal({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, status, enregistrer } = useReglagesModule(etabId, 'journal');
  const [enCours, setEnCours] = React.useState(false);
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  const ecrire = async (changes) => {
    if (enCours) return;
    setEnCours(true);
    const { error } = await enregistrer(changes);
    setEnCours(false);
    if (error) notify(error, 'error');
  };

  return (
    <div style={ui.liste} data-section-reglages="journal">
      <Ligne colonne titre="Vue d'office" aide="Regroupée : les lignes identiques qui se suivent n'en font qu'une, qui se déplie. Ligne par ligne : chaque enregistrement à part.">
        <ChoixPilules label="Vue d'office" valeur={reglages.vue} options={VUES_JOURNAL} onChange={(vue) => ecrire({ vue })} />
      </Ligne>
      <Ligne colonne derniere titre="Format de l'export" aide="CSV s'ouvre dans Excel et dans tous les tableurs. Excel donne un classeur prêt à lire, en-têtes figés.">
        <ChoixPilules label="Format de l'export" valeur={reglages.export} options={FORMATS_EXPORT_JOURNAL} onChange={(f) => ecrire({ export: f })} />
      </Ligne>
    </div>
  );
}
