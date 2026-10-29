// ─────────────────────────────────────────────────────────────────────────────
// Modèles Excel de la mise en route (lot LD), servis depuis public/modeles/ :
//   modele-recettes.xlsx   format « multi-feuilles » de ExcelImporter.js
//                          (feuilles Recettes, Ingrédients, Étapes ; colonnes
//                          lues par position), plus une feuille Aide ignorée
//                          à l'import
//   modele-catalogue.xlsx  format « catalogue standard » de l'import Excel du
//                          catalogue (Catalogue.jsx) : A catégorie, B produit,
//                          C unité (g, ml, pcs), D prix par unité. Une seule
//                          feuille : l'import lit toutes les feuilles.
// Deux lignes d'exemple chacun. Rejouable :
//   node scripts/gen-modeles.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = join(racine, 'public', 'modeles');
mkdirSync(dossier, { recursive: true });

const DATE = new Date('2026-10-30T00:00:00Z');

function feuille(lignes, largeurs) {
  const ws = XLSX.utils.aoa_to_sheet(lignes);
  ws['!cols'] = largeurs.map((wch) => ({ wch }));
  return ws;
}

function ecrire(nom, feuilles) {
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: nom, Author: 'Samper Consulting', CreatedDate: DATE, ModifiedDate: DATE };
  for (const [titre, ws] of feuilles) XLSX.utils.book_append_sheet(wb, ws, titre);
  XLSX.writeFile(wb, join(dossier, nom), { compression: true });
  console.log('écrit', join('public', 'modeles', nom));
}

ecrire('modele-recettes.xlsx', [
  ['Recettes', feuille([
    ['Titre', 'Catégorie', 'Portions', 'Prix de vente (facultatif)', 'Préparation (min)', 'Cuisson (min)', 'Allergènes (séparés par ;)', 'Notes'],
    ["Soupe à l'oignon gratinée", 'Entrées', 4, '', 20, 45, 'gluten ; lactose', 'Croûtons et gruyère au moment du service.'],
    ['Panna cotta vanille', 'Desserts', 6, '', 15, 5, 'lactose', 'Prise au froid 4 heures minimum.'],
  ], [30, 14, 10, 22, 18, 14, 28, 40])],
  ['Ingrédients', feuille([
    ['Titre de la recette', 'Ingrédient', 'Quantité', 'Unité', 'Prix unitaire (facultatif)', 'Catégorie (facultatif)'],
    ["Soupe à l'oignon gratinée", 'Oignons', 600, 'g', '', 'Fruits & légumes'],
    ["Soupe à l'oignon gratinée", 'Beurre', 40, 'g', '', 'Produits laitiers'],
    ["Soupe à l'oignon gratinée", 'Bouillon de bœuf', 1.2, 'L', '', ''],
    ["Soupe à l'oignon gratinée", 'Pain de campagne', 120, 'g', '', 'Boulangerie / pâtisserie'],
    ["Soupe à l'oignon gratinée", 'Gruyère AOP', 120, 'g', '', 'Crèmerie / fromages'],
    ['Panna cotta vanille', 'Crème entière 35 %', 500, 'ml', '', 'Produits laitiers'],
    ['Panna cotta vanille', 'Sucre', 70, 'g', '', 'Épicerie sèche'],
    ['Panna cotta vanille', 'Gélatine en feuilles', 3, 'pcs', '', ''],
    ['Panna cotta vanille', 'Gousse de vanille', 1, 'pcs', '', ''],
  ], [30, 26, 10, 8, 22, 24])],
  ['Étapes', feuille([
    ['Titre de la recette', 'N°', 'Texte'],
    ["Soupe à l'oignon gratinée", 1, 'Émincer les oignons et les compoter au beurre 30 minutes.'],
    ["Soupe à l'oignon gratinée", 2, 'Mouiller au bouillon et cuire 15 minutes.'],
    ["Soupe à l'oignon gratinée", 3, 'Couvrir de pain et de gruyère, gratiner au four.'],
    ['Panna cotta vanille', 1, 'Ramollir la gélatine dans l\'eau froide.'],
    ['Panna cotta vanille', 2, 'Chauffer la crème, le sucre et la vanille, ajouter la gélatine essorée.'],
    ['Panna cotta vanille', 3, 'Couler en verrines et prendre au froid.'],
  ], [30, 6, 70])],
  ['Aide', feuille([
    ['Comment remplir ce modèle'],
    ['Une ligne par recette dans Recettes, une ligne par ingrédient dans Ingrédients, une ligne par étape dans Étapes.'],
    ['Le titre relie les trois feuilles : il doit être écrit de la même façon partout.'],
    ['Catégories : Entrées, Plats, Desserts, Fromages, Sauces, Fonds, Amuse-bouches, Garnitures.'],
    ['Unités : g, kg, ml, L, pcs, cs (cuillère à soupe), cc (cuillère à café), pincée.'],
    ['Allergènes : gluten, lactose, oeufs, poissons, crustaces, fruits_coque, sulfites, arachides, soja, celeri, moutarde, sesame, mollusques, lupin.'],
    ['Les colonnes sont lues dans cet ordre : ne pas en ajouter ni en retirer.'],
  ], [110])],
]);

ecrire('modele-catalogue.xlsx', [
  ['Catalogue', feuille([
    ['Catégorie', 'Produit', 'Unité (g, ml ou pcs)', 'Prix par unité (CHF)'],
    ['Fruits & légumes', 'Carottes', 'g', 0.0029],
    ['Produits laitiers', 'Crème entière 35 %', 'ml', 0.0062],
  ], [22, 30, 20, 22])],
]);
