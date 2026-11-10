import { Cake, ConciergeBell, Croissant, Gift, Leaf, Wheat, Wine, Zap } from 'lucide-react';

// Habillage des boutons produits (caisse_boutons, migration v3).
// couleur = cle de la palette --caisse-* d'app.css (jamais un hex) ;
// picto = cle d'une liste fermee d'icones lucide DEJA importees ailleurs
// dans l'app (aucune dependance ni icone nouvelle : etape 0 du brief v3).

export const COULEURS = ['rouge', 'orange', 'jaune', 'vert', 'turquoise', 'bleu', 'violet', 'rose'];

// Libelles d'accessibilite des pastilles. « couleur bleue » et pas « bleu » :
// « bleu » est deja une cuisson au glossaire, les deux se traduiraient
// differemment sous le meme coeur (lint:glossary).
export const LIBELLES_COULEURS = {
  rouge: 'couleur rouge', orange: 'couleur orange', jaune: 'couleur jaune', vert: 'couleur verte',
  turquoise: 'couleur turquoise', bleu: 'couleur bleue', violet: 'couleur violette', rose: 'couleur rose',
};

export const PICTOS = [
  { id: 'croissant', Icone: Croissant, libelle: 'croissant' },
  { id: 'ble', Icone: Wheat, libelle: 'blé' },
  { id: 'feuille', Icone: Leaf, libelle: 'feuille' },
  { id: 'cloche', Icone: ConciergeBell, libelle: 'cloche' },
  { id: 'gateau', Icone: Cake, libelle: 'gâteau' },
  { id: 'verre', Icone: Wine, libelle: 'verre' },
  { id: 'cadeau', Icone: Gift, libelle: 'cadeau' },
  { id: 'eclair', Icone: Zap, libelle: 'éclair' },
];

export function pictoParId(id) {
  return PICTOS.find((p) => p.id === id) || null;
}

// Nom court par defaut : tronque proprement (pas de coupe au milieu d'un mot
// quand un espace est assez proche), ellipse en '...' ASCII.
export function nomCourtDefaut(nom, max = 18) {
  const n = String(nom || '').trim();
  if (n.length <= max) return n;
  const coupe = n.slice(0, max + 1);
  const esp = coupe.lastIndexOf(' ');
  const garde = esp > 8 ? coupe.slice(0, esp) : coupe.slice(0, max);
  return garde.replace(/[ ,;:]+$/, '') + '...';
}

// Correspondance evidente categorie -> picto ; sinon aucun.
export function pictoDefaut(categorie) {
  if (categorie === 'Boissons') return 'verre';
  if (categorie === 'Desserts') return 'gateau';
  return null;
}
