// ─────────────────────────────────────────────────────────────────────────────
// Résumé des points de la personne connectée pour le widget « Mes points » du
// tableau de bord : solde, 50 derniers mouvements (gains du mois) et cadeaux
// (prochain cadeau à portée). Lu seulement quand le système est allumé et
// qu'elle participe (garde posée par le tableau de bord, jamais par la
// disposition). Relu à chaque mouvement reçu par l'abonnement de la coque
// (usePointsRetour), sans second canal.
//
// Une lecture en échec garde la dernière réponse ; sans réponse, `lu` reste
// faux et le widget ne se rend pas (aucun solde simulé).
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { useOrdreLectures } from '../../hooks/useOrdreLectures.js';
import { pointsService } from './pointsService.js';
import { ecouterMouvements } from './usePointsRetour.js';

export function useResumePoints({ etabId, userId, enabled }) {
  const [donnees, setDonnees] = React.useState(null);
  const lectures = useOrdreLectures();
  const cle = enabled && etabId && userId ? `${userId}|${etabId}` : null;

  const charger = React.useCallback(async () => {
    if (!cle) return;
    const lecture = lectures.lancer(cle);
    try {
      const [solde, mouvements, cadeaux] = await Promise.all([
        pointsService.solde(etabId),
        pointsService.mesMouvements(etabId, userId),
        pointsService.cadeaux(etabId),
      ]);
      if (!lecture.appliquer()) return;
      setDonnees({ cle, solde, mouvements, cadeaux });
    } catch (err) {
      console.warn('[points] résumé non lu', err?.message || err);
      lecture.signalerEchec();
    }
  }, [cle, etabId, userId, lectures]);

  React.useEffect(() => { charger(); }, [charger]);
  React.useEffect(() => (cle ? ecouterMouvements(() => charger()) : undefined), [cle, charger]);

  // Une réponse d'une autre personne ou d'un autre établissement ne s'affiche pas.
  const courant = donnees && donnees.cle === cle ? donnees : null;
  return React.useMemo(() => ({
    lu: Boolean(courant),
    solde: courant?.solde ?? 0,
    mouvements: courant?.mouvements ?? [],
    cadeaux: courant?.cadeaux ?? [],
  }), [courant]);
}
