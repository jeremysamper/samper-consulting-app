import { normalizeSearch } from '../../utils/searchText.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lecture de la commande pour l'écran de prise de commande (21.11.2026) :
// combien d'entrées, de plats et de desserts porte le ticket, combien de fois
// chaque plat y figure (pastille sur sa case), et la photo de chaque case.
// Fonctions pures, testées (commande.test.mjs).
// ─────────────────────────────────────────────────────────────────────────────

const cle = (s) => normalizeSearch(s).trim();

// Service d'une catégorie, d'après son nom : 'entrees', 'plats', 'desserts'
// ou null. « Plats du jour » compte en plats, « Plateau de fromages » non.
export function serviceDe(nomCategorie) {
  const c = cle(nomCategorie);
  if (!c) return null;
  if (/^entree/.test(c)) return 'entrees';
  if (/^dessert/.test(c)) return 'desserts';
  if (/^plats?($|\s)/.test(c)) return 'plats';
  return null;
}

// Comptes du ticket par service, quantités comprises. Une ligne compte selon
// la catégorie de caisse de son plat (le rangement de la maison), sinon selon
// la catégorie de sa fiche ; une ligne libre ou annulée ne compte pas.
//   parArticle   : Map plat_id -> catégorie de caisse (rangerArticles)
//   articlesParId: Map plat_id -> plat (sa catégorie de fiche)
export function comptesCommande(lignes, { parArticle = null, articlesParId = null } = {}) {
  const n = { entrees: 0, plats: 0, desserts: 0 };
  (lignes || []).forEach((l) => {
    if (!l?.plat_id || l.statut === 'annule') return;
    const s = serviceDe(parArticle?.get(l.plat_id)?.nom) || serviceDe(articlesParId?.get(l.plat_id)?.categorie);
    if (s) n[s] += Number(l.quantite) || 0;
  });
  return n;
}

// Quantité de chaque plat dans le ticket : la pastille de sa case.
export function quantitesParPlat(lignes) {
  const m = new Map();
  (lignes || []).forEach((l) => {
    if (!l?.plat_id || l.statut === 'annule') return;
    m.set(l.plat_id, (m.get(l.plat_id) || 0) + (Number(l.quantite) || 0));
  });
  return m;
}

// Photo d'une case : celle posée dans la caisse, sinon celle de la fiche.
// '' = la maison a choisi « Sans photo » pour cette case.
export function photoDuBouton(article, bouton) {
  const maison = bouton?.photo_url;
  if (maison === '') return null;
  if (maison) return maison;
  return article?.photoUrl || null;
}
