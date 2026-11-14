import React from 'react';
import { EnSection } from '../../components/ui/Fenetres.jsx';
import FenetreReglages from './FenetreReglages.jsx';
import { REGLAGES_DEFAUT, useTableCompta } from './comptaService.js';

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
// ─────────────────────────────────────────────────────────────────────────────

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
  );
}

const st = {
  attente: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
};
