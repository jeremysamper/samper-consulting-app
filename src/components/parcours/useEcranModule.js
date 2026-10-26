import React from 'react';
import { readLegacyStorage, writeLegacyStorage } from '../../legacy/legacyApi.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';

// ─────────────────────────────────────────────────────────────────────────────
// État d'écran d'un module à parcours : l'accueil (une tuile par tâche), puis
// un écran par tâche. Mémorisé sous sc_<module>_ecran ; seuls les écrans
// listés dans `repris` sont rouverts à l'ouverture suivante, les autres
// repartent de l'accueil (un écran soumis à un droit n'est listé que si le
// droit est là). Le geste retour (useBackLayer), Échap et le bouton « Retour »
// d'EcranTache ramènent à l'accueil du module ; le retour à l'accueil de
// l'app reste celui de la coque.
//
//   const { ecran, setEcran, retourAccueil } = useEcranModule('inventaire', {
//     repris: canRegler ? ['comptage', 'reglement'] : ['comptage'],
//     surRetour: () => setAVerifier([]),
//   });
// ─────────────────────────────────────────────────────────────────────────────

export const ECRAN_ACCUEIL = 'accueil';

export function useEcranModule(module, { repris = [], surRetour } = {}) {
  const cle = `sc_${module}_ecran`;
  const [ecran, setEcran] = React.useState(() => {
    const memo = readLegacyStorage(cle, ECRAN_ACCUEIL);
    return repris.includes(memo) ? memo : ECRAN_ACCUEIL;
  });

  React.useEffect(() => { writeLegacyStorage(cle, ecran); }, [cle, ecran]);

  // `surRetour` peut changer à chaque rendu : lu par référence, il ne
  // relance pas l'effet Échap ci-dessous, qui dépend de retourAccueil.
  // (useBackLayer garde déjà sa propre référence de la fonction de fermeture.)
  const surRetourRef = React.useRef(surRetour);
  surRetourRef.current = surRetour;
  const retourAccueil = React.useCallback(() => {
    surRetourRef.current?.();
    setEcran(ECRAN_ACCUEIL);
  }, []);

  useBackLayer(ecran !== ECRAN_ACCUEIL, retourAccueil, `${module}-ecran`);

  // Échap aussi, sauf quand une fenêtre est ouverte (elle se ferme seule,
  // Fenetres.jsx) ou qu'un champ a la main (Échap y annule la frappe).
  React.useEffect(() => {
    if (ecran === ECRAN_ACCUEIL) return undefined;
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[data-fenetre], [role="dialog"]')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      retourAccueil();
    };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [ecran, retourAccueil]);

  return { ecran, setEcran, retourAccueil };
}
