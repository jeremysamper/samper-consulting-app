import React from 'react';
import { EnSection } from '../../components/ui/Fenetres.jsx';
import { getDemoData } from '../../data/demoData.js';
import { usePlanningGroupes } from '../../hooks/usePlanningGroupes.js';
import { usePlanningMasques } from '../../hooks/usePlanningMasques.js';
import { usePlanningModeles } from '../../hooks/usePlanningModeles.js';
import { zurichToday } from '../../utils/zurichTime.js';
import ContratsModal from './ContratsModal.jsx';
import GroupesModal from './GroupesModal.jsx';
import MasquesModal from './MasquesModal.jsx';
import ModelesModal from './ModelesModal.jsx';
import { useContrats } from './contratsService.js';
import { equipeDuPlanning, estDirectionPlanning, heuresContractuelles, peutEcrirePlanning } from './gardesPlanning.js';

// ─────────────────────────────────────────────────────────────────────────────
// Les quatre réglages du Planning, sections de la page des réglages : modèles
// d'horaires, groupes, personnes masquées, contrats. Chaque section monte la
// fenêtre d'origine telle quelle (posée dans la page) et lui lit ce que
// Planning.jsx lui passait, par les mêmes hooks et la même équipe
// (gardesPlanning.js). Le Planning resté monté relit au signal de changement.
//
// Un écran n'est rendu qu'une fois sa lecture aboutie : un formulaire ouvert
// sur une liste pas encore lue enregistrerait cette liste vide. Sans la table
// (migration absente), la section le dit, comme le menu « Gérer » du Planning
// qui ne proposait alors pas l'entrée.
// ─────────────────────────────────────────────────────────────────────────────

const Attente = () => <p style={st.note}>Chargement…</p>;
const Absent = () => <p style={st.note}>Ce réglage n'est pas encore activé sur la base de données.</p>;

function useEquipe(etabId) {
  const groupesEtab = usePlanningGroupes(etabId);
  const demoData = getDemoData();
  const { equipeEtab, equipe } = equipeDuPlanning(demoData.utilisateurs, etabId, groupesEtab.postesParCompte);
  return { groupesEtab, equipeEtab, equipe, roles: demoData.roles };
}

export function SectionModeles({ etablissement }) {
  const etabId = etablissement?.id || null;
  const modelesEtab = usePlanningModeles(etabId);
  const [tour, setTour] = React.useState(0);
  if (!etabId) return null;
  if (modelesEtab.status === 'loading') return <Attente />;
  if (modelesEtab.status === 'absent') return <Absent />;
  // Remontée quand la liste enregistrée change ou sur « Annuler » : le
  // formulaire prend ses valeurs à son montage.
  const cle = `${JSON.stringify(modelesEtab.modeles)}:${tour}`;
  return (
    <EnSection>
      <ModelesModal
        key={cle}
        modeles={modelesEtab.modeles}
        personnalises={modelesEtab.personnalises}
        onEnregistrer={modelesEtab.enregistrer}
        onClose={() => setTour((t) => t + 1)}
      />
    </EnSection>
  );
}

export function SectionGroupes({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const { groupesEtab, equipeEtab, equipe, roles } = useEquipe(etabId);
  if (!etabId) return null;
  if (groupesEtab.status === 'loading') return <Attente />;
  if (!(groupesEtab.status === 'ready' && groupesEtab.groupes.length > 0)) return <Absent />;
  return (
    <GroupesModal
      groupesEtab={groupesEtab}
      personnes={equipe}
      comptes={equipeEtab}
      canGerer={peutEcrirePlanning(user?.role)}
      canPostes={estDirectionPlanning(user?.role)}
      roles={roles}
    />
  );
}

export function SectionMasques({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { groupesEtab, equipe, roles } = useEquipe(etabId);
  const masquesEtab = usePlanningMasques(etabId);
  if (!etabId) return null;
  if (masquesEtab.status === 'loading' || groupesEtab.status === 'loading') return <Attente />;
  if (masquesEtab.status === 'absent') return <Absent />;
  return (
    <MasquesModal
      employees={equipe}
      masques={masquesEtab.masques}
      masquer={masquesEtab.masquer}
      afficher={masquesEtab.afficher}
      roles={roles}
    />
  );
}

export function SectionContrats({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { groupesEtab, equipe } = useEquipe(etabId);
  const contratsEtab = useContrats(etabId);
  if (!etabId) return null;
  if (contratsEtab.status === 'loading' || groupesEtab.status === 'loading') return <Attente />;
  if (contratsEtab.status === 'absent') return <Absent />;
  return (
    <EnSection>
      <ContratsModal
        personnes={equipe}
        contrats={contratsEtab.contrats}
        status={contratsEtab.status}
        enregistrer={contratsEtab.enregistrer}
        aujourdhui={zurichToday()}
        heuresDefaut={heuresContractuelles(etablissement)}
        onClose={() => {}}
      />
    </EnSection>
  );
}

const st = {
  note: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
};
