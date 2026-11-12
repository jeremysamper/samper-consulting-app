// ─────────────────────────────────────────────────────────────────────────────
// Marges d'aujourd'hui, sans React ni service (testé par node --test,
// serieMarges.test.mjs), pour le module Statistiques. Mêmes règles que l'écran
// Marges de la Comptabilité (EcranMarges.jsx), sur le même calcul
// (chiffrerCarte et chiffrerFiche de src/utils/chiffrage.js) :
//   cartes : non archivées ; une carte cachée n'apparaît qu'au consultant
//            (l. 77) ; ses plats actifs, une portion de chaque (l. 81) ;
//   fiches : non archivées et avec un prix de vente ; une fiche cachée
//            n'apparaît qu'au consultant (l. 88).
// Prix et coûts d'aujourd'hui : aucune série dans le temps.
// ─────────────────────────────────────────────────────────────────────────────

import { buildProduitIndex } from '../../services/prixResolution.js';
import { chiffrerCarte, chiffrerFiche } from '../../utils/chiffrage.js';

export function etatMarges({ recettes = [], plats = [], cartes = [], produits = [], consultant = false }) {
  const index = buildProduitIndex(produits || []);
  const recettesParId = new Map((recettes || []).map((r) => [r.id, r]));
  return {
    cartes: (cartes || []).filter((c) => !c.archive && (consultant || !c.masquee)).map((carte) => ({
      carte,
      calcul: chiffrerCarte((plats || []).filter((p) => p.actif !== false && (p.carteIds || []).includes(carte.id)), recettesParId, index),
    })),
    fiches: (recettes || [])
      .filter((r) => r.statut !== 'archivée' && Number(r.prixVente) > 0 && (consultant || r.masquee !== true))
      .map((r) => ({ r, c: chiffrerFiche(r, index) })),
  };
}
