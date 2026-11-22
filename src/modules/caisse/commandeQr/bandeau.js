// Bandeau des commandes QR (lot L3) : petites règles pures, testées dans
// bandeau.test.mjs.

// Motifs proposés au refus ; « Autre motif » ouvre un champ libre.
export const MOTIFS_REFUS = [
  "Pas de pièce d'identité pour l'alcool",
  'Produit épuisé',
  'Table introuvable',
  'Commande en double',
  'Bar fermé',
];

// Âge d'une commande : { unite: 'instant' } sous la minute, puis en minutes,
// puis en heures.
export function ageCommande(createdAt, maintenant = Date.now()) {
  const ms = Math.max(0, maintenant - new Date(createdAt).getTime());
  const min = Math.floor(ms / 60000);
  if (min < 1) return { unite: 'instant', valeur: 0 };
  if (min < 60) return { unite: 'min', valeur: min };
  return { unite: 'h', valeur: Math.floor(min / 60) };
}

// Où servir : au bar, ou la table (nom gardé à la commande, même si la table
// a quitté le plan depuis).
export function lieuCommande(commande) {
  if (commande?.au_bar) return { auBar: true, table: null };
  return { auBar: false, table: commande?.table_nom || '?' };
}
