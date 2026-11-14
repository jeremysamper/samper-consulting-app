import { toCanonical, STAPLES_SECS, STAPLES_HYGIENE } from './computeBesoins.js';
import { HYGIENE, classerProduit, contexteClassement, estNonCommandable, estPreparation } from './classerProduit.js';

// ─────────────────────────────────────────────────────────────────────────────
// Commande par carte : ce que chaque carte demande, rangé comme la carte se
// lit (catégorie de plat, plat, fiche, ingrédient), calculé en direct depuis
// les fiches. Aucune écriture, aucun appel IA : util pur (ni React ni DOM).
//
// Une case cochée vaut pour le PRODUIT, partout où il apparaît (décision du
// 14.11.2026) : la clé d'une ligne est le nom du produit, normalisé, sans
// l'unité. La farine cochée dans le burger l'est aussi dans la croquette et
// dans les fonds de cuisine. Une commande ne somme plus rien : on coche ce
// qu'il faut commander, la quantité se saisit dans « Ma commande ».
//
// `plat_recettes` est une liste plate (toute la chaîne des préparations d'un
// plat y est rattachée) : on ne descend dans aucune recette imbriquée. Une
// ligne qui porte le nom d'une recette de l'établissement est une préparation
// maison : affichée, jamais à commander.
//
// Recettes cachées : la production continue de les lire (commande comprise),
// mais leur nom ne s'affiche pour aucun rôle. Leurs ingrédients restent, sous
// un titre neutre. Recettes archivées et plats inactifs : exclus.
// ─────────────────────────────────────────────────────────────────────────────

const slug = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

// Clé d'un produit dans la commande, partagée par toutes les cartes.
export const cleProduit = (nom) => 'nom:' + slug(nom);

// Nom comparable de deux lignes de commande (lignes en base comprises) ;
// le nom d'une clé produit est cleProduit(nom).slice(4).
export const nomCle = (nom) => slug(nom);

export const TITRE_FICHE_CACHEE = 'Préparation non affichée';

// Quantité d'une fiche, lisible : 1500 g devient 1,5 kg.
export function formatQuantite(quantite, unite) {
  const n = Number(quantite);
  if (!Number.isFinite(n) || n <= 0) return '';
  const rond = (x) => (Math.round(x * 100) / 100).toString().replace('.', ',');
  const { canonical, factor } = toCanonical(unite);
  const base = n * factor;
  if (canonical === 'g') return base >= 1000 ? `${rond(base / 1000)} kg` : `${rond(base)} g`;
  if (canonical === 'ml') return base >= 1000 ? `${rond(base / 1000)} L` : `${rond(base)} ml`;
  return `${rond(n)}${unite ? ' ' + unite : ''}`;
}

// Contexte partagé par toutes les cartes d'un établissement.
export function contexteCommande({ plats = [], recettes = [], catalogue = [] } = {}) {
  const actives = (recettes || []).filter(r => r && r.statut !== 'archivée');
  return {
    plats: (plats || []).filter(p => p && p.actif !== false),
    recetteById: new Map(actives.map(r => [r.id, r])),
    produitById: new Map((catalogue || []).map(p => [p.id, p])),
    ctxRayon: contexteClassement({ catalogue, recettes: actives }),
  };
}

function ligneIngredient(ing, ctx) {
  const produit = ing?.produitId ? ctx.produitById.get(ing.produitId) : null;
  const nom = String((produit ? produit.nom : ing?.nom) || '').trim();
  if (!nom) return null;
  if (!produit && estNonCommandable(nom)) return null;
  const preparation = estPreparation(nom, ctx.ctxRayon);
  return {
    cle: cleProduit(nom),
    nom,
    quantite: formatQuantite(ing.quantite, ing.unite),
    unite: toCanonical(ing.unite).canonical,
    rayon: classerProduit(nom, ctx.ctxRayon, produit ? produit.categorie : ing.categorie),
    preparation,
  };
}

/**
 * Plats d'une carte, dans l'ordre de la carte.
 * @returns {{ groupes: Array<{ id, titre, categorie, sansFiche, sections: Array<{ id, titre, lignes }>, cles: string[] }>, cles: string[] }}
 *   `cles` : produits à commander (préparations exclues), sans doublon.
 */
export function besoinsDeCarte(carte, ctx) {
  if (!carte || !ctx) return { groupes: [], cles: [] };
  const platsCarte = ctx.plats.filter(p => (p.carteIds || []).includes(carte.id));
  const toutes = new Set();
  const groupes = platsCarte.map(plat => {
    const liens = (plat.recettes || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    const sections = [];
    liens.forEach(lien => {
      const recette = ctx.recetteById.get(lien.recetteId);
      if (!recette) return;
      const vues = new Set();
      const lignes = (recette.ingredients || []).map(ing => ligneIngredient(ing, ctx)).filter(l => {
        if (!l || vues.has(l.cle)) return false;
        vues.add(l.cle);
        return true;
      });
      if (!lignes.length) return;
      sections.push({
        id: recette.id,
        titre: recette.masquee === true ? TITRE_FICHE_CACHEE : (recette.nom || 'Fiche sans nom'),
        lignes,
      });
    });
    // Plat sans fiche (une bouteille de la carte des vins, un plat pas encore
    // écrit) : il se commande tel quel, une ligne à son nom.
    const sansFiche = sections.length === 0;
    if (sansFiche) {
      const nom = String(plat.nom || '').trim();
      if (nom) {
        sections.push({
          id: plat.id + ':seul',
          titre: null,
          lignes: [{ cle: cleProduit(nom), nom, quantite: '', unite: '', rayon: classerProduit(nom, ctx.ctxRayon), preparation: false }],
        });
      }
    }
    const cles = [...new Set(sections.flatMap(s => s.lignes.filter(l => !l.preparation).map(l => l.cle)))];
    cles.forEach(c => toutes.add(c));
    return { id: plat.id, titre: plat.nom || 'Plat sans nom', categorie: plat.categorie || '', sansFiche, sections, cles };
  }).filter(g => g.sections.length > 0);
  return { groupes, cles: [...toutes] };
}

// Fonds de cuisine : les secs et l'hygiène qu'aucune fiche ne nomme, en deux
// groupes, au même format que les plats.
export function besoinsFondsDeCuisine() {
  const groupe = (id, titre, liste) => {
    const lignes = liste.map(st => ({ cle: cleProduit(st.nom), nom: st.nom, quantite: '', unite: '', rayon: st.categorie, preparation: false }));
    return { id, titre, categorie: '', sansFiche: false, sections: [{ id: id + ':liste', titre: null, lignes }], cles: lignes.map(l => l.cle) };
  };
  const groupes = [
    groupe('fonds-secs', 'Épicerie sèche', STAPLES_SECS),
    groupe('fonds-hygiene', HYGIENE, STAPLES_HYGIENE),
  ];
  return { groupes, cles: groupes.flatMap(g => g.cles) };
}

// Plats d'une carte où apparaît chaque produit : « aussi dans … ».
export function platsParProduit(groupes) {
  const m = new Map();
  (groupes || []).forEach(g => g.cles.forEach(c => {
    if (!m.has(c)) m.set(c, []);
    m.get(c).push(g.titre);
  }));
  return m;
}

// Filtre de la loupe : un plat dont le nom répond garde toutes ses lignes ;
// sinon seules les lignes dont le nom répond restent, et un plat vide sort.
export function filtrerGroupes(groupes, correspond) {
  if (!correspond) return groupes;
  return (groupes || []).map(g => {
    if (correspond(g.titre)) return g;
    const sections = g.sections
      .map(s => ({ ...s, lignes: s.lignes.filter(l => correspond(l.nom)) }))
      .filter(s => s.lignes.length > 0);
    return sections.length ? { ...g, sections } : null;
  }).filter(Boolean);
}
