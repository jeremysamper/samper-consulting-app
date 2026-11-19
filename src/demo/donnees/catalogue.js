// Catalogue de démonstration : fournisseurs fictifs, produits et prix d'achat.
import { ETAB, jour, deuxDec } from './base.js';

export const FOURNISSEURS = [
  { id: 'f-primeurs', nom: 'Primeurs du Rhône', contact: 'Service commandes', tel: '027 000 10 10', email: 'commandes@primeurs-rhone.test', adresse: 'Zone artisanale 4, 1950 Sion', notes: 'Livraison lundi, mercredi et vendredi avant 9 h.' },
  { id: 'f-boucherie', nom: 'Boucherie des Alpes', contact: 'Comptoir', tel: '027 000 20 20', email: 'pro@boucherie-alpes.test', adresse: 'Rue du Marché 8, 1950 Sion', notes: 'Viande suisse, maturée sur os.' },
  { id: 'f-laiterie', nom: 'Laiterie du Vallon', contact: 'Livraisons', tel: '027 000 30 30', email: 'livraison@laiterie-vallon.test', adresse: 'Route de la Fromagerie 2, 1966 Ayent', notes: 'Raclette et crème de la Gruyère.' },
  { id: 'f-epicerie', nom: 'Épicerie fine Martin', contact: 'Service client', tel: '021 000 40 40', email: 'pro@epicerie-martin.test', adresse: 'Avenue de la Gare 15, 1003 Lausanne', notes: 'Franco dès 250 CHF.' },
  { id: 'f-pecherie', nom: 'Pêcherie du Léman', contact: 'Marée', tel: '021 000 50 50', email: 'maree@pecherie-leman.test', adresse: 'Quai des Pêcheurs 3, 1820 Montreux', notes: 'Commande la veille avant 15 h.' },
  { id: 'f-cave', nom: 'Cave des Coteaux', contact: 'Vente pro', tel: '027 000 60 60', email: 'pro@cave-coteaux.test', adresse: 'Chemin des Vignes 21, 1957 Ardon', notes: 'Vins du Valais, livraison le jeudi.' },
];

// [clé, nom, catégorie, unité, prix (CHF par kg, par litre ou par pièce), fournisseur, conditionnement, allergènes]
const LISTE = [
  ['boeuf-filet', 'Filet de bœuf suisse', 'Viandes', 'g', 68, 'f-boucherie', 'Pièce sous vide ~2 kg', []],
  ['boeuf-hache', 'Bœuf haché suisse 15 %', 'Viandes', 'g', 21, 'f-boucherie', 'Barquette 2,5 kg', []],
  ['volaille-supreme', 'Suprême de poulet fermier', 'Viandes', 'g', 29, 'f-boucherie', 'Carton 10 pièces', []],
  ['volaille-carcasse', 'Carcasses de volaille', 'Viandes', 'g', 3.5, 'f-boucherie', 'Sac 5 kg', []],
  ['porc-gorge', 'Gorge de porc', 'Viandes', 'g', 12, 'f-boucherie', 'Pièce ~1,5 kg', []],
  ['foie-volaille', 'Foies de volaille', 'Viandes', 'g', 14, 'f-boucherie', 'Barquette 1 kg', []],
  ['lard', 'Lard fumé en tranches', 'Viandes', 'g', 24, 'f-boucherie', 'Paquet 500 g', []],
  ['os-veau', 'Os de veau concassés', 'Viandes', 'g', 4, 'f-boucherie', 'Sac 5 kg', []],
  ['truite', 'Filet de truite du Valais', 'Poissons & fruits de mer', 'g', 42, 'f-pecherie', 'Caissette 2 kg', ['poissons']],
  ['fera', 'Filet de féra du Léman', 'Poissons & fruits de mer', 'g', 56, 'f-pecherie', 'Caissette 2 kg', ['poissons']],
  ['courge', 'Courge butternut', 'Fruits & légumes', 'g', 3.8, 'f-primeurs', 'Carton 10 kg', []],
  ['pomme-de-terre', 'Pommes de terre farineuses', 'Fruits & légumes', 'g', 1.6, 'f-primeurs', 'Sac 25 kg', []],
  ['pomme-de-terre-ferme', 'Pommes de terre fermes', 'Fruits & légumes', 'g', 1.8, 'f-primeurs', 'Sac 25 kg', []],
  ['oignon', 'Oignons jaunes', 'Fruits & légumes', 'g', 1.9, 'f-primeurs', 'Sac 10 kg', []],
  ['echalote', 'Échalotes', 'Fruits & légumes', 'g', 7.5, 'f-primeurs', 'Filet 5 kg', []],
  ['ail', 'Ail', 'Fruits & légumes', 'g', 12, 'f-primeurs', 'Filet 1 kg', []],
  ['carotte', 'Carottes', 'Fruits & légumes', 'g', 2.1, 'f-primeurs', 'Sac 10 kg', []],
  ['celeri', 'Céleri-rave', 'Fruits & légumes', 'g', 3.2, 'f-primeurs', 'Carton 10 kg', ['celeri']],
  ['poireau', 'Poireaux', 'Fruits & légumes', 'g', 4.2, 'f-primeurs', 'Carton 5 kg', []],
  ['champignon', 'Champignons de Paris', 'Fruits & légumes', 'g', 9.5, 'f-primeurs', 'Carton 3 kg', []],
  ['cepes', 'Cèpes secs', 'Épicerie sèche', 'g', 120, 'f-epicerie', 'Sachet 500 g', []],
  ['pomme', 'Pommes Golden', 'Fruits & légumes', 'g', 3.4, 'f-primeurs', 'Carton 12 kg', []],
  ['pomme-verte', 'Pommes Granny Smith', 'Fruits & légumes', 'g', 4.1, 'f-primeurs', 'Carton 12 kg', []],
  ['citron', 'Citrons', 'Fruits & légumes', 'pce', 0.55, 'f-primeurs', 'Carton 80 pièces', []],
  ['salade-mesclun', 'Mesclun', 'Fruits & légumes', 'g', 18, 'f-primeurs', 'Caisse 1 kg', []],
  ['mache', 'Mâche', 'Fruits & légumes', 'g', 22, 'f-primeurs', 'Caisse 1 kg', []],
  ['betterave', 'Betteraves cuites', 'Fruits & légumes', 'g', 4.5, 'f-primeurs', 'Sous vide 2,5 kg', []],
  ['herbes', 'Herbes fraîches (persil, ciboulette)', 'Herbes & fleurs', 'g', 32, 'f-primeurs', 'Botte 100 g', []],
  ['thym', 'Thym frais', 'Herbes & fleurs', 'g', 40, 'f-primeurs', 'Botte 50 g', []],
  ['beurre', 'Beurre de cuisine', 'Produits laitiers', 'g', 13.5, 'f-laiterie', 'Plaque 1 kg', ['lactose']],
  ['creme', 'Crème entière 35 %', 'Produits laitiers', 'ml', 7.2, 'f-laiterie', 'Brique 1 l', ['lactose']],
  ['creme-gruyere', 'Double crème de la Gruyère', 'Produits laitiers', 'ml', 19, 'f-laiterie', 'Pot 500 ml', ['lactose']],
  ['lait', 'Lait entier', 'Produits laitiers', 'ml', 1.7, 'f-laiterie', 'Brique 1 l', ['lactose']],
  ['oeuf', 'Œufs suisses plein air', 'Produits laitiers', 'pce', 0.62, 'f-laiterie', 'Plateau 30 pièces', ['oeufs']],
  ['jaune-oeuf', 'Jaunes d\'œufs pasteurisés', 'Produits laitiers', 'ml', 14, 'f-laiterie', 'Bouteille 1 l', ['oeufs']],
  ['raclette', 'Fromage à raclette du Valais', 'Crèmerie / fromages', 'g', 26, 'f-laiterie', 'Meule ~5 kg', ['lactose']],
  ['gruyere', 'Gruyère AOP', 'Crèmerie / fromages', 'g', 24, 'f-laiterie', 'Pièce 1 kg', ['lactose']],
  ['parmesan', 'Parmesan', 'Crèmerie / fromages', 'g', 32, 'f-epicerie', 'Pièce 1 kg', ['lactose']],
  ['chevre', 'Bûche de chèvre', 'Crèmerie / fromages', 'g', 28, 'f-laiterie', 'Bûche 1 kg', ['lactose']],
  ['farine', 'Farine fleur', 'Épicerie sèche', 'g', 1.4, 'f-epicerie', 'Sac 25 kg', ['gluten']],
  ['sucre', 'Sucre fin', 'Épicerie sèche', 'g', 1.3, 'f-epicerie', 'Sac 10 kg', []],
  ['cassonade', 'Cassonade', 'Épicerie sèche', 'g', 3.2, 'f-epicerie', 'Sachet 1 kg', []],
  ['riz-carnaroli', 'Riz carnaroli', 'Épicerie sèche', 'g', 5.8, 'f-epicerie', 'Sac 5 kg', []],
  ['chocolat', 'Chocolat noir 64 %', 'Épicerie sèche', 'g', 21, 'f-epicerie', 'Pistoles 2,5 kg', ['lactose', 'soja']],
  ['vanille', 'Gousses de vanille', 'Épices', 'pce', 2.9, 'f-epicerie', 'Tube 10 gousses', []],
  ['noisettes', 'Noisettes torréfiées', 'Épicerie sèche', 'g', 26, 'f-epicerie', 'Sachet 1 kg', ['fruits_coque']],
  ['noix', 'Cerneaux de noix', 'Épicerie sèche', 'g', 29, 'f-epicerie', 'Sachet 1 kg', ['fruits_coque']],
  ['poivre', 'Poivre noir en grains', 'Épices', 'g', 38, 'f-epicerie', 'Boîte 500 g', []],
  ['sel', 'Sel fin', 'Épices', 'g', 0.9, 'f-epicerie', 'Sac 5 kg', []],
  ['muscade', 'Noix de muscade', 'Épices', 'g', 60, 'f-epicerie', 'Boîte 100 g', []],
  ['huile-colza', 'Huile de colza', 'Condiments / sauces', 'ml', 4.2, 'f-epicerie', 'Bidon 5 l', []],
  ['huile-friture', 'Huile de friture', 'Condiments / sauces', 'ml', 3.1, 'f-epicerie', 'Bidon 10 l', []],
  ['huile-olive', 'Huile d\'olive vierge extra', 'Condiments / sauces', 'ml', 14, 'f-epicerie', 'Bidon 5 l', []],
  ['moutarde', 'Moutarde de Dijon', 'Condiments / sauces', 'g', 7.5, 'f-epicerie', 'Seau 1 kg', ['moutarde']],
  ['vinaigre', 'Vinaigre de vin blanc', 'Condiments / sauces', 'ml', 2.4, 'f-epicerie', 'Bouteille 1 l', ['sulfites']],
  ['cornichons', 'Cornichons', 'Condiments / sauces', 'g', 9, 'f-epicerie', 'Bocal 1 kg', []],
  ['capres', 'Câpres', 'Condiments / sauces', 'g', 18, 'f-epicerie', 'Bocal 500 g', []],
  ['cognac', 'Cognac de cuisine', 'Alcools', 'ml', 38, 'f-cave', 'Bouteille 70 cl', ['sulfites']],
  ['vin-blanc', 'Fendant du Valais (cuisine)', 'Alcools', 'ml', 9.5, 'f-cave', 'Bouteille 75 cl', ['sulfites']],
  ['vin-rouge-cuisine', 'Vin rouge de cuisine', 'Alcools', 'ml', 8, 'f-cave', 'Bouteille 75 cl', ['sulfites']],
  ['pain-campagne', 'Pain de seigle valaisan', 'Boulangerie / pâtisserie', 'pce', 4.8, 'f-epicerie', 'Pièce 500 g', ['gluten']],
  ['pain-burger', 'Pains à burger brioché', 'Boulangerie / pâtisserie', 'pce', 0.95, 'f-epicerie', 'Carton 24 pièces', ['gluten', 'oeufs', 'lactose', 'sesame']],
  ['pate-feuilletee', 'Pâte feuilletée pur beurre', 'Surgelés', 'g', 9.8, 'f-epicerie', 'Carton 5 kg', ['gluten', 'lactose']],
  ['glace-vanille', 'Glace vanille artisanale', 'Surgelés', 'ml', 11, 'f-laiterie', 'Bac 5 l', ['lactose', 'oeufs']],
  ['eau-minerale', 'Eau minérale 50 cl', 'Boissons', 'pce', 0.85, 'f-cave', 'Pack de 24', []],
  ['jus-pomme', 'Jus de pomme du Valais 1 l', 'Boissons', 'pce', 2.6, 'f-cave', 'Caisse 6 x 1 l', []],
  ['fendant', 'Fendant du Valais AOC 75 cl', 'Alcools', 'pce', 14.5, 'f-cave', 'Carton 6 bouteilles', ['sulfites']],
  ['pinot', 'Pinot noir du Valais AOC 75 cl', 'Alcools', 'pce', 17.8, 'f-cave', 'Carton 6 bouteilles', ['sulfites']],
  ['cornalin', 'Cornalin du Valais AOC 75 cl', 'Alcools', 'pce', 24, 'f-cave', 'Carton 6 bouteilles', ['sulfites']],
  ['biere', 'Bière blonde artisanale 33 cl', 'Alcools', 'pce', 1.9, 'f-cave', 'Caisse 24 bouteilles', ['gluten']],
  ['cafe', 'Café en grains', 'Boissons', 'g', 28, 'f-epicerie', 'Sac 1 kg', []],
  ['sac-poubelle', 'Sacs poubelle 110 l', 'Hygiène / non alimentaire', 'pce', 0.45, 'f-epicerie', 'Rouleau 25 pièces', []],
  ['film', 'Film alimentaire 300 m', 'Hygiène / non alimentaire', 'pce', 18, 'f-epicerie', 'Rouleau', []],
];

// Prix par unité de référence : CHF par g, par ml ou par pièce.
const parUnite = (prix, unite) => (unite === 'pce' ? prix : prix / 1000);

export const PRODUITS = LISTE.map(([cle, nom, categorie, unite, prix, fournisseur, conditionnement, allergenes]) => ({
  id: 'p-' + cle,
  etablissement_id: ETAB,
  nom,
  categorie,
  sous_categorie: null,
  unite_ref: unite,
  prix_unitaire: parUnite(prix, unite),
  fournisseur_id: fournisseur,
  reference_fourn: null,
  conditionnement,
  actif: true,
  notes: null,
  allergenes,
  strategie_prix: 'max',
  prix_verrouille: false,
  prix_maj_le: jour(-12) + 'T07:30:00Z',
  created_at: '2026-01-10T08:00:00Z',
  updated_at: jour(-12) + 'T07:30:00Z',
}));

export const PRODUIT = Object.fromEntries(PRODUITS.map((pr) => [pr.id.slice(2), pr]));

// Quantité de conditionnement (en unité de référence) lue dans le libellé.
function quantiteCond(pr) {
  const m = String(pr.conditionnement || '').match(/(\d+(?:,\d+)?)\s*(kg|g|l|ml|cl|pièces|bouteilles|gousses)/i);
  if (!m) return { q: 1, u: pr.unite_ref };
  const n = Number(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  if (u === 'kg') return { q: n * 1000, u: 'g' };
  if (u === 'g') return { q: n, u: 'g' };
  if (u === 'l') return { q: n * 1000, u: 'ml' };
  if (u === 'cl') return { q: n * 10, u: 'ml' };
  if (u === 'ml') return { q: n, u: 'ml' };
  return { q: n, u: 'pce' };
}

export const PRODUIT_FOURNISSEURS = PRODUITS.map((pr) => {
  const { q, u } = quantiteCond(pr);
  const q2 = pr.unite_ref === u ? q : 1;
  return {
    id: 'pf-' + pr.id.slice(2),
    produit_id: pr.id,
    fournisseur_id: pr.fournisseur_id,
    prix_achat: deuxDec(pr.prix_unitaire * q2),
    conditionnement: pr.conditionnement,
    quantite_cond: q2,
    unite_cond: pr.unite_ref,
    prix_unitaire: pr.prix_unitaire,
    est_principal: true,
    reference: null,
    delai_livraison: '24 h',
    notes: null,
    updated_at: jour(-12) + 'T07:30:00Z',
  };
});

// Historique : trois relevés sur deux mois, dont deux hausses à signaler.
const HAUSSES = { 'boeuf-filet': [62, 65, 68], beurre: [12.2, 12.9, 13.5], cepes: [120, 120, 120], creme: [6.9, 7.0, 7.2] };
export const PRODUIT_PRIX_HISTORIQUE = Object.entries(HAUSSES).flatMap(([cle, prix]) => {
  const pr = PRODUIT[cle];
  return prix.map((v, i) => ({
    id: `pph-${cle}-${i}`,
    produit_id: pr.id,
    fournisseur_id: pr.fournisseur_id,
    prix_unitaire: parUnite(v, pr.unite_ref),
    prix_achat: null,
    quantite_cond: null,
    unite_cond: pr.unite_ref,
    source: 'facture',
    scan_id: null,
    document_url: null,
    releve_le: jour(-60 + i * 24),
    created_at: jour(-60 + i * 24) + 'T09:00:00Z',
    created_by: 'demo-chef',
  }));
});
