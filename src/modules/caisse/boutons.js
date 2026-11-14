import {
  Apple, Baby, Banana, Bean, BedDouble, Beef, Beer, BottleWine, Cake, CakeSlice, Candy, Carrot, ChefHat, Cherry,
  Citrus, Clock, Coffee, Cookie, CookingPot, ConciergeBell, Croissant, Crown, CupSoda, Dessert, Donut, Drumstick,
  Egg, EggFried, Fish, Flame, Flower2, Gift, GlassWater, Grape, Ham, Hamburger, HandPlatter, Heart, IceCreamBowl,
  IceCreamCone, Leaf, LeafyGreen, Lollipop, Martini, Milk, Moon, Nut, PartyPopper, Percent, Pizza, Popcorn, Salad,
  Sandwich, Shell, ShoppingBag, Shrimp, Snowflake, Soup, Sparkles, Sprout, Star, Sun, Tag, Users,
  UtensilsCrossed, Vegan, Wheat, WheatOff, Wine, Zap,
} from 'lucide-react';

// Habillage des boutons produits et des categories (caisse_boutons,
// caisse_categories). couleur = cle d'un jeton --caisse-* d'app.css (jamais
// un hex) ; picto = cle d'une icone lucide de la liste ci-dessous. La base ne
// garde que la forme de la cle (migration 20261114_caisse_habillage_etendu) :
// une cle inconnue ici rend le bouton neutre, sans erreur. Une cle stockee ne
// change jamais de sens : on ajoute, on ne renomme pas.

// ── Couleurs : douces, vives, neutres. Chaque cle a son jeton --caisse-<cle>
//    dans le bloc :root d'app.css et dans les deux blocs sombres. ──
const TEINTES = [
  ['rouge', 'rouge', 'rouge'],
  ['orange', 'orange', 'orange'],
  ['jaune', 'jaune', 'jaune'],
  ['anis', 'anis', 'anis'],
  ['vert', 'verte', 'vert'],
  ['turquoise', 'turquoise', 'turquoise'],
  ['ciel', 'ciel', 'ciel'],
  // « couleur bleue » et pas « bleu » : « bleu » est deja une cuisson au
  // glossaire, les deux se traduiraient differemment sous le meme coeur.
  ['bleu', 'bleue', 'bleu'],
  ['indigo', 'indigo', 'indigo'],
  ['violet', 'violette', 'violet'],
  ['fuchsia', 'fuchsia', 'fuchsia'],
  ['rose', 'rose', 'rose'],
];

export const GROUPES_COULEURS = [
  { titre: 'Douces', cles: TEINTES.map(([cle]) => cle) },
  { titre: 'Vives', cles: TEINTES.map(([cle]) => `${cle}-vif`) },
  { titre: 'Neutres', cles: ['gris', 'ardoise', 'sable', 'caramel'] },
];

export const COULEURS = GROUPES_COULEURS.flatMap((g) => g.cles);

// Libelles d'accessibilite des pastilles. Un adjectif de couleur compose
// reste invariable : « couleur bleu vif ».
export const LIBELLES_COULEURS = {
  ...Object.fromEntries(TEINTES.map(([cle, accorde]) => [cle, `couleur ${accorde}`])),
  ...Object.fromEntries(TEINTES.map(([cle, , invariable]) => [`${cle}-vif`, `couleur ${invariable} vif`])),
  gris: 'couleur grise', ardoise: 'couleur ardoise', sable: 'couleur sable', caramel: 'couleur caramel',
};

// ── Pictos, ranges par famille pour le choix. ──
export const GROUPES_PICTOS = [
  {
    titre: 'Boissons',
    pictos: [
      { id: 'cafe', Icone: Coffee, libelle: 'café' },
      { id: 'soda', Icone: CupSoda, libelle: 'soda' },
      { id: 'eau', Icone: GlassWater, libelle: "verre d'eau" },
      { id: 'lait', Icone: Milk, libelle: 'lait' },
      { id: 'biere', Icone: Beer, libelle: 'bière' },
      { id: 'verre', Icone: Wine, libelle: 'verre' },
      { id: 'bouteille', Icone: BottleWine, libelle: 'bouteille de vin' },
      { id: 'cocktail', Icone: Martini, libelle: 'cocktail' },
      { id: 'agrume', Icone: Citrus, libelle: 'agrume' },
    ],
  },
  {
    titre: 'Plats',
    pictos: [
      { id: 'couverts', Icone: UtensilsCrossed, libelle: 'fourchette et couteau' },
      { id: 'plateau', Icone: HandPlatter, libelle: 'plat servi' },
      { id: 'toque', Icone: ChefHat, libelle: 'toque' },
      { id: 'marmite', Icone: CookingPot, libelle: 'marmite' },
      { id: 'salade', Icone: Salad, libelle: 'salade' },
      { id: 'soupe', Icone: Soup, libelle: 'soupe' },
      { id: 'poisson', Icone: Fish, libelle: 'poisson' },
      { id: 'crevette', Icone: Shrimp, libelle: 'crevette' },
      { id: 'coquillage', Icone: Shell, libelle: 'coquillage' },
      { id: 'viande', Icone: Beef, libelle: 'viande' },
      { id: 'volaille', Icone: Drumstick, libelle: 'volaille' },
      { id: 'jambon', Icone: Ham, libelle: 'jambon' },
      { id: 'oeuf', Icone: Egg, libelle: 'œuf' },
      { id: 'oeuf-plat', Icone: EggFried, libelle: 'œuf au plat' },
      { id: 'pizza', Icone: Pizza, libelle: 'pizza' },
      { id: 'sandwich', Icone: Sandwich, libelle: 'sandwich' },
      { id: 'burger', Icone: Hamburger, libelle: 'burger' },
    ],
  },
  {
    titre: 'Produits',
    pictos: [
      { id: 'ble', Icone: Wheat, libelle: 'blé' },
      { id: 'feuille', Icone: Leaf, libelle: 'feuille' },
      { id: 'legume-vert', Icone: LeafyGreen, libelle: 'légume vert' },
      { id: 'pousse', Icone: Sprout, libelle: 'pousse' },
      { id: 'carotte', Icone: Carrot, libelle: 'carotte' },
      { id: 'pomme', Icone: Apple, libelle: 'pomme' },
      { id: 'cerise', Icone: Cherry, libelle: 'cerise' },
      { id: 'raisin', Icone: Grape, libelle: 'raisin' },
      { id: 'banane', Icone: Banana, libelle: 'banane' },
      { id: 'noix', Icone: Nut, libelle: 'noix' },
      { id: 'haricot', Icone: Bean, libelle: 'haricot' },
      { id: 'fleur', Icone: Flower2, libelle: 'fleur' },
      { id: 'vegetalien', Icone: Vegan, libelle: 'végétalien' },
      { id: 'sans-gluten', Icone: WheatOff, libelle: 'sans gluten' },
    ],
  },
  {
    titre: 'Desserts',
    pictos: [
      { id: 'croissant', Icone: Croissant, libelle: 'croissant' },
      { id: 'gateau', Icone: Cake, libelle: 'gâteau' },
      { id: 'part-gateau', Icone: CakeSlice, libelle: 'part de gâteau' },
      { id: 'dessert', Icone: Dessert, libelle: 'dessert' },
      { id: 'biscuit', Icone: Cookie, libelle: 'biscuit' },
      { id: 'beignet', Icone: Donut, libelle: 'beignet' },
      { id: 'cornet', Icone: IceCreamCone, libelle: 'cornet de glace' },
      { id: 'coupe', Icone: IceCreamBowl, libelle: 'coupe glacée' },
      { id: 'bonbon', Icone: Candy, libelle: 'bonbon' },
      { id: 'sucette', Icone: Lollipop, libelle: 'sucette' },
      { id: 'popcorn', Icone: Popcorn, libelle: 'pop-corn' },
    ],
  },
  {
    titre: 'Repères',
    pictos: [
      { id: 'cloche', Icone: ConciergeBell, libelle: 'cloche' },
      { id: 'cadeau', Icone: Gift, libelle: 'cadeau' },
      { id: 'eclair', Icone: Zap, libelle: 'éclair' },
      { id: 'etoile', Icone: Star, libelle: 'étoile' },
      { id: 'coeur', Icone: Heart, libelle: 'cœur' },
      { id: 'flamme', Icone: Flame, libelle: 'flamme' },
      { id: 'flocon', Icone: Snowflake, libelle: 'flocon' },
      { id: 'soleil', Icone: Sun, libelle: 'soleil' },
      { id: 'lune', Icone: Moon, libelle: 'lune' },
      { id: 'horloge', Icone: Clock, libelle: 'horloge' },
      { id: 'enfant', Icone: Baby, libelle: 'enfant' },
      { id: 'pourcentage', Icone: Percent, libelle: 'pourcentage' },
      { id: 'etiquette', Icone: Tag, libelle: 'étiquette' },
      { id: 'couronne', Icone: Crown, libelle: 'couronne' },
      { id: 'etincelles', Icone: Sparkles, libelle: 'étincelles' },
      { id: 'emporter', Icone: ShoppingBag, libelle: 'à emporter' },
      { id: 'chambre', Icone: BedDouble, libelle: 'chambre' },
      { id: 'groupe', Icone: Users, libelle: 'groupe' },
      { id: 'fete', Icone: PartyPopper, libelle: 'fête' },
    ],
  },
];

export const PICTOS = GROUPES_PICTOS.flatMap((g) => g.pictos);

const PICTOS_PAR_ID = new Map(PICTOS.map((p) => [p.id, p]));

export function pictoParId(id) {
  return PICTOS_PAR_ID.get(id) || null;
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
