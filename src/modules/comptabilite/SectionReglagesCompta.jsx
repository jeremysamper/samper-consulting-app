import React from 'react';
import { ChoixFiltre } from '../../components/ui/index.jsx';
import { EnSection } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { CaseReglage } from '../compte/sections/reglagesModulesUi.jsx';
import FenetreReglages from './FenetreReglages.jsx';
import { CARTES_ACCUEIL, REGLAGES_DEFAUT, enregistrerAffichageCompta, useTableCompta } from './comptaService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Comptabilité » de la page des réglages : monte FenetreReglages
// telle quelle, posée dans la page (EnSection), et lui lit ses réglages comme
// le fait useCompta (compta_reglages par-dessus les défauts).
//
// Le formulaire prend ses valeurs à son montage : il n'est rendu qu'une fois
// la lecture aboutie, et il est remonté quand les valeurs enregistrées
// changent ou quand on touche « Annuler » (qui, dans une section, remet les
// valeurs enregistrées). Après un enregistrement, la Comptabilité gardée
// montée relit (signal de changement).
//
// Plan 15, lot 5 : sous le formulaire, « Exercice et accueil » : le mois où
// commence l'exercice (la période « Année » devient l'exercice) et les cartes
// de l'accueil, enregistrés au geste (compta_reglages.exercice_debut_mois et
// cartes_accueil, migration 20261122_lot5_bureau).
// ─────────────────────────────────────────────────────────────────────────────

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const LIBELLES_CARTES = { ca: "Chiffre d'affaires", matiere: 'Coût matière', personnel: 'Coût du personnel', resultat: 'Résultat estimé' };

function ExerciceEtAccueil({ etabId, userId, reglages, onEnregistre }) {
  const [enCours, setEnCours] = React.useState(false);
  const cartes = reglages.cartesAccueil && reglages.cartesAccueil.length ? reglages.cartesAccueil : CARTES_ACCUEIL;
  const ecrire = async (changes) => {
    if (enCours) return;
    setEnCours(true);
    const { error } = await enregistrerAffichageCompta(etabId, changes, userId);
    setEnCours(false);
    if (error) { notify(error, 'error'); return; }
    onEnregistre();
  };
  const basculer = (id, coche) => {
    const suivantes = CARTES_ACCUEIL.filter((c) => (c === id ? coche : cartes.includes(c)));
    if (!suivantes.length) { notify("Gardez au moins une carte à l'accueil.", 'warning'); return; }
    ecrire({ cartesAccueil: suivantes.length === CARTES_ACCUEIL.length ? null : suivantes });
  };
  return (
    <div style={{ ...ui.liste, marginTop: 24 }} data-compta-exercice="">
      <Ligne titre="Début de l'exercice" aide="La période « Année » suit l'exercice de la maison, du 1er de ce mois au dernier jour du mois qui le précède.">
        <ChoixFiltre
          libelle="Début de l'exercice"
          valeur={String(reglages.exerciceDebutMois || 1)}
          options={MOIS.map((m, i) => ({ id: String(i + 1), label: m }))}
          onChange={(v) => ecrire({ exerciceDebutMois: Number(v) })}
        />
      </Ligne>
      <Ligne colonne derniere titre="Cartes de l'accueil" aide="Les grands chiffres en tête de la Comptabilité. Les tuiles et les écrans restent tous ouverts.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 16px' }}>
          {CARTES_ACCUEIL.map((id) => (
            <CaseReglage key={id} libelle={LIBELLES_CARTES[id]} coche={cartes.includes(id)} desactive={enCours} onChange={(c) => basculer(id, c)} />
          ))}
        </div>
      </Ligne>
    </div>
  );
}

export default function SectionReglagesCompta({ user, etablissement, signaler }) {
  const etabId = etablissement?.id || null;
  const lus = useTableCompta('compta_reglages', etabId, { actif: true, ordre: ['etablissement_id'] });
  const reglages = React.useMemo(() => ({ ...REGLAGES_DEFAUT, ...(lus.lignes[0] || {}) }), [lus.lignes]);
  const [tour, setTour] = React.useState(0);

  if (!etabId) return null;
  if (lus.status === 'loading') return <p style={st.attente}>Chargement…</p>;
  if (lus.status === 'error') return <p style={st.attente}>Les réglages n'ont pas pu être lus. Réessayez dans un instant.</p>;

  const valeurs = [reglages.methodeTva, reglages.tauxTdfn, reglages.chargesSocialesPct, reglages.coutHoraireMoyen].join('|');
  return (
    <>
      <EnSection>
        <FenetreReglages
          key={`${valeurs}:${tour}`}
          etabId={etabId}
          userId={user.id}
          reglages={reglages}
          absente={lus.status === 'absente'}
          onClose={() => setTour((t) => t + 1)}
          onEnregistre={() => { lus.reload(); signaler?.(); }}
        />
      </EnSection>
      {lus.status !== 'absente' && (
        <ExerciceEtAccueil etabId={etabId} userId={user.id} reglages={reglages} onEnregistre={() => { lus.reload(); signaler?.(); }} />
      )}
    </>
  );
}

const st = {
  attente: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
};
