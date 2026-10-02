// ─────────────────────────────────────────────────────────────────────────────
// Produits maison : lignes d'inventaire liées à une fiche recette du module
// Cartes & Recettes (pickles, fonds, confits, desserts en portions...).
//
// Leur prix n'a pas de facture : c'est le coût matière de la fiche. Rien
// n'est écrit dans le module recettes (pas de CHF dans les fiches) : le
// chiffrage est calculé ici, à la lecture.
//
// Chaque établissement est chiffré avec SES prix, jamais ceux d'un autre :
// catalogue, inventaire et fiches sont tous lus pour l'établissement affiché.
//
// Prix d'un ingrédient, du plus sûr au plus approché :
//   1. produit du catalogue de l'établissement lié à l'ingrédient (prix vivant)
//   2. produit de même nom dans l'inventaire (prix des factures de la maison)
//   3. produit de même nom au catalogue de l'établissement
//   4. prix figé sur l'ingrédient, en dernier recours : il a pu être recopié
//      d'un autre établissement avec la fiche (outil de transfert), il ne
//      passe donc qu'après tous les prix propres à l'établissement.
// 2 et 3 sont signalés « estimés », 4 « figé ».
//
// Unité de comptage :
//   kg, g, L, ml   coût matière / poids total des ingrédients (une préparation
//                  pèse ce que pèsent ses ingrédients, liquides à 1 kg/L :
//                  méthode du classeur des établissements, « saumure comprise »)
//   autre          coût matière / nombre de portions de la fiche
// ─────────────────────────────────────────────────────────────────────────────

import { buildProduitIndex, describePrixIngredient, resolvePrixProduit, convertPrix } from '../../services/prixResolution.js';
import { matchIngredient, tokenize } from '../../services/recipeProductMatching.js';
import { nouvelIdLigne } from './inventaireLignes.js';

export const CATEGORIE_MAISON = 'Produits maison';
const SUFFIXE = ' (maison)';

// Grammes (ou millilitres) par unité d'ingrédient. Les cuillères sont des
// volumes connus ; la pièce et la pincée n'ont pas de poids : elles comptent
// dans le coût, pas dans la masse.
const GRAMMES = { g: 1, kg: 1000, mg: 0.001, ml: 1, cl: 10, dl: 100, l: 1000, cc: 5, cs: 15 };
// Unités d'inventaire ramenées à celles de convertPrix (g, kg, ml, L, cl).
const UNITE_PRIX = { g: 'g', kg: 'kg', ml: 'ml', cl: 'cl', l: 'L', dl: null };
// Équivalence poids / volume à 1 kg par litre, pour les seules estimations.
const POIDS_VOLUME = { g: 'ml', kg: 'L', ml: 'g', cl: null, L: 'kg' };

export function masseRecette(recette) {
  let grammes = 0;
  let horsPoids = 0;
  (recette?.ingredients || []).forEach(i => {
    const q = Number(i.quantite) || 0;
    if (q <= 0) return;
    const f = GRAMMES[String(i.unite || '').toLowerCase()];
    if (f) grammes += q * f; else horsPoids += 1;
  });
  return { grammes, horsPoids };
}

// Mots qui changent la nature du produit : un « bouillon de poulet » n'est pas
// du poulet, une « huile d'olive » pas des olives. Présents d'un côté seulement,
// ils interdisent le rapprochement.
const TRANSFORMATIONS = new Set(['bouillon', 'fond', 'fumet', 'jus', 'sauce', 'sirop', 'puree', 'coulis', 'confiture', 'poudre',
  'extrait', 'arome', 'vinaigre', 'huile', 'creme', 'lait', 'beurre', 'glace', 'liqueur', 'concentre', 'pate', 'farine']);

// Rapprochement par les mots, en complément de matchIngredient (qui exige des
// noms presque identiques) : « Prunes fermes » ↔ « Prune », « Ail » ↔ « Ail
// pelé », « Tomates cerises mondées » ↔ « Tomate cerise ». Les mots d'un nom
// doivent tous se trouver dans l'autre ; le candidat le plus précis gagne,
// l'égalité ne se tranche pas (null).
export function rapprocherParMots(nom, candidats) {
  const mots = new Set(tokenize(nom));
  if (!mots.size) return null;
  const transfo = [...mots].filter(t => TRANSFORMATIONS.has(t));
  let meilleur = null;
  let meilleurScore = -Infinity;
  let egalite = false;
  candidats.forEach(c => {
    const tk = tokenize(c.nom);
    if (!tk.length) return;
    const setC = new Set(tk);
    // Même transformation des deux côtés, ou aucune.
    if (transfo.some(t => !setC.has(t)) || tk.some(t => TRANSFORMATIONS.has(t) && !mots.has(t))) return;
    let score;
    if (tk.every(t => mots.has(t))) {
      // Le candidat est contenu dans le nom : plus il a de mots, plus il est précis.
      if (tk.length === 1 && mots.size > 3) return;
      score = 100 + tk.length * 10 - (mots.size - tk.length);
    } else if ([...mots].every(t => setC.has(t))) {
      // Le nom est contenu dans le candidat : moins il y a de mots en trop, mieux c'est.
      score = 50 - (tk.length - mots.size) * 10;
    } else {
      return;
    }
    if (score > meilleurScore) { meilleur = c; meilleurScore = score; egalite = false; }
    else if (score === meilleurScore) egalite = true;
  });
  return meilleur && !egalite ? meilleur : null;
}

const parPoids = (unite) => ['kg', 'g', 'l', 'ml'].includes(String(unite || '').toLowerCase());
const nomCherche = (produit) => String(produit || '').replace(/\(\s*maison\s*\)/gi, ' ').replace(/\bmaison\b/gi, ' ').trim();

// Référentiel de prix pour le chiffrage : catalogue indexé + candidats par nom.
// `lignesInventaire` : lignes de l'inventaire affiché et du précédent (les
// produits maison eux-mêmes sont exclus : une fiche ne se chiffre pas par
// son propre résultat).
export function construireReferencesPrix({ catalogue, lignesInventaire }) {
  const index = buildProduitIndex(catalogue);
  const vus = new Set();
  const inventaire = [];
  (lignesInventaire || []).forEach(l => {
    const prix = Number(l.prixUnit) || 0;
    const unite = UNITE_PRIX[String(l.unite || '').toLowerCase()];
    if (l.recetteId || prix <= 0 || !unite || !l.produit) return;
    const cle = nomCherche(l.produit).toLowerCase();
    if (vus.has(cle)) return;
    vus.add(cle);
    inventaire.push({ id: `inv:${inventaire.length}`, nom: nomCherche(l.produit), prix, unite, origine: 'inventaire' });
  });
  const cat = (catalogue || [])
    .filter(p => p?.nom && p.actif !== false)
    .map(p => ({ id: `cat:${p.id}`, nom: p.nom, prix: resolvePrixProduit(p), unite: p.uniteRef || 'g', origine: 'catalogue' }))
    .filter(p => p.prix > 0);
  return { index, inventaire, catalogue: cat, cache: new Map() };
}

// Prix d'un ingrédient en CHF par son unité, avec sa provenance.
export function prixIngredient(ing, refs) {
  const d = describePrixIngredient(ing, refs.index);
  if (d.source === 'catalogue') return { prix: d.prix, source: 'catalogue' };
  // Prix figé de la fiche (ou ingrédient lié mais d'unité inconvertible) :
  // gardé en réserve, utilisé seulement si l'établissement n'a rien de mieux.
  const fige = d.prix > 0 ? { prix: d.prix, source: 'fige' } : { prix: 0, source: 'aucun' };
  // Rapprochement par le nom, seulement quand il est sûr : un « poulet » ne
  // doit pas prendre le prix d'un « bouillon de poulet ».
  const uniteIng = UNITE_PRIX[String(ing?.unite || '').toLowerCase()];
  if (!ing?.nom || !uniteIng) return fige;
  const cle = `${ing.nom}|${uniteIng}|${d.prix}`;
  if (refs.cache.has(cle)) return refs.cache.get(cle);
  let res = fige;
  for (const liste of [refs.inventaire, refs.catalogue]) {
    if (!liste.length) continue;
    const m = matchIngredient(ing.nom, liste);
    // Eau, sel, glace seuls : exclus du rapprochement par construction, et
    // de coût négligeable. Ils ne doivent pas faire passer la fiche pour
    // incomplète.
    if (m.status === 'excluded') { res = fige.source === 'fige' ? fige : { prix: 0, source: 'negligeable' }; break; }
    const ref = m.status === 'matched' && m.product ? m.product : rapprocherParMots(ing.nom, liste);
    if (!ref) continue;
    let prix = convertPrix(ref.prix, ref.unite, uniteIng);
    // 60 g d'huile pour une huile vendue au litre : même hypothèse que le
    // poids des fiches, 1 kg par litre. Acceptable pour une estimation.
    if (prix == null) prix = convertPrix(ref.prix, POIDS_VOLUME[ref.unite] || ref.unite, uniteIng);
    if (prix == null) continue;
    res = { prix, source: 'estime', reference: ref.nom, origine: ref.origine };
    break;
  }
  refs.cache.set(cle, res);
  return res;
}

export function coutRecette(recette, refs) {
  let cout = 0;
  let estimes = 0;
  let figes = 0;
  let sansPrix = 0;
  (recette?.ingredients || []).forEach(i => {
    const q = Number(i.quantite) || 0;
    if (q <= 0) return;
    const p = prixIngredient(i, refs);
    if (p.source === 'negligeable') return;
    if (p.source === 'aucun') { sansPrix += 1; return; }
    if (p.source === 'estime') estimes += 1;
    if (p.source === 'fige') figes += 1;
    cout += q * p.prix;
  });
  return { cout, estimes, figes, sansPrix };
}

// Coût matière d'une fiche ramené à l'unité de comptage de la ligne.
// Renvoie { prix, detail, estime } ; prix null si rien de chiffrable.
export function coutUnitaireRecette(recette, unite, refs) {
  if (!recette) return { prix: null, detail: 'fiche introuvable', estime: false };
  const { cout, estimes, figes, sansPrix } = coutRecette(recette, refs);
  const precisions = [];
  if (estimes) precisions.push(`${estimes} prix estimé${estimes > 1 ? 's' : ''} par le nom`);
  if (figes) precisions.push(`${figes} prix figé${figes > 1 ? 's' : ''} de la fiche`);
  if (sansPrix) precisions.push(`${sansPrix} ingrédient${sansPrix > 1 ? 's' : ''} sans prix`);
  const u = String(unite || '').toLowerCase();

  if (parPoids(u)) {
    const { grammes, horsPoids } = masseRecette(recette);
    if (grammes <= 0) return { prix: null, detail: 'poids des ingrédients inconnu', estime: false };
    if (horsPoids) precisions.push(`${horsPoids} ingrédient${horsPoids > 1 ? 's' : ''} à la pièce hors poids`);
    const parGramme = cout / grammes;
    return { prix: u === 'kg' || u === 'l' ? parGramme * 1000 : parGramme, detail: precisions.join(', '), estime: estimes > 0 || figes > 0 };
  }
  const portions = Number(recette.portions) || 0;
  if (portions <= 0) return { prix: null, detail: 'nombre de portions inconnu', estime: false };
  return { prix: cout / portions, detail: precisions.join(', '), estime: estimes > 0 || figes > 0 };
}

// Nom d'inventaire d'une fiche : « Prune lacto aromatisée (maison) ».
export const nomMaison = (recette) => {
  const nom = String(recette?.nom || '').trim();
  return /maison/i.test(nom) ? nom : nom + SUFFIXE;
};

// Ligne d'inventaire neuve depuis une fiche. Une préparation se pèse (kg),
// sauf une fiche sans ingrédient pesable, qui se compte en portions.
export function ligneDepuisRecette(recette, refs, { zone = '' } = {}) {
  const unite = masseRecette(recette).grammes > 0 ? 'kg' : 'pcs';
  const { prix } = coutUnitaireRecette(recette, unite, refs);
  return {
    id: nouvelIdLigne(),
    produit: nomMaison(recette),
    categorie: CATEGORIE_MAISON,
    unite,
    stockTheo: 0,
    stockReel: null,
    prixUnit: prix != null ? +prix.toFixed(4) : 0,
    recetteId: recette.id,
    recetteNom: recette.nom,
    ...(zone ? { zone } : {}),
  };
}

// Lie (recette) ou délie (null) une ligne existante. Le prix suit la fiche.
export function lierLigne(ligne, recette, refs) {
  if (!recette) {
    const { recetteId: _id, recetteNom: _nom, ...reste } = ligne;
    return reste;
  }
  const { prix } = coutUnitaireRecette(recette, ligne.unite, refs);
  return {
    ...ligne,
    recetteId: recette.id,
    recetteNom: recette.nom,
    ...(prix != null ? { prixUnit: +prix.toFixed(4) } : {}),
  };
}

// Fiche proposée pour une ligne pas encore liée.
export function suggererRecette(ligne, recettes) {
  const candidats = (recettes || []).filter(r => r?.nom).map(r => ({ id: r.id, nom: r.nom }));
  if (!candidats.length) return null;
  const res = matchIngredient(nomCherche(ligne.produit), candidats);
  if (res.status === 'matched' && res.product) {
    return { recette: recettes.find(r => r.id === res.product.id), confidence: res.confidence, sure: true };
  }
  // Au-delà d'un nom quasi identique, seule une ligne qui se dit « maison »
  // est proposée : la matière première « Prune » ne doit jamais prendre le
  // coût de la fiche « Prune lacto aromatisée ».
  const ditMaison = /maison/i.test(String(ligne.produit || '')) || ligne.categorie === CATEGORIE_MAISON;
  if (!ditMaison) return null;
  // « Prune lacto (maison) » ↔ fiche « Prune lacto aromatisée ».
  const parMots = rapprocherParMots(nomCherche(ligne.produit), candidats);
  if (parMots) return { recette: recettes.find(r => r.id === parMots.id), confidence: 80, sure: true };
  if (res.status === 'ambiguous' && res.suggestions?.[0]?.product) {
    const s = res.suggestions[0];
    return { recette: recettes.find(r => r.id === s.product.id), confidence: s.confidence, sure: false };
  }
  return null;
}

// Fiches utilisables : celles de l'établissement, sans les archivées.
export const fichesActives = (recettes) => (recettes || []).filter(r => r?.nom && r.statut !== 'archivée');

// Texte « sources » de l'état d'inventaire pour une ligne liée.
export const sourceMaison = (ligne) => {
  const prix = Number(ligne.prixUnit) || 0;
  return `Produit maison · fiche « ${ligne.recetteNom || nomCherche(ligne.produit)} » : ${prix.toFixed(2)} CHF/${ligne.unite} (coût matière)`;
};

export const estMaison = (ligne) => !!ligne?.recetteId;

// Cartes de chaque fiche, via les plats : carte → plats (carte_plats) →
// fiches (plat_recettes). Sert à proposer les fiches carte par carte dans
// « + Produits » (Buffet PDJ, Beverage…), une carte cochée d'un coup.
// Les cartes archivées sont ignorées. Renvoie Map(recetteId → [{ id, nom, rang }]).
export const cartesDesFiches = (cartes, plats) => {
  const rangs = new Map();
  (cartes || []).forEach((c, i) => { if (c && !c.archive) rangs.set(c.id, { id: c.id, nom: c.nom, rang: i }); });
  const parFiche = new Map();
  (plats || []).forEach((p) => {
    const cartesDuPlat = (p?.carteIds || []).map(id => rangs.get(id)).filter(Boolean);
    if (!cartesDuPlat.length) return;
    (p.recettes || []).forEach(({ recetteId }) => {
      if (!recetteId) return;
      const liste = parFiche.get(recetteId) || [];
      cartesDuPlat.forEach(c => { if (!liste.some(x => x.id === c.id)) liste.push(c); });
      parFiche.set(recetteId, liste);
    });
  });
  return parFiche;
};

// ─── Recettes des cartes, ajoutées d'office aux inventaires en cours ───
// Chaque périmètre compte les recettes des cartes qui le concernent :
//   - Boissons / Bar / Beverage → cartes de boissons (Beverage, vins,
//     spiritueux…) ;
//   - Cuisine (et pâtisserie) → toutes les autres cartes, sauf les fiches
//     aussi présentes sur une carte de boissons (les bases du Carnet sur
//     Buffet PDJ et Beverage) : comptées une seule fois, côté Boissons ;
//   - Général → toutes les cartes ;
//   - tout autre périmètre (Matériel, Spa…) → aucune.
// Les cartes archivées ou masquées sont ignorées.
const RE_BOISSONS = /boisson|\bbar\b|beverage|drink|bebida|\bcave\b|cocktail|\bvins?\b|spiritueux/i;
const RE_CUISINE = /cuisine|kitchen|cocina|p[âa]tisserie|garde-manger/i;
const RE_GENERAL = /g[ée]n[ée]ral/i;

export function cartesDuPerimetre(perimetre, cartes) {
  const nom = String(perimetre || '');
  const actives = (cartes || []).filter(c => c && !c.archive && !c.masquee);
  if (RE_BOISSONS.test(nom)) return actives.filter(c => RE_BOISSONS.test(c.nom || ''));
  if (RE_CUISINE.test(nom)) return actives.filter(c => !RE_BOISSONS.test(c.nom || ''));
  if (RE_GENERAL.test(nom)) return actives;
  return [];
}

// Fiches (parmi `recettes`, déjà filtrées par fichesActives) des cartes du
// périmètre qui n'ont pas encore de ligne dans `lignes` (ni liée à la fiche,
// ni du même nom).
export function fichesManquantes(perimetre, { cartes, plats, recettes, lignes }) {
  const ids = new Set(cartesDuPerimetre(perimetre, cartes).map(c => c.id));
  if (!ids.size) return [];
  const fichesDes = (idsCartes) => {
    const set = new Set();
    (plats || []).forEach(p => {
      if (!(p?.carteIds || []).some(id => idsCartes.has(id))) return;
      (p.recettes || []).forEach(({ recetteId }) => { if (recetteId) set.add(recetteId); });
    });
    return set;
  };
  const voulues = fichesDes(ids);
  const nom = String(perimetre || '');
  if (RE_CUISINE.test(nom) && !RE_BOISSONS.test(nom)) {
    const coteBoissons = fichesDes(new Set(cartesDuPerimetre('Boissons', cartes).map(c => c.id)));
    coteBoissons.forEach(id => voulues.delete(id));
  }
  const dejaLiees = new Set((lignes || []).map(l => l.recetteId).filter(Boolean));
  const dejaNommees = new Set((lignes || []).map(l => nomCherche(l.produit)));
  return (recettes || []).filter(r => voulues.has(r.id)
    && !dejaLiees.has(r.id)
    && !dejaNommees.has(nomCherche(nomMaison(r))));
}
