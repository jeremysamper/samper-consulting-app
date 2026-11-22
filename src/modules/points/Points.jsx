import React from 'react';
import { SegmentedTabs } from '../../components/ui/index.jsx';
import { canManageModule } from '../../data/demoData.js';
import { usePointsEtat } from './pointsEtat.js';
import MesPoints from './MesPoints.jsx';
import GestionPoints from './GestionPoints.jsx';
import { pointsService } from './pointsService.js';
import BoutonRegler from '../../components/ui/BoutonRegler.jsx';
import './points.css';

// ─────────────────────────────────────────────────────────────────────────────
// Module Points & boutique (lot P1, 14.11.2026).
//   Employé participant : son écran (MesPoints).
//   Qui gère « points » : Accueil, À traiter, Boutique, Équipe, Réglages (GestionPoints),
//   et « Mes points » en premier s'il participe lui-même.
// L'entrée du menu suit la même règle (entreeMenuVisible, useVisibleNav) ;
// LegacyModuleHost ferme la page à qui ne la verrait pas dans le menu.
// ─────────────────────────────────────────────────────────────────────────────

// « Accueil » d'abord : le solde de l'équipe, les cadeaux à remettre, le
// prochain cadeau et le podium (l'onglet des commandes était vide le plus
// souvent). Les commandes de cadeaux s'appellent « À traiter » (lot 3) :
// « Commandes » nommait déjà le module de commande aux fournisseurs.
const ONGLETS_GESTION = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'commandes', label: 'À traiter' },
  { id: 'boutique', label: 'Boutique' },
  { id: 'equipe', label: 'Équipe' },
];
// Les réglages des points (allumer, barème, plafonds, participants) vivent
// dans Réglages > Points depuis le plan 15 (lot 2) : « Régler » y mène.

export default function Points({ user, etablissement, permissions = null }) {
  const etabId = etablissement?.id;
  const etat = usePointsEtat(etabId, user?.id, { gereFront: canManageModule(user?.role, 'points'), role: user?.role });
  const participe = etat.actif && etat.participant;
  const onglets = React.useMemo(() => [
    ...(participe ? [{ id: 'moi', label: 'Mes points' }] : []),
    ...(etat.gere ? ONGLETS_GESTION : []),
  ], [participe, etat.gere]);
  const [onglet, setOnglet] = React.useState(null);
  // Ouverture (lot 3) : l'équipe arrive sur « Mes points » ; la direction sur
  // « À traiter » seulement si une commande attend, sinon sur l'accueil. Lu
  // une fois, avant de rendre les onglets : l'écran ne saute pas d'un onglet
  // à l'autre sous le doigt.
  const [aTraiter, setATraiter] = React.useState(null);
  React.useEffect(() => {
    if (!etat.pret || !etat.gere || participe || !etabId) return undefined;
    let vivant = true;
    pointsService.commandes(etabId)
      .then((ks) => { if (vivant) setATraiter(ks.some((k) => k.statut === 'demandee')); })
      .catch(() => { if (vivant) setATraiter(false); });
    return () => { vivant = false; };
  }, [etat.pret, etat.gere, participe, etabId]);
  const ouverture = !participe && aTraiter ? 'commandes' : onglets[0]?.id;
  const courant = onglets.some((o) => o.id === onglet) ? onglet : ouverture;
  const ouvertureEnLecture = etat.gere && !participe && aTraiter === null && onglet === null;

  if (!etat.pret || ouvertureEnLecture) {
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
    return <MesPoints user={user} etablissement={etablissement} permissions={permissions} bareme={etat.bareme} plafonds={{ jour: etat.plafondJour, mois: etat.plafondMois }} />;
  }

  return (
    <div className="points-page" data-points-ecran="gestion">
      <div className="points-grille">
        <h1 className="points-titre">{courant === 'moi' ? 'Mes points' : 'Points de l\'équipe'}</h1>
        {!etat.actif && (
          <p className="points-aide" role="status">Les points sont éteints pour cet établissement : l'équipe ne voit rien et ne gagne rien. Ils s'allument dans Réglages.</p>
        )}
        <div className="points-onglets" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SegmentedTabs tabs={onglets} active={courant} onChange={setOnglet} />
          <BoutonRegler section="points" user={user} etablissement={etablissement} style={{ marginLeft: 'auto' }} />
        </div>
        {courant === 'moi'
          ? <MesPoints user={user} etablissement={etablissement} permissions={permissions} bareme={etat.bareme} plafonds={{ jour: etat.plafondJour, mois: etat.plafondMois }} sansTitre />
          : <GestionPoints key={`${etabId}-${courant}`} onglet={courant} user={user} etablissement={etablissement} etat={etat} onOnglet={setOnglet} />}
      </div>
    </div>
  );
}
