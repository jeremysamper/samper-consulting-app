import { normalizeSearch } from '../../utils/searchText.js';

// ─────────────────────────────────────────────────────────────────────────────
// CLASSEMENT DES PRODUITS DE LA COMMANDE PAR RAYON
//
// Les ingrédients des recettes sont saisis en texte libre et presque jamais
// liés au catalogue : la liste de commande tombait donc à 87 % en « Autres »
// (relevé du 01.10.2026 : 340 lignes sur 391). Ce classeur range un nom de
// produit dans un rayon, sans IA, hors ligne, en trois temps :
//   1. préparation maison : le nom est celui d'une recette de l'établissement
//      (insert, sauce, pickles…) — à produire, pas à commander ;
//   2. catalogue : le produit existe dans le catalogue de l'établissement, on
//      reprend sa catégorie ;
//   3. mots-clés : dictionnaire de cuisine ci-dessous.
//
// Les libellés de rayon sont ceux du catalogue (module Catalogue / Inventaire),
// pour qu'une ligne liée et une ligne classée par mot-clé tombent dans le même
// groupe.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTRES = 'Autres';
export const PREPARATIONS_MAISON = 'Préparations maison';
export const HYGIENE = 'Hygiène & consommables';

// Ordre d'affichage : celui d'une tournée de réception, du frais au sec, puis
// le non alimentaire. Une catégorie inconnue se range avant « Autres », par
// ordre alphabétique.
export const RAYONS = [
  'Fruits & légumes',
  'Herbes / épices',
  'Viandes',
  'Poissons & fruits de mer',
  'Produits laitiers',
  'Crèmerie / fromages',
  'Surgelés',
  'Boulangerie / pâtisserie',
  'Épicerie sèche',
  'Condiments / sauces',
  'Boissons',
  'Alcools',
  PREPARATIONS_MAISON,
  HYGIENE,
  'Hygiène / non alimentaire',
  AUTRES,
];

// Mots-clés par rayon, écrits sans accent ni majuscule (normalizeSearch).
// Un mot-clé ne matche qu'en début de mot : « the » ne prend pas « thym ».
// Le pluriel simple (s / x) est accepté en fin de mot-clé.
const MOTS_CLES = {
  'Fruits & légumes': [
    'pomme', 'poire', 'citron', 'orange', 'pamplemousse', 'mandarine', 'clementine', 'yuzu', 'bergamote',
    'fraise', 'framboise', 'myrtille', 'mure', 'cassis', 'groseille', 'cerise', 'abricot', 'peche', 'nectarine',
    'prune', 'mirabelle', 'raisin', 'figue', 'banane', 'ananas', 'mangue', 'passion', 'kiwi', 'melon',
    'pasteque', 'grenade', 'coing', 'rhubarbe', 'avocat', 'datte fraiche', 'litchi', 'physalis', 'kumquat',
    'tomate', 'concombre', 'courgette', 'aubergine', 'poivron', 'piment', 'carotte', 'navet', 'radis',
    'betterave', 'celeri', 'fenouil', 'poireau', 'oignon', 'echalote', 'ail', 'cebette', 'oignon nouveau',
    'chou', 'brocoli', 'epinard', 'blette', 'salade', 'laitue', 'roquette', 'mesclun', 'endive', 'cresson',
    'mache', 'frisee', 'scarole', 'trevise', 'radicchio', 'pousse', 'jeunes pousses', 'micro pousse',
    'asperge', 'artichaut', 'haricot vert', 'petit pois', 'pois gourmand', 'feve', 'mais', 'courge',
    'butternut', 'potimarron', 'potiron', 'citrouille', 'patate douce', 'pomme de terre', 'grenaille',
    'topinambour', 'panais', 'rutabaga', 'salsifis', 'champignon', 'cepe', 'chanterelle', 'girolle',
    'morille', 'pleurote', 'shiitake', 'trompette', 'truffe', 'pied de mouton', 'gingembre', 'raifort',
    'citronnelle', 'fleur comestible', 'capucine', 'airelle', 'baie', 'arbouse', 'sureau', 'argousier',
  ],
  'Herbes / épices': [
    'thym', 'romarin', 'laurier', 'persil', 'ciboulette', 'cerfeuil', 'estragon', 'basilic', 'menthe',
    'coriandre', 'aneth', 'sauge', 'origan', 'marjolaine', 'sarriette', 'livèche', 'livache', 'oseille',
    'verveine', 'mélisse', 'melisse', 'shiso', 'herbes', 'fines herbes', 'bouquet garni',
    'poivre', 'baie rose', 'cumin', 'curcuma', 'paprika', 'piment d espelette', 'espelette', 'cannelle',
    'muscade', 'girofle', 'cardamome', 'badiane', 'anis', 'safran', 'vanille', 'tonka', 'feve de tonka',
    'curry', 'garam masala', 'ras el hanout', 'za atar', 'sumac', 'fenugrec', 'graine de coriandre',
    'graine de fenouil', 'sel', 'fleur de sel', 'gros sel', 'sel fin', 'epice', 'quatre epices', 'genievre',
    'cacao amer', 'feve tonka',
    // Cueillette et aromates de montagne.
    'sapin', 'aiguille de sapin', 'pousse de sapin', 'poudre de sapin', 'epicea', 'fleur de foin', 'foin',
    'reine des pres', 'serpolet', 'genepi',
  ],
  'Viandes': [
    'boeuf', 'veau', 'agneau', 'mouton', 'porc', 'cochon', 'poulet', 'volaille', 'pintade', 'canard',
    'magret', 'foie gras', 'dinde', 'caille', 'pigeon', 'lapin', 'chevreuil', 'cerf', 'sanglier', 'gibier',
    'faisan', 'perdreau', 'cheval', 'entrecote', 'faux filet', 'filet mignon', 'onglet', 'bavette',
    'hampe', 'cote de boeuf', 'tournedos', 'joue', 'paleron', 'jarret', 'rumsteck', 'tartare de boeuf',
    'steak', 'viande hachee', 'saucisse', 'chipolata', 'merguez', 'lard', 'lardon', 'bacon',
    'jambon', 'coppa', 'pancetta', 'chorizo', 'saucisson', 'viande sechee', 'bresaola', 'rillettes',
    'terrine', 'pate en croute', 'charcuterie', 'os a moelle', 'moelle', 'parure', 'carcasse', 'abats',
    'ris de veau', 'rognon', 'foie de', 'cuisse', 'supreme', 'blanc de poulet', 'aiguillette', 'cote',
    'carre', 'epaule', 'gigot', 'souris', 'poitrine', 'echine', 'travers',
  ],
  'Poissons & fruits de mer': [
    'poisson', 'saumon', 'truite', 'omble', 'feras', 'perche', 'brochet', 'sandre', 'cabillaud', 'dos de',
    'merlu', 'lieu', 'colin', 'bar', 'loup', 'dorade', 'daurade', 'sole', 'turbot', 'barbue', 'lotte',
    'thon', 'espadon', 'maquereau', 'sardine', 'anchois', 'hareng', 'rouget', 'saint pierre', 'flétan',
    'fletan', 'raie', 'haddock', 'eglefin', 'crevette', 'gambas', 'langoustine', 'homard', 'langouste',
    'crabe', 'tourteau', 'araignee', 'moule', 'huitre', 'coquille saint jacques', 'saint jacques',
    'noix de saint jacques', 'palourde', 'coque', 'couteau', 'bulot', 'poulpe', 'calamar', 'encornet',
    'seiche', 'oursin', 'caviar', 'oeufs de truite', 'oeufs de saumon', 'tarama', 'fumet de poisson',
  ],
  'Produits laitiers': [
    'lait', 'creme', 'creme fraiche', 'creme entiere', 'creme double', 'beurre', 'yaourt', 'yogourt',
    'fromage blanc', 'faisselle', 'petit suisse', 'lait ribot', 'babeurre', 'kefir', 'skyr', 'oeuf',
    'jaune d oeuf', 'jaunes d oeufs', 'blanc d oeuf', 'blancs d oeufs', 'oeufs', 'mascarpone', 'ricotta',
    'creme aigre', 'sour cream', 'lait fermente',
  ],
  'Crèmerie / fromages': [
    'fromage', 'parmesan', 'gruyere', 'emmental', 'comte', 'beaufort', 'tomme', 'raclette', 'vacherin',
    'tete de moine', 'reblochon', 'camembert', 'brie', 'chevre', 'feta', 'mozzarella', 'burrata',
    'stracciatella', 'gorgonzola', 'roquefort', 'bleu', 'cheddar', 'pecorino', 'grana', 'sbrinz',
    'appenzeller', 'etivaz', 'serac', 'halloumi', 'manchego', 'morbier', 'mont d or', 'fondue',
  ],
  'Surgelés': ['surgele', 'congele', 'glace', 'sorbet', 'creme glacee'],
  'Boulangerie / pâtisserie': [
    'pain', 'pain de mie', 'baguette', 'brioche', 'bun', 'burger bun', 'focaccia', 'ciabatta', 'tortilla',
    'wrap', 'pita', 'naan', 'croissant', 'feuilletage', 'pate feuilletee', 'pate brisee', 'pate sablee',
    'pate filo', 'brick', 'chapelure', 'panko', 'crouton', 'biscuit', 'speculoos', 'macaron', 'meringue',
    'genoise', 'fond de tarte',
  ],
  'Épicerie sèche': [
    'farine', 'sucre', 'cassonade', 'vergeoise', 'sucre glace', 'miel', 'sirop d erable', 'sirop',
    'riz', 'risotto', 'arborio', 'pates', 'spaghetti', 'tagliatelle', 'linguine', 'penne', 'raviole',
    'gnocchi', 'semoule', 'couscous', 'boulgour', 'quinoa', 'polenta', 'lentille', 'pois chiche',
    'haricot sec', 'haricot blanc', 'haricot rouge', 'flocon', 'avoine', 'cereale', 'muesli', 'granola',
    'chocolat', 'cacao', 'praline', 'pralin', 'pate de noisette', 'pate a tartiner', 'noix', 'noisette',
    'amande', 'pistache', 'cajou', 'pecan', 'macadamia', 'pignon', 'cacahuete', 'arachide', 'sesame',
    'graine', 'lin', 'chia', 'tournesol', 'courge seche', 'raisin sec', 'abricot sec', 'datte', 'pruneau',
    'fruit sec', 'fruits secs', 'fruit confit', 'gelatine', 'agar', 'pectine', 'amidon', 'fecule',
    'maizena', 'levure', 'bicarbonate', 'poudre a lever', 'huile', 'huile d olive', 'huile de friture',
    'graisse', 'graisse de canard', 'saindoux', 'lait de coco', 'creme de coco', 'creme de marron', 'conserve', 'concentre',
    'concentre de tomate', 'coulis de tomate', 'pulpe de tomate', 'tomate pelee', 'passata', 'bouillon',
    'fond de', 'fond brun', 'fond blanc', 'fumet', 'glucose', 'trimoline', 'isomalt', 'colorant',
    'arome', 'extrait', 'cafe', 'the', 'tisane', 'infusion', 'nori', 'algue', 'tapioca', 'vermicelle',
    'nouille', 'galette de riz', 'feuille de riz', 'cepes seches', 'champignons seches', 'tomate sechee',
    'olive', 'capre', 'cornichon', 'pickles', 'orge', 'orge perle', 'sarrasin', 'kasha', 'epeautre',
    'millet', 'caramel', 'pate a tagliolini', 'tagliolini', 'pate fraiche', 'lasagne',
  ],
  'Condiments / sauces': [
    'sauce', 'sauce soja', 'soja', 'tamari', 'mirin', 'sake de cuisine', 'nuoc mam', 'sauce poisson',
    'worcestershire', 'tabasco', 'sriracha', 'harissa', 'ketchup', 'mayonnaise', 'moutarde', 'pesto',
    'tapenade', 'vinaigre', 'balsamique', 'vinaigre balsamique', 'vinaigrette', 'miso', 'gochujang',
    'wasabi', 'chutney', 'confiture', 'compote', 'puree de', 'ail noir', 'pate de curry', 'pate de piment',
    'piri piri', 'chili crisp', 'fume liquide', 'yuzu kosho', 'ponzu', 'teriyaki', 'hoisin', 'sauce barbecue', 'bbq',
  ],
  'Boissons': [
    'eau gazeuse', 'eau minerale', 'jus d orange', 'jus de pomme', 'soda', 'limonade', 'tonic',
    'ginger beer', 'ginger ale', 'cola', 'kombucha', 'lait d avoine', 'lait d amande',
  ],
  'Alcools': [
    'vin', 'vin blanc', 'vin rouge', 'champagne', 'cremant', 'prosecco', 'porto', 'madere', 'xeres',
    'marsala', 'cognac', 'armagnac', 'calvados', 'whisky', 'rhum', 'vodka', 'gin', 'tequila', 'mezcal',
    'kirsch', 'williamine', 'liqueur', 'grand marnier', 'cointreau', 'amaretto', 'biere', 'cidre',
    'vermouth', 'pastis', 'absinthe', 'sake', 'noilly', 'eau de vie', 'grappa', 'marc',
  ],
  [HYGIENE]: [
    'eponge', 'tampon', 'paille de fer', 'liquide vaisselle', 'degraissant', 'desinfectant', 'nettoyant',
    'detartrant', 'film alimentaire', 'papier cuisson', 'papier aluminium', 'aluminium', 'poche sous vide',
    'sac sous vide', 'gant', 'essuie tout', 'sac poubelle', 'javel', 'savon', 'barquette', 'boite',
    'serviette', 'charlotte', 'tablier', 'poche a douille',
  ],
};

// Mentions qui l'emportent sur tout le reste : un « marron surgelé » se range
// au congélateur, pas avec les fruits.
// Boiron : purées et coulis de fruits livrés surgelés.
const SURGELE = /\b(surgele|surgeles|surgelee|surgelees|congele|congeles|congelee|congelees|boiron)\b/;

// Ingrédients qui ne se commandent pas : l'eau du robinet sous toutes ses
// formes (« Eau chaude de cuisson », « Eau filtrée glacée »), les glaçons.
// L'eau minérale, gazeuse, de vie ou de fleur d'oranger, elle, s'achète.
const NON_COMMANDABLE = /^(eau(?! (gazeuse|minerale|petillante|de vie|de rose|de fleur|tonique))(\s.*)?|glacons?|glace pilee)$/;

// Qualificatifs de préparation retirés avant de chercher dans le catalogue :
// « Échalote ciselée » doit retrouver « Échalote ».
const QUALIFICATIFS = new Set([
  'frais', 'fraiche', 'fraiches', 'cisele', 'ciselee', 'ciselees', 'ciseles', 'hache', 'hachee',
  'haches', 'hachees', 'emince', 'emincee', 'eminces', 'emincees', 'epluche', 'epluchee', 'epepine',
  'epepinee', 'detaille', 'detaillee', 'rape', 'rapee', 'rapes', 'rapees', 'moulu', 'moulue', 'entier',
  'entiere', 'entiers', 'entieres', 'bio', 'nature', 'doux', 'douce', 'concasse', 'concassee', 'torrefie',
  'torrefiee', 'torrefies', 'grille', 'grillee', 'grilles', 'grillees', 'finition', 'tranche', 'tranchee',
  'en', 'des', 'brunoise', 'julienne', 'puree', 'zeste', 'jus', 'de', 'du', 'd', 'la', 'le', 'les', 'et',
]);

const norm = (s) => normalizeSearch(String(s || ''))
  .replace(/[’'`]/g, ' ')
  .replace(/[^a-z0-9%]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Le nom sans ses parenthèses ni ses qualificatifs de préparation.
const nomNu = (s) => norm(String(s || '').replace(/\([^)]*\)/g, ' '))
  .split(' ')
  .filter(m => m && !QUALIFICATIFS.has(m))
  .join(' ');

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Index précompilé : un mot-clé = une expression en début de mot, pluriel
// simple toléré. Construit une fois au chargement du module.
const REGLES = Object.entries(MOTS_CLES).flatMap(([rayon, mots]) =>
  [...new Set(mots.map(norm))].map(mot => ({
    rayon,
    longueur: mot.length,
    re: new RegExp(`(?:^|\\s)${echapper(mot)}(?:s|x)?(?=\\s|$)`),
  })),
);

// « Eau (gélatine) » : la parenthèse précise un usage, pas un produit.
export const estNonCommandable = (nom) => NON_COMMANDABLE.test(norm(String(nom || '').replace(/\([^)]*\)/g, ' ')));

// Rayon d'après les seuls mots-clés. Le mot-clé le plus tôt dans le nom gagne
// (en français le nom principal vient en tête : « Graisse de canard » est une
// graisse, « Filet de bœuf » du bœuf) ; à position égale, le plus long
// (« lait de coco » avant « lait »).
export function rayonParMotsCles(nom) {
  const n = norm(nom);
  if (!n) return AUTRES;
  if (SURGELE.test(n)) return 'Surgelés';
  let meilleur = null;
  for (const r of REGLES) {
    const m = r.re.exec(n);
    if (!m) continue;
    const pos = m.index + (m[0].startsWith(' ') ? 1 : 0);
    if (!meilleur || pos < meilleur.pos || (pos === meilleur.pos && r.longueur > meilleur.longueur)) {
      meilleur = { pos, longueur: r.longueur, rayon: r.rayon };
    }
  }
  return meilleur ? meilleur.rayon : AUTRES;
}

// Contexte de classement d'un établissement : catalogue et noms de recettes
// indexés une fois, réutilisés pour toute la liste.
export function contexteClassement({ catalogue = [], recettes = [] } = {}) {
  const catalogueParNom = new Map();
  (catalogue || []).forEach(p => {
    const cat = p?.categorie;
    if (!cat || cat === AUTRES) return;
    [norm(p.nom), nomNu(p.nom)].forEach(k => { if (k && !catalogueParNom.has(k)) catalogueParNom.set(k, cat); });
  });
  const recettesNoms = new Set((recettes || []).map(r => norm(r?.nom)).filter(Boolean));
  return { catalogueParNom, recettesNoms };
}

// Rayon d'un produit. `categorieConnue` = catégorie déjà portée par la ligne
// (produit lié au catalogue) : elle prime, sauf si elle vaut « Autres ».
export function classerProduit(nom, ctx = null, categorieConnue = null) {
  if (categorieConnue && categorieConnue !== AUTRES) return categorieConnue;
  const n = norm(nom);
  if (!n) return AUTRES;
  if (ctx) {
    if (ctx.recettesNoms?.has(n)) return PREPARATIONS_MAISON;
    const cat = ctx.catalogueParNom?.get(n) || ctx.catalogueParNom?.get(nomNu(nom));
    if (cat) return cat;
  }
  return rayonParMotsCles(nom);
}

// Ordre des rayons : celui de RAYONS, une catégorie hors liste juste avant
// « Autres » (alphabétique entre elles).
export function trierRayons(a, b) {
  const ia = RAYONS.indexOf(a);
  const ib = RAYONS.indexOf(b);
  const ra = ia === -1 ? RAYONS.length - 1.5 : ia;
  const rb = ib === -1 ? RAYONS.length - 1.5 : ib;
  if (ra !== rb) return ra - rb;
  return String(a).localeCompare(String(b), 'fr');
}
