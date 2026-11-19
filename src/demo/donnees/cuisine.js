// Cuisine de démonstration : fiches techniques chiffrées, plats, cartes et
// fiches salle d'une brasserie de montagne. Recettes écrites pour la démo.
import { ETAB, jour } from './base.js';
import { PRODUIT } from './catalogue.js';

let n = 0;
// Ligne d'ingrédient reliée au catalogue (le coût suit le prix du produit).
const ing = (cle, quantite, nom) => {
  const pr = PRODUIT[cle];
  if (!pr) throw new Error('Produit de démo inconnu : ' + cle);
  n += 1;
  return {
    id: `ing-${n}`,
    nom: nom || pr.nom,
    unite: pr.unite_ref,
    quantite,
    prixUnit: pr.prix_unitaire,
    categorie: pr.categorie,
    produitId: pr.id,
  };
};

const allergenesDe = (ingredients) => [...new Set(ingredients.flatMap((i) => PRODUIT[i.produitId.slice(2)]?.allergenes || []))];

const fiche = (id, nom, categorie, portions, ingredients, etapes, extra = {}) => ({
  id: 'r-' + id,
  etablissement_id: ETAB,
  nom,
  categorie,
  portions,
  prix_vente: extra.prix || 0,
  temps_preparation: extra.prep ?? 30,
  temps_cuisson: extra.cuisson ?? 20,
  temps_total: (extra.prep ?? 30) + (extra.cuisson ?? 20),
  statut: extra.statut || 'validée',
  version: extra.version || 2,
  allergenes_ids: allergenesDe(ingredients),
  notes_consultant: extra.notes || '',
  dressage: extra.dressage || '',
  conservation: extra.conservation || '3 jours à 3 °C, filmé et étiqueté.',
  ingredients,
  etapes,
  modifie_par: 'demo-chef',
  photo_url: null,
  complexity_score: null,
  complexity_note: null,
  complexity_updated_at: null,
  congelable: extra.congelable ?? false,
  duree_vie_jours: extra.dlc ?? 3,
  duree_vie_congele_jours: extra.congelable ? 60 : null,
  duree_vie_decongele_jours: 2,
  masquee: false,
  created_by: 'demo-chef',
  created_at: '2026-09-01T08:00:00Z',
  updated_at: jour(-6) + 'T15:20:00Z',
});

export const RECETTES = [
  fiche('veloute-courge', 'Velouté de courge, crème de noisette', 'Entrées', 10, [
    ing('courge', 2000), ing('oignon', 300), ing('beurre', 80), ing('creme', 300), ing('noisettes', 60), ing('sel', 15), ing('poivre', 2), ing('herbes', 10, 'Ciboulette'),
  ], [
    'Éplucher et épépiner la courge, la tailler en cubes de 2 cm. Émincer les oignons.',
    'Faire suer les oignons au beurre sans coloration, ajouter la courge et mouiller à hauteur d\'eau. Cuire 25 minutes à frémissement.',
    'Mixer finement, crémer avec la moitié de la crème et rectifier l\'assaisonnement.',
    'Monter le reste de la crème mousseuse avec les noisettes torréfiées concassées.',
  ], { prix: 14, prep: 20, cuisson: 30, dressage: 'Assiette creuse chaude, une quenelle de crème de noisette au centre, ciboulette ciselée.', congelable: true, dlc: 3 }),
  fiche('salade-chevre', 'Salade d\'automne, chèvre chaud et noix', 'Entrées', 10, [
    ing('mache', 400), ing('salade-mesclun', 400), ing('chevre', 800), ing('pain-campagne', 2), ing('noix', 100), ing('pomme', 600), ing('huile-colza', 150), ing('vinaigre', 50), ing('moutarde', 20), ing('sel', 5),
  ], [
    'Laver et essorer les salades. Tailler les pommes en fins bâtonnets, citronner.',
    'Couper le chèvre en rondelles de 80 g, les poser sur des tranches de pain de seigle.',
    'Monter la vinaigrette moutarde, colza et vinaigre.',
    'Gratiner les toasts 4 minutes à 220 °C au moment de l\'envoi.',
  ], { prix: 16, prep: 25, cuisson: 5, dressage: 'Salade assaisonnée en dôme, deux toasts de chèvre, noix et pomme sur le dessus.' }),
  fiche('tartare-truite', 'Tartare de truite du Valais, pomme verte', 'Entrées', 10, [
    ing('truite', 1100), ing('pomme-verte', 300), ing('echalote', 80), ing('capres', 40), ing('citron', 2), ing('herbes', 20, 'Aneth et ciboulette'), ing('huile-olive', 60), ing('sel', 8),
  ], [
    'Désarêter et dépiauter la truite, la tailler en dés de 5 mm sur glace.',
    'Tailler la pomme en brunoise et l\'échalote très finement.',
    'Assaisonner à la commande : huile, citron, câpres, herbes, sel.',
  ], { prix: 19, prep: 30, cuisson: 0, dressage: 'Cercle de 8 cm, brunoise de pomme sur le dessus, pluches d\'aneth.', dlc: 1, conservation: 'Préparer à la commande. Poisson taillé : 24 h à 2 °C au plus.' }),
  fiche('terrine', 'Terrine de campagne', 'Entrées', 14, [
    ing('porc-gorge', 1200), ing('foie-volaille', 400), ing('oignon', 150), ing('oeuf', 2), ing('cognac', 40), ing('creme', 100), ing('sel', 22), ing('poivre', 4), ing('thym', 5),
  ], [
    'Hacher la gorge et les foies à la grille moyenne.',
    'Mélanger avec les oignons compotés, les œufs, la crème, le cognac et l\'assaisonnement.',
    'Mouler en terrine, cuire au bain-marie à 150 °C jusqu\'à 68 °C à cœur.',
    'Presser une nuit au froid avant de trancher.',
  ], { prix: 15, prep: 40, cuisson: 90, congelable: true, dlc: 6, conservation: '6 jours à 3 °C sous film, une fois entamée 3 jours.' }),
  fiche('pickles', 'Pickles de légumes', 'Garnitures', 20, [
    ing('carotte', 500), ing('oignon', 300), ing('betterave', 300), ing('vinaigre', 500), ing('sucre', 150), ing('sel', 20),
  ], [
    'Tailler les légumes en fines lamelles.',
    'Porter à ébullition vinaigre, eau, sucre et sel, verser bouillant sur les légumes.',
    'Laisser mariner 24 h au froid.',
  ], { prep: 20, cuisson: 5, dlc: 14, conservation: '14 jours à 3 °C en bocal fermé.' }),
  fiche('filet-boeuf', 'Filet de bœuf rôti', 'Plats', 10, [
    ing('boeuf-filet', 2000), ing('beurre', 100), ing('thym', 10), ing('ail', 30), ing('sel', 20), ing('poivre', 5),
  ], [
    'Parer le filet et le portionner en pavés de 200 g.',
    'Saisir sur toutes les faces, arroser au beurre moussant avec thym et ail.',
    'Finir au four à 180 °C selon la cuisson demandée, laisser reposer 5 minutes.',
  ], { prix: 46, prep: 15, cuisson: 12, notes: 'Cuisson à demander au client. Repos obligatoire avant tranchage.', dressage: 'Pavé tranché en deux, sauce à part en saucière.' }),
  fiche('sauce-poivre', 'Sauce au poivre', 'Sauces', 10, [
    ing('echalote', 100), ing('poivre', 20), ing('cognac', 80), ing('creme', 500), ing('beurre', 40), ing('sel', 4),
  ], [
    'Faire suer les échalotes ciselées au beurre, ajouter le poivre concassé.',
    'Flamber au cognac, mouiller au fond brun et réduire de moitié.',
    'Crémer, réduire jusqu\'à consistance nappante, passer au chinois.',
  ], { prep: 10, cuisson: 20, dlc: 3 }),
  fiche('gratin', 'Gratin dauphinois', 'Garnitures', 12, [
    ing('pomme-de-terre-ferme', 2400), ing('creme', 600), ing('lait', 600), ing('ail', 15), ing('gruyere', 150), ing('muscade', 2), ing('sel', 18),
  ], [
    'Éplucher et trancher les pommes de terre à 3 mm, sans les laver.',
    'Porter lait, crème, ail et muscade à frémissement, y précuire les tranches 10 minutes.',
    'Disposer en plaque beurrée, parsemer de gruyère et cuire 50 minutes à 160 °C.',
  ], { prep: 25, cuisson: 60, dlc: 3 }),
  fiche('supreme-volaille', 'Suprême de volaille rôti', 'Plats', 10, [
    ing('volaille-supreme', 2000), ing('beurre', 80), ing('thym', 5), ing('sel', 15), ing('poivre', 3),
  ], [
    'Saisir les suprêmes côté peau jusqu\'à ce qu\'elle soit croustillante.',
    'Finir au four à 170 °C jusqu\'à 72 °C à cœur.',
    'Laisser reposer 4 minutes avant de trancher.',
  ], { prix: 34, prep: 10, cuisson: 18 }),
  fiche('jus-volaille', 'Jus de volaille corsé', 'Sauces', 20, [
    ing('volaille-carcasse', 3000), ing('oignon', 300), ing('carotte', 300), ing('vin-blanc', 300), ing('thym', 5), ing('beurre', 50),
  ], [
    'Rôtir les carcasses concassées au four à 220 °C.',
    'Pincer la garniture aromatique, déglacer au vin blanc, mouiller à l\'eau froide.',
    'Cuire 3 heures à frémissement, passer et réduire jusqu\'à consistance.',
  ], { prep: 20, cuisson: 180, congelable: true, dlc: 5 }),
  fiche('risotto', 'Risotto aux champignons', 'Plats', 10, [
    ing('riz-carnaroli', 900), ing('champignon', 800), ing('cepes', 40), ing('oignon', 150), ing('vin-blanc', 200), ing('parmesan', 150), ing('beurre', 120), ing('sel', 12),
  ], [
    'Réhydrater les cèpes, garder leur eau filtrée pour le bouillon.',
    'Nacrer le riz avec l\'oignon, déglacer au vin blanc.',
    'Mouiller au bouillon louche après louche 17 minutes, ajouter les champignons poêlés.',
    'Monter au beurre et au parmesan hors du feu.',
  ], { prix: 28, prep: 15, cuisson: 20, dressage: 'Assiette creuse chaude, copeaux de parmesan, champignons poêlés sur le dessus.' }),
  fiche('fera', 'Filet de féra meunière', 'Plats', 10, [
    ing('fera', 1800), ing('farine', 100), ing('beurre', 150), ing('citron', 3), ing('herbes', 15, 'Persil plat'), ing('sel', 10),
  ], [
    'Vérifier les arêtes, sécher les filets et les fariner.',
    'Cuire côté peau au beurre clarifié, retourner en fin de cuisson.',
    'Finir au beurre noisette, citron et persil.',
  ], { prix: 36, prep: 10, cuisson: 8, dlc: 1 }),
  fiche('beurre-blanc', 'Beurre blanc', 'Sauces', 10, [
    ing('echalote', 80), ing('vin-blanc', 200), ing('vinaigre', 50), ing('beurre', 400), ing('sel', 3),
  ], [
    'Réduire à sec échalotes, vin blanc et vinaigre.',
    'Monter au beurre froid en parcelles sans faire bouillir.',
    'Tenir au chaud à 60 °C, au bain-marie.',
  ], { prep: 10, cuisson: 15, dlc: 1, conservation: 'Service du jour uniquement, tenu à 60 °C.' }),
  fiche('legumes', 'Légumes de saison glacés', 'Garnitures', 10, [
    ing('carotte', 800), ing('celeri', 400), ing('poireau', 400), ing('beurre', 80), ing('sucre', 20), ing('sel', 8),
  ], [
    'Tailler les légumes en bâtonnets réguliers.',
    'Glacer à blanc avec eau, beurre, sucre et sel sous papier sulfurisé.',
  ], { prep: 20, cuisson: 12 }),
  fiche('croute-fromage', 'Croûte au fromage valaisanne', 'Plats', 10, [
    ing('pain-campagne', 5), ing('vin-blanc', 300), ing('raclette', 2000), ing('oeuf', 10), ing('cornichons', 300), ing('poivre', 3),
  ], [
    'Trancher le pain de seigle en tranches épaisses, les imbiber de fendant.',
    'Recouvrir généreusement de raclette, gratiner 8 minutes à 230 °C.',
    'Servir avec un œuf au plat, cornichons et poivre du moulin.',
  ], { prix: 24, prep: 10, cuisson: 10, dressage: 'Plat à gratin individuel brûlant, œuf au plat sur le dessus.' }),
  fiche('burger', 'Burger de bœuf suisse', 'Plats', 10, [
    ing('boeuf-hache', 1800), ing('pain-burger', 10), ing('raclette', 400), ing('lard', 300), ing('oignon', 300), ing('salade-mesclun', 150), ing('moutarde', 80), ing('sel', 12),
  ], [
    'Façonner des steaks de 180 g, assaisonner à la cuisson seulement.',
    'Compoter les oignons, griller le lard.',
    'Cuire les steaks, fondre la raclette dessus, monter le burger sur pain toasté.',
  ], { prix: 27, prep: 20, cuisson: 10 }),
  fiche('frites', 'Frites maison', 'Garnitures', 10, [
    ing('pomme-de-terre', 2500), ing('huile-friture', 300), ing('sel', 15),
  ], [
    'Tailler les pommes de terre en frites de 1 cm, rincer et sécher.',
    'Blanchir à 150 °C, égoutter.',
    'Frire à 180 °C à la commande, saler aussitôt.',
  ], { prep: 30, cuisson: 15, dlc: 1 }),
  fiche('rosti', 'Rösti, œuf au plat et lard', 'Plats', 10, [
    ing('pomme-de-terre-ferme', 2500), ing('beurre', 200), ing('oeuf', 10), ing('lard', 500), ing('sel', 15),
  ], [
    'Cuire les pommes de terre en robe la veille, les éplucher et les râper.',
    'Dorer en poêle au beurre 8 minutes de chaque côté.',
    'Servir avec un œuf au plat et le lard grillé.',
  ], { prix: 22, prep: 20, cuisson: 20 }),
  fiche('tarte-pommes', 'Tarte fine aux pommes, glace vanille', 'Desserts', 10, [
    ing('pate-feuilletee', 800), ing('pomme', 1500), ing('beurre', 100), ing('cassonade', 120), ing('glace-vanille', 600),
  ], [
    'Détailler des disques de feuilletage de 14 cm, les piquer.',
    'Disposer les pommes en fines lamelles en rosace, beurre et cassonade.',
    'Cuire 18 minutes à 190 °C, servir tiède avec une boule de glace.',
  ], { prix: 13, prep: 25, cuisson: 18 }),
  fiche('mousse-chocolat', 'Mousse au chocolat noir', 'Desserts', 12, [
    ing('chocolat', 500), ing('oeuf', 10), ing('sucre', 80), ing('creme', 300), ing('sel', 1),
  ], [
    'Fondre le chocolat à 45 °C.',
    'Incorporer les jaunes puis la crème montée souple.',
    'Serrer les blancs avec le sucre, les incorporer délicatement. Prise de 6 heures au froid.',
  ], { prix: 12, prep: 25, cuisson: 0, dlc: 2 }),
  fiche('creme-brulee', 'Crème brûlée à la vanille', 'Desserts', 12, [
    ing('creme', 1000), ing('lait', 250), ing('jaune-oeuf', 220), ing('sucre', 200), ing('vanille', 2), ing('cassonade', 120),
  ], [
    'Infuser la vanille dans la crème et le lait chauds.',
    'Verser sur les jaunes blanchis avec le sucre, sans faire mousser.',
    'Cuire en ramequins à 95 °C environ 50 minutes, refroidir.',
    'Caraméliser à la cassonade au moment de servir.',
  ], { prix: 11, prep: 20, cuisson: 50, dlc: 3 }),
  fiche('meringues', 'Meringues et double crème de la Gruyère', 'Desserts', 10, [
    ing('oeuf', 8), ing('sucre', 400), ing('creme-gruyere', 1000),
  ], [
    'Monter les blancs et serrer au sucre jusqu\'à obtenir une meringue brillante.',
    'Coucher sur plaque et sécher 2 heures à 100 °C.',
    'Servir deux meringues avec la double crème en saucière.',
  ], { prix: 12, prep: 15, cuisson: 120, dlc: 10, conservation: 'Meringues : 10 jours en boîte hermétique, au sec.' }),
  fiche('fond-brun', 'Fond brun de veau', 'Sauces', 40, [
    ing('os-veau', 5000), ing('oignon', 500), ing('carotte', 500), ing('celeri', 200), ing('vin-rouge-cuisine', 500), ing('thym', 10),
  ], [
    'Rôtir les os au four à 220 °C, ajouter la garniture aromatique.',
    'Déglacer au vin rouge, mouiller à l\'eau froide et cuire 6 heures à frémissement.',
    'Passer, dégraisser et réduire de moitié.',
  ], { prep: 30, cuisson: 360, congelable: true, dlc: 5, statut: 'brouillon', version: 1 }),
];

// ── Plats et cartes ──────────────────────────────────────────────────────────

const plat = (id, nom, categorie, prix, description, fiches, ordre) => ({
  id: 'pl-' + id,
  etablissement_id: ETAB,
  nom,
  categorie,
  prix_vente: prix,
  description,
  notes: null,
  ordre,
  actif: true,
  photo_url: null,
  created_at: '2026-09-02T08:00:00Z',
  updated_at: jour(-6) + 'T15:20:00Z',
  __fiches: fiches,
});

const PLATS_BRUTS = [
  plat('veloute', 'Velouté de courge, crème de noisette', 'Entrées', 14, 'Courge butternut, noisettes torréfiées, ciboulette.', ['veloute-courge'], 1),
  plat('salade', 'Salade d\'automne, chèvre chaud', 'Entrées', 16, 'Mâche, mesclun, toasts de chèvre gratinés, pomme et noix.', ['salade-chevre'], 2),
  plat('tartare', 'Tartare de truite du Valais', 'Entrées', 19, 'Truite taillée au couteau, pomme verte, câpres.', ['tartare-truite'], 3),
  plat('terrine', 'Terrine de campagne, pickles', 'Entrées', 15, 'Terrine maison, pickles de légumes, pain de seigle.', ['terrine', 'pickles'], 4),
  plat('boeuf', 'Filet de bœuf, sauce au poivre', 'Plats', 46, 'Filet de bœuf suisse, sauce au poivre, gratin dauphinois.', ['filet-boeuf', 'sauce-poivre', 'gratin'], 5),
  plat('volaille', 'Suprême de volaille, risotto', 'Plats', 34, 'Volaille fermière, jus corsé, risotto aux champignons.', ['supreme-volaille', 'jus-volaille', 'risotto'], 6),
  plat('fera', 'Filet de féra, beurre blanc', 'Plats', 36, 'Féra du Léman meunière, beurre blanc, légumes glacés.', ['fera', 'beurre-blanc', 'legumes'], 7),
  plat('croute', 'Croûte au fromage', 'Plats', 24, 'Pain de seigle, fendant, raclette du Valais, œuf au plat.', ['croute-fromage'], 8),
  plat('risotto', 'Risotto aux cèpes', 'Plats', 28, 'Carnaroli, cèpes et champignons, parmesan. Végétarien.', ['risotto'], 9),
  plat('burger', 'Burger de bœuf suisse, frites', 'Plats', 27, 'Bœuf haché suisse, raclette, lard, oignons compotés, frites maison.', ['burger', 'frites'], 10),
  plat('rosti', 'Rösti, œuf au plat et lard', 'Plats', 22, 'Rösti doré au beurre, œuf au plat, lard grillé.', ['rosti'], 11),
  plat('tarte', 'Tarte fine aux pommes', 'Desserts', 13, 'Feuilletage, pommes du Valais, glace vanille.', ['tarte-pommes'], 12),
  plat('mousse', 'Mousse au chocolat noir', 'Desserts', 12, 'Chocolat noir 64 %, crème fouettée.', ['mousse-chocolat'], 13),
  plat('creme-brulee', 'Crème brûlée à la vanille', 'Desserts', 11, 'Vanille de Madagascar, cassonade caramélisée.', ['creme-brulee'], 14),
  plat('meringues', 'Meringues, double crème de la Gruyère', 'Desserts', 12, 'Meringues maison, double crème, fruits rouges.', ['meringues'], 15),
];

export const PLATS = PLATS_BRUTS.map(({ __fiches, ...p }) => p);

export const PLAT_RECETTES = PLATS_BRUTS.flatMap((p) => p.__fiches.map((f, i) => ({
  id: `pr-${p.id.slice(3)}-${i}`,
  plat_id: p.id,
  recette_id: 'r-' + f,
  role: i === 0 ? 'principal' : 'composant',
  ordre: i,
  created_at: '2026-09-02T08:00:00Z',
})));

export const CARTES = [
  { id: 'carte-automne', etablissement_id: ETAB, nom: 'Carte d\'automne', date_debut: jour(-50), date_fin: jour(40), plats: [], archive: false, ordre: 1, masquee: false, created_at: '2026-09-20T08:00:00Z', updated_at: jour(-6) + 'T15:20:00Z' },
  { id: 'carte-midi', etablissement_id: ETAB, nom: 'Menu de midi', date_debut: null, date_fin: null, plats: [], archive: false, ordre: 2, masquee: false, created_at: '2026-09-20T08:00:00Z', updated_at: jour(-6) + 'T15:20:00Z' },
  { id: 'carte-ete', etablissement_id: ETAB, nom: 'Carte d\'été', date_debut: '2026-06-01', date_fin: '2026-09-15', plats: [], archive: true, ordre: 3, masquee: false, created_at: '2026-05-15T08:00:00Z', updated_at: '2026-09-16T08:00:00Z' },
];

const SUR_MIDI = ['croute', 'rosti', 'burger', 'risotto', 'veloute', 'mousse'];
export const CARTE_PLATS = [
  ...PLATS.map((p, i) => ({ id: `cp-a-${i}`, carte_id: 'carte-automne', plat_id: p.id, ordre: i, created_at: '2026-09-20T08:00:00Z' })),
  ...SUR_MIDI.map((k, i) => ({ id: `cp-m-${i}`, carte_id: 'carte-midi', plat_id: 'pl-' + k, ordre: i, created_at: '2026-09-20T08:00:00Z' })),
];

// Fiches salle : ce que la salle dit du plat au client.
const VINS = {
  boeuf: 'Cornalin du Valais',
  volaille: 'Pinot noir du Valais',
  fera: 'Fendant du Valais',
  croute: 'Fendant du Valais',
  tartare: 'Fendant du Valais',
  risotto: 'Pinot noir du Valais',
};

export const FICHES_SALLE = PLATS.map((p) => {
  const k = p.id.slice(3);
  const recettes = PLAT_RECETTES.filter((l) => l.plat_id === p.id).map((l) => RECETTES.find((r) => r.id === l.recette_id));
  const allergenes = [...new Set(recettes.flatMap((r) => r?.allergenes_ids || []))];
  return {
    id: 'fs-' + k,
    etablissement_id: ETAB,
    nom: p.nom,
    categorie: p.categorie,
    statut: 'active',
    description_service: p.description,
    temperature_service: p.categorie === 'Desserts' && k !== 'tarte' ? 'Froid' : 'Chaud',
    dressage_notes: recettes[0]?.dressage || '',
    allergenes,
    accords: VINS[k] ? [{ nom: VINS[k], type: 'vin', note: 'Au verre ou en bouteille.' }] : [],
    infos_service: k === 'boeuf' ? 'Demander la cuisson. Saignant par défaut.' : '',
    temps_preparation: p.categorie === 'Plats' ? '15 min' : '8 min',
    modifie_par: 'demo-serveur',
    accords_generaux: [],
    created_at: '2026-09-25T08:00:00Z',
    updated_at: jour(-6) + 'T15:20:00Z',
  };
});

export const CARTE_FICHES_SALLE = FICHES_SALLE.map((f, i) => ({
  id: `cfs-${i}`,
  carte_id: 'carte-automne',
  fiche_salle_id: f.id,
  ordre: i,
  created_at: '2026-09-25T08:00:00Z',
}));
