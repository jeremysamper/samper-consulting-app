// ─────────────────────────────────────────────────────────────
// bulkLinkLogic - rapprochement en masse des ingrédients de recettes
// avec le catalogue produits.
//
// Le problème que ça résout : les ingrédients sont saisis librement, recette
// après recette, et « Filet de boeuf » revient dans quinze fiches. Traiter les
// lignes une à une serait 2 700 décisions ; traiter les NOMS DISTINCTS en fait
// quelques centaines, et chaque décision se propage à toutes ses occurrences.
//
// Aucun appel IA ici : matchIngredient (exact / Levenshtein / Jaccard) suffit
// pour l'écrasante majorité des cas, il est instantané et gratuit.
// ─────────────────────────────────────────────────────────────

import { matchIngredient, normalizeName, tokenize } from '../../services/recipeProductMatching.js';
import { applyProductToIngredient, resolvePrixProduit, convertPrix } from '../../services/prixResolution.js';

// Clé de regroupement : tokens triés plutôt que nom normalisé.
//
// « Échalote », « echalotte » et « échalotes » désignent le même achat et doivent
// tenir sur une seule ligne à trancher. tokenize gomme accents, casse, pluriels,
// mots vides et variantes connues ; le tri rend l'ordre des mots indifférent
// (« blanc de poulet » = « poulet blanc »).
//
// Retombe sur le nom normalisé quand il ne reste aucun token (nom fait de mots vides).
export function groupKey(nom) {
  const tk = tokenize(nom);
  return tk.length ? [...tk].sort().join(' ') : normalizeName(nom);
}

// Regroupe les ingrédients NON LIÉS de toutes les recettes par nom normalisé.
// Les lignes déjà rattachées à un produit sont comptées mais pas proposées :
// ce serait redéfaire un travail déjà tranché.
export function collectIngredientGroups(recettes) {
  const groups = new Map();
  let dejaLies = 0;
  let total = 0;

  (recettes || []).forEach(r => {
    (r.ingredients || []).forEach(ing => {
      if (!ing) return;
      total += 1;
      if (ing.produitId) { dejaLies += 1; return; }

      const nom = String(ing.nom || '').trim();
      const key = groupKey(nom);
      if (!key) return;

      if (!groups.has(key)) {
        groups.set(key, { key, nom, graphies: new Map(), occurrences: [] });
      }
      const g = groups.get(key);
      g.graphies.set(nom, (g.graphies.get(nom) || 0) + 1);
      g.occurrences.push({
        recetteId: r.id,
        recetteNom: r.nom,
        ingId: ing.id,
        unite: ing.unite || '',
        prixUnit: Number(ing.prixUnit) || 0,
      });
    });
  });

  return {
    total,
    dejaLies,
    groups: [...groups.values()].map(g => {
      // Graphie affichée : la plus fréquente. « Échalote » l'emporte sur « echalotte »
      // quand douze recettes l'écrivent correctement et une seule se trompe.
      let nom = g.nom;
      let best = 0;
      g.graphies.forEach((n, graphie) => { if (n > best) { best = n; nom = graphie; } });
      const recettesTouchees = new Set(g.occurrences.map(o => o.recetteId));
      return {
        key: g.key,
        nom,
        occurrences: g.occurrences,
        nbOccurrences: g.occurrences.length,
        nbRecettes: recettesTouchees.size,
      };
    }).sort((a, b) => b.nbOccurrences - a.nbOccurrences || a.nom.localeCompare(b.nom)),
  };
}

// Rapproche un groupe du catalogue. Renvoie le groupe enrichi d'un statut.
//
// statut :
//   'auto'   correspondance sûre (>= 85), pré-cochée
//   'ambigu' plusieurs candidats, Jérémy tranche
//   'aucun'  rien au catalogue, proposition de création
//   'exclu'  ingrédient non commercial isolé (sel, poivre, eau) : on ne le lie pas
export function matchGroup(group, catalogue) {
  const res = matchIngredient(group.nom, catalogue);

  if (res.status === 'excluded') {
    return { ...group, statut: 'exclu', product: null, confidence: 0, suggestions: [] };
  }
  if (res.status === 'matched' && res.product) {
    return {
      ...group, statut: 'auto', product: res.product,
      confidence: res.confidence, suggestions: res.suggestions || [],
    };
  }
  if (res.status === 'ambiguous' && (res.suggestions || []).length) {
    return {
      ...group, statut: 'ambigu', product: null,
      confidence: res.confidence, suggestions: res.suggestions,
    };
  }
  return { ...group, statut: 'aucun', product: null, confidence: 0, suggestions: [] };
}

// Le prix du catalogue est-il à zéro alors que la ligne portait un prix saisi ?
// Lier écraserait le prix de repli et ferait tomber le coût de la recette à zéro
// sans que personne ne s'en aperçoive. On le signale avant d'appliquer.
export function detectPerteDePrix(group, product) {
  if (!product) return false;
  if (resolvePrixProduit(product) > 0) return false;
  return (group.occurrences || []).some(o => o.prixUnit > 0);
}

// Prix à donner à un produit créé depuis un ingrédient : on récupère le prix
// déjà saisi dans les recettes plutôt que de créer une fiche à zéro. On prend le
// plus élevé des prix rencontrés, cohérent avec la stratégie « max » du catalogue.
export function prixSeedPourNouveauProduit(group, uniteRef) {
  let best = 0;
  (group.occurrences || []).forEach(o => {
    if (!(o.prixUnit > 0)) return;
    const converti = o.unite && o.unite !== uniteRef
      ? convertPrix(o.prixUnit, o.unite, uniteRef)
      : o.prixUnit;
    if (converti !== null && converti > best) best = converti;
  });
  return best;
}

// Unité à proposer pour un produit créé : celle qui domine dans les recettes.
export function uniteDominante(group, defaut = 'g') {
  const counts = new Map();
  (group.occurrences || []).forEach(o => {
    if (o.unite) counts.set(o.unite, (counts.get(o.unite) || 0) + 1);
  });
  let unite = defaut;
  let best = 0;
  counts.forEach((n, u) => { if (n > best) { best = n; unite = u; } });
  return unite;
}

// Traduit les décisions (clé de groupe -> produit) en upserts de recettes.
// Une recette = un upsert, même si dix de ses ingrédients sont concernés.
export function planLinkWrites(recettes, groups, decisions) {
  // ingId -> produit à appliquer
  const parIngredient = new Map();
  groups.forEach(g => {
    const product = decisions.get(g.key);
    if (!product) return;
    g.occurrences.forEach(o => parIngredient.set(o.ingId, product));
  });
  if (!parIngredient.size) return [];

  const writes = [];
  (recettes || []).forEach(r => {
    const concernee = (r.ingredients || []).some(i => i && parIngredient.has(i.id));
    if (!concernee) return;
    const ingredients = (r.ingredients || []).map(ing => {
      const product = ing && parIngredient.get(ing.id);
      return product ? applyProductToIngredient(ing, product) : ing;
    });
    const nbLignes = (r.ingredients || []).filter(i => i && parIngredient.has(i.id)).length;
    writes.push({ recette: r, ingredients, nbLignes });
  });
  return writes;
}
