import React from 'react';
import { SegmentedTabs } from '../../components/ui/index.jsx';
import { canManageModule } from '../../data/demoData.js';
import { usePointsEtat } from './pointsEtat.js';
import MesPoints from './MesPoints.jsx';
import GestionPoints from './GestionPoints.jsx';
import './points.css';

// ─────────────────────────────────────────────────────────────────────────────
// Module Points & boutique (lot P1, 14.11.2026).
//   Employé participant : son écran (MesPoints).
//   Qui gère « points » : Commandes, Boutique, Équipe, Réglages (GestionPoints),
//   et « Mes points » en premier s'il participe lui-même.
// L'entrée du menu suit la même règle (entreeMenuVisible, useVisibleNav) ;
// LegacyModuleHost ferme la page à qui ne la verrait pas dans le menu.
// ─────────────────────────────────────────────────────────────────────────────

const ONGLETS_GESTION = [
  { id: 'commandes', label: 'Commandes' },
  { id: 'boutique', label: 'Boutique' },
  { id: 'equipe', label: 'Équipe' },
  { id: 'reglages', label: 'Réglages' },
];

export default function Points({ user, etablissement }) {
  const etabId = etablissement?.id;
  const etat = usePointsEtat(etabId, user?.id, { gereFront: canManageModule(user?.role, 'points') });
  const participe = etat.actif && etat.participant;
  const onglets = React.useMemo(() => [
    ...(participe ? [{ id: 'moi', label: 'Mes points' }] : []),
    ...(etat.gere ? ONGLETS_GESTION : []),
  ], [participe, etat.gere]);
  const [onglet, setOnglet] = React.useState(null);
  const courant = onglets.some((o) => o.id === onglet) ? onglet : onglets[0]?.id;

  if (!etat.pret) {
    return <div className="points-page"><p className="points-aide">Chargement…</p></div>;
  }
  if (!onglets.length) {
    return (
      <div className="points-page">
        <p className="points-aide">Les points ne sont pas ouverts pour vous dans cet établissement.</p>
      </div>
    );
  }
  if (!etat.gere) {
    return <MesPoints user={user} etablissement={etablissement} bareme={etat.bareme} />;
  }

  return (
    <div className="points-page" data-points-ecran="gestion">
      <div className="points-grille">
        <h1 className="points-titre">{courant === 'moi' ? 'Mes points' : 'Points de l\'équipe'}</h1>
        {!etat.actif && courant !== 'reglages' && (
          <p className="points-aide" role="status">Les points sont éteints pour cet établissement : l'équipe ne voit rien et ne gagne rien. Ils s'allument dans Réglages.</p>
        )}
        <SegmentedTabs tabs={onglets} active={courant} onChange={setOnglet} />
        {courant === 'moi'
          ? <MesPoints user={user} etablissement={etablissement} bareme={etat.bareme} sansTitre />
          : <GestionPoints key={`${etabId}-${courant}`} onglet={courant} user={user} etablissement={etablissement} etat={etat} />}
      </div>
    </div>
  );
}
