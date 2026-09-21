import { useEffect, useMemo, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// useOrdreLectures - met de l'ordre dans les relectures d'un écran qui recharge
// souvent : reprise après veille, realtime, retour d'une modification, bouton
// « Réessayer ». Deux lectures lancées l'une après l'autre peuvent revenir dans
// le désordre, et chacune peut échouer.
//
//   - Une réponse n'est affichée que si elle est PLUS RÉCENTE que celle déjà à
//     l'écran et qu'elle porte encore sur ce qui est demandé (même jour, même
//     semaine…) : une réponse lente ne repeint jamais un écran plus frais.
//   - Elle l'est même si d'autres lectures sont parties depuis. N'accepter que
//     la toute dernière figerait l'écran pendant une rafale (placements en
//     realtime en plein service sur un réseau lent) : chaque nouvelle lecture
//     annulerait celle qui allait aboutir.
//   - Un échec n'est signalé que par la dernière lecture lancée, et seulement
//     si aucune réponse n'a été affichée pendant qu'elle courait.
//
// Usage :
//   const lectures = useOrdreLectures();
//   const lecture = lectures.lancer(cle);
//   const res = await …;
//   if (res.error) { if (lecture.signalerEchec()) { …afficher l'échec… } return; }
//   if (!lecture.appliquer()) return;
//   …afficher res.data…
// ─────────────────────────────────────────────────────────────────────────────

export function useOrdreLectures() {
  const etatRef = useRef({ lancees: 0, affichee: 0, cle: null, monte: true });

  useEffect(() => {
    const etat = etatRef.current;
    etat.monte = true;
    return () => { etat.monte = false; };
  }, []);

  return useMemo(() => ({
    lancer(cle) {
      const etat = etatRef.current;
      const numero = ++etat.lancees;
      const afficheeAuDepart = etat.affichee;
      etat.cle = cle;
      // Écran démonté, ou autre chose demandé depuis (changement de semaine) :
      // la réponse ne concerne plus rien de ce qui est à l'écran.
      const pertinente = () => etat.monte && etat.cle === cle;
      return {
        appliquer() {
          if (!pertinente() || numero <= etat.affichee) return false;
          etat.affichee = numero;
          return true;
        },
        signalerEchec() {
          return pertinente() && numero === etat.lancees && etat.affichee === afficheeAuDepart;
        },
      };
    },
  }), []);
}
