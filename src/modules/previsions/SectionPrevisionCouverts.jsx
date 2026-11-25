import React from 'react';
import { notify } from '../../components/toast/index.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { CaseReglage, EtatModule } from '../compte/sections/reglagesModulesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Réservations : prévision des couverts » de la page des réglages
// (lot 06 du panel) : les sources que la prévision compte en plus des
// réservations. Une seule aujourd'hui, les hôtes en pension de l'Hébergement.
// reglages_modules, module 'previsions', clé sources. Écriture : direction de
// la maison (RLS) ; la section n'est proposée qu'à une maison avec Hébergement.
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionPrevisionCouverts({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, status, enregistrer } = useReglagesModule(etabId, 'previsions');
  const [enCours, setEnCours] = React.useState(false);
  const enCoursRef = React.useRef(false);
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  // Un double toucher n'écrit qu'une fois ; une écriture refusée laisse la
  // case à la valeur lue.
  const ecrire = async (pension) => {
    if (enCoursRef.current) return;
    enCoursRef.current = true;
    setEnCours(true);
    const { error } = await enregistrer({ sources: { ...reglages.sources, pension } });
    enCoursRef.current = false;
    setEnCours(false);
    if (error) notify(error, 'error');
  };

  return (
    <div style={ui.liste} data-section-reglages="previsions">
      <Ligne colonne derniere titre="Sources de la prévision">
        <CaseReglage
          libelle="Compter les hôtes en pension"
          aide="Les hôtes en demi-pension ou en pension complète comptent au dîner, et au déjeuner pour la pension complète. Allumez ce réglage si vous ne saisissez pas une réservation pour chaque hôte, ou si vous la reliez à son séjour."
          coche={reglages.sources.pension}
          desactive={enCours}
          onChange={ecrire}
        />
      </Ligne>
    </div>
  );
}
