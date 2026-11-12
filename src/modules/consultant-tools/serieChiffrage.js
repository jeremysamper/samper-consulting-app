// ─────────────────────────────────────────────────────────────────────────────
// Chiffrage d'aujourd'hui des fiches, sans React ni service (testé par node
// --test, serieChiffrage.test.mjs), pour le module Statistiques. Même règle
// que le Chiffrage des Outils consultant (ConsultantTools.jsx) : les fiches
// non archivées de l'établissement (l. 188), chiffrées par chiffrerFiche
// (l. 227), cachées comprises (le consultant les voit, avec leur badge).
// Prix et coûts d'aujourd'hui : aucune série dans le temps.
// ─────────────────────────────────────────────────────────────────────────────

import { buildProduitIndex } from '../../services/prixResolution.js';
import { chiffrerFiche } from '../../utils/chiffrage.js';

export function etatChiffrage({ recettes = [], produits = [] }) {
  const index = buildProduitIndex(produits || []);
  return (recettes || [])
    .filter((r) => r.statut !== 'archivée')
    .map((r) => ({ r, c: chiffrerFiche(r, index) }))
    .sort((a, b) => String(a.r.nom || '').localeCompare(String(b.r.nom || ''), 'fr'));
}
