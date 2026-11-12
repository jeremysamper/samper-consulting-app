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
//
// fixe : le module est monté sur un seul écran, hors de sa page (son écran de
// réglage, dans la page des réglages). L'écran ne change pas, rien n'est
// mémorisé sous la clé du module, ni calque d'historique ni Échap : c'est la
// page hôte qui tient la navigation. retourAccueil referme seulement les
// fenêtres de l'écran (surRetour).
// ─────────────────────────────────────────────────────────────────────────────

export const ECRAN_ACCUEIL = 'accueil';

const sansEffet = () => {};

export function useEcranModule(module, { repris = [], surRetour, fixe = null } = {}) {
  const cle = `sc_${module}_ecran`;
  const [ecranLibre, setEcranLibre] = React.useState(() => {
    if (fixe) return fixe;
    const memo = readLegacyStorage(cle, ECRAN_ACCUEIL);
    return repris.includes(memo) ? memo : ECRAN_ACCUEIL;
  });
  const ecran = fixe || ecranLibre;
  const setEcran = fixe ? sansEffet : setEcranLibre;

  React.useEffect(() => { if (!fixe) writeLegacyStorage(cle, ecran); }, [cle, ecran, fixe]);

  // `surRetour` peut changer à chaque rendu : lu par référence, il ne
  // relance pas l'effet Échap ci-dessous, qui dépend de retourAccueil.
  // (useBackLayer garde déjà sa propre référence de la fonction de fermeture.)
  const surRetourRef = React.useRef(surRetour);
  surRetourRef.current = surRetour;
  const retourAccueil = React.useCallback(() => {
    surRetourRef.current?.();
    if (!fixe) setEcranLibre(ECRAN_ACCUEIL);
  }, [fixe]);

  useBackLayer(!fixe && ecran !== ECRAN_ACCUEIL, retourAccueil, `${module}-ecran`);

  // Échap aussi, sauf quand une fenêtre est ouverte (elle se ferme seule,
  // Fenetres.jsx) ou qu'un champ a la main (Échap y annule la frappe).
  React.useEffect(() => {
    if (fixe || ecran === ECRAN_ACCUEIL) return undefined;
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[data-fenetre], [role="dialog"]')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      retourAccueil();
    };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [ecran, retourAccueil, fixe]);

  return { ecran, setEcran, retourAccueil };
}
