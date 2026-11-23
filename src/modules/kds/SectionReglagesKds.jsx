import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { ouvrirCompte } from '../../services/navigationService.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { CaseReglage, ChampEntier, EtatModule } from '../compte/sections/reglagesModulesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « KDS » de la page des réglages (plan 15, lot 2), reglages_modules,
// module 'kds' :
//   - son à l'arrivée d'un bon ;
//   - âge d'un bon : alerte (7 min) et retard (12 min) par défaut, comme avant.
// Les postes restent ceux des catégories de la caisse (caisse_categories.
// poste) : la section y renvoie, sans les recopier. Écriture : direction de
// la maison (RLS).
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionReglagesKds({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, status, enregistrer } = useReglagesModule(etabId, 'kds');
  const [enCours, setEnCours] = React.useState(false);
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  const ecrire = async (changes) => {
    if (enCours) return false;
    setEnCours(true);
    const { error } = await enregistrer(changes);
    setEnCours(false);
    if (error) { notify(error, 'error'); return false; }
    return true;
  };

  return (
    <div style={ui.liste} data-section-reglages="kds">
      <Ligne colonne titre="Son" aide="Un bip court sur l'écran du passe quand un bon arrive.">
        <CaseReglage libelle="Sonner à l'arrivée d'un bon" coche={reglages.son} desactive={enCours} onChange={(son) => ecrire({ son })} />
      </Ligne>
      <Ligne titre="Bon en attente depuis" aide="Le chrono du bon passe à l'orange après ce temps.">
        <ChampEntier label="Alerte en minutes" valeur={reglages.attention_minutes} min={1} max={119} unite="min" desactive={enCours}
          onValider={(n) => {
            if (n >= reglages.retard_minutes) { notify("L'alerte vient avant le retard.", 'warning'); return; }
            ecrire({ attention_minutes: n });
          }} />
      </Ligne>
      <Ligne titre="Bon en retard depuis" aide="Le chrono du bon passe au rouge après ce temps.">
        <ChampEntier label="Retard en minutes" valeur={reglages.retard_minutes} min={2} max={120} unite="min" desactive={enCours}
          onValider={(n) => {
            if (n <= reglages.attention_minutes) { notify("Le retard vient après l'alerte.", 'warning'); return; }
            ecrire({ retard_minutes: n });
          }} />
      </Ligne>
      <Ligne derniere titre="Postes" aide="Chaud, froid, pâtisserie, bar : chaque catégorie de la caisse porte son poste. Ils se règlent dans les réglages de la Caisse.">
        <Btn variant="ghost" style={ui.btn44} onClick={() => ouvrirCompte('caisse')}>Ouvrir les catégories</Btn>
      </Ligne>
    </div>
  );
}
