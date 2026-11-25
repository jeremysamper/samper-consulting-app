import React from 'react';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { ROLES_VALIDEURS } from '../../utils/reglagesModules.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { ChoixMultiple } from '../compte/sections/reglagesMaisonUi.jsx';
import { CaseReglage, EtatModule } from '../compte/sections/reglagesModulesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Fiches salle » de la page des réglages (plan 15, lot 2),
// reglages_modules, module 'fiches_salle' :
//   - qui valide une fiche (la publie) ; sans réglage : qui a le droit
//     « Modifier » des fiches salle ;
//   - brouillons montrés ou non à la salle ;
//   - champs montrés à la salle : temps de préparation, accords, allergènes.
// Ce sont des gardes d'écran : la RLS de fiches_salle laisse l'équipe tout
// lire. Écriture : direction de la maison (RLS de reglages_modules).
// ─────────────────────────────────────────────────────────────────────────────

const CHAMPS = [
  { id: 'temps', libelle: 'Temps de préparation' },
  { id: 'accords', libelle: 'Accords mets & boissons' },
  { id: 'allergenes', libelle: 'Allergènes', aide: "À garder pour que la salle réponde aux questions des clients." },
];

export default function SectionReglagesFichesSalle({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, status, enregistrer } = useReglagesModule(etabId, 'fiches_salle');
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
  const valideurs = reglages.valideurs
    || ROLES_VALIDEURS.filter((r) => canManageModule(r.id, 'fiches_salle')).map((r) => r.id);

  return (
    <div style={ui.liste} data-section-reglages="fiches_salle">
      <Ligne colonne titre="Qui valide une fiche" aide="Ces rôles publient une fiche. Les autres rôles qui rédigent les fiches les laissent en brouillon.">
        <ChoixMultiple
          label="Qui valide une fiche"
          options={ROLES_VALIDEURS}
          valeurs={valideurs}
          desactive={enCours}
          onChange={(v) => {
            if (!v.length) { notify('Choisissez au moins un rôle.', 'warning'); return; }
            ecrire({ valideurs: v });
          }}
        />
      </Ligne>
      <Ligne colonne titre="Brouillons" aide="Une fiche en brouillon n'est pas encore relue.">
        <CaseReglage libelle="Montrer les brouillons à la salle" aide="Ils portent la mention « Brouillon »." coche={reglages.brouillons_visibles_salle} desactive={enCours}
          onChange={(v) => ecrire({ brouillons_visibles_salle: v })} />
      </Ligne>
      <Ligne colonne derniere titre="Ce que la salle voit" aide="Les champs montrés à la salle sur chaque fiche. Ceux qui rédigent les fiches voient toujours tout.">
        {CHAMPS.map((c) => (
          <CaseReglage key={c.id} libelle={c.libelle} aide={c.aide} coche={reglages.champs[c.id]} desactive={enCours}
            onChange={(v) => ecrire({ champs: { ...reglages.champs, [c.id]: v } })} />
        ))}
      </Ligne>
    </div>
  );
}
