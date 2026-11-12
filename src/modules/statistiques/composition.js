// ─────────────────────────────────────────────────────────────────────────────
// Assemblage d'un graphique des Statistiques, sans React ni DOM (testé par
// node --test, egalite.test.mjs) : des points rendus par les fonctions
// d'origine aux séries tracées et au tableau des valeurs exactes.
//
// Rien n'est calculé ici au-delà de l'arithmétique d'affichage : chaque valeur
// est lue par `valeur` de sa mesure sur un point d'origine. Le total d'une
// série est la valeur de la fonction d'origine sur la période entière (D4) ;
// la somme des points ne sert qu'à dire l'écart d'arrondi quand il existe.
// ─────────────────────────────────────────────────────────────────────────────

import { ecartArrondi, ecartDe, valeurPeriode } from './agregation.js';
import { echelleDe } from './echelles.js';
import { MAX_SERIES, typeRetenu, typesValides, unitesDe } from './vueStatistiques.js';

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);
const AUTRES = '__autres__';

// Mesure à choix (une zone, un produit) : les options se lisent sur le point
// de la période entière ; le choix retenu par le graphique, sinon la première.
//   → { mesure, libelle, options: [{ cle, libelle }], valeur } ou null
export function choixDe(m, total, graphique) {
  if (!m.choix) return null;
  const options = total ? m.choix.options(total) || [] : [];
  const voulu = graphique?.choix?.[m.id];
  const retenue = options.find((o) => o.cle === voulu) || options[0] || null;
  return { mesure: m.id, libelle: m.choix.libelle, options, valeur: retenue ? retenue.cle : null, option: retenue };
}

// Séries d'une mesure sans ventilation. Une mesure à choix trace l'option
// retenue, sous son nom (une donnée, jamais traduite).
function serieDeMesure(m, sources, graphique) {
  const points = sources.points[m.famille];
  const total = sources.totaux[m.famille];
  const avant = sources.pointsComparaison?.[m.famille];
  const totalAvant = sources.totauxComparaison?.[m.famille];
  const choix = choixDe(m, total, graphique);
  const lire = (p) => (choix ? (choix.valeur == null ? null : m.valeur(p, choix.valeur)) : m.valeur(p));
  const valeurs = points.map(lire);
  const comparaison = avant ? avant.map(lire) : null;
  const surPeriode = valeurPeriode(m.nature, { surPeriode: total ? lire(total) : null, valeurs });
  const surPeriodeAvant = avant ? valeurPeriode(m.nature, { surPeriode: totalAvant ? lire(totalAvant) : null, valeurs: comparaison }) : null;
  return {
    id: m.id, mesure: m.id, libelle: choix?.option ? choix.option.libelle : m.libelle, donnee: !!choix?.option && !choix.option.traduire, unite: m.unite, nature: m.nature,
    valeurs, comparaison, total: surPeriode, totalComparaison: surPeriodeAvant,
    ecartTotal: avant ? ecartDe(surPeriode, surPeriodeAvant) : null,
    arrondi: m.nature === 'flux' ? ecartArrondi(valeurs, surPeriode) : null,
  };
}

// Séries d'une mesure ventilée : une série par catégorie, les plus grosses
// d'abord (total de la période), au plus six ; le reste est regroupé. Une
// ventilation `ordre: 'croissant'` garde les plus petites (moins vendus), une
// ventilation `ordre: 'naturel'` garde l'ordre de ses parts (jours de semaine).
function seriesVentilees(m, ventilation, sources) {
  const points = sources.points[m.famille];
  const total = sources.totaux[m.famille];
  const avant = sources.totauxComparaison?.[m.famille];
  const cats = new Map();
  const noter = (part, rang, cible) => {
    if (!cats.has(part.cle)) cats.set(part.cle, { cle: part.cle, libelle: part.libelle, brut: !!part.brut, donnee: !!part.donnee, valeurs: points.map(() => null), total: null, totalComparaison: null });
    const c = cats.get(part.cle);
    if (cible === 'point') c.valeurs[rang] = part.valeur;
    else c[cible] = part.valeur;
    if (cible === 'total' && part.poids != null) c.poids = part.poids;
  };
  points.forEach((p, i) => ventilation.parts(p).forEach((part) => noter(part, i, 'point')));
  if (total) ventilation.parts(total).forEach((part) => noter(part, 0, 'total'));
  if (avant) ventilation.parts(avant).forEach((part) => noter(part, 0, 'totalComparaison'));
  const sens = ventilation.ordre === 'croissant' ? -1 : 1;
  // Un taux ou un stock se trie sur son poids (nombre de jours, de relevés),
  // jamais sur une somme ; un flux sur son total.
  const poids = (c) => (m.nature === 'flux' ? Math.abs(c.total || 0) : (c.poids ?? Math.abs(c.total || 0)));
  const tri = ventilation.ordre === 'naturel'
    ? [...cats.values()]
    : [...cats.values()].sort((a, b) => sens * (poids(b) - poids(a)) || String(a.libelle).localeCompare(String(b.libelle), 'fr'));
  let gardees = tri;
  let nonTracees = 0;
  if (tri.length > MAX_SERIES && m.nature !== 'flux') {
    // Un taux ou un relevé ne se regroupe pas en « Autres » (une somme de
    // moyennes ou de températures n'a pas de sens) : six au plus, le reste dit.
    gardees = tri.slice(0, MAX_SERIES);
    nonTracees = tri.length - MAX_SERIES;
  } else if (tri.length > MAX_SERIES) {
    gardees = tri.slice(0, MAX_SERIES - 1);
    const reste = tri.slice(MAX_SERIES - 1);
    const somme = (liste) => (liste.some(estNombre) ? liste.filter(estNombre).reduce((s, v) => s + Math.round(v * 100), 0) / 100 : null);
    gardees.push({
      cle: AUTRES, libelle: 'Autres', brut: false, donnee: false, nbRegroupes: reste.length,
      valeurs: points.map((_, i) => somme(reste.map((c) => c.valeurs[i]))),
      total: somme(reste.map((c) => c.total)),
      totalComparaison: avant ? somme(reste.map((c) => c.totalComparaison)) : null,
    });
  }
  const series = gardees.map((c) => ({
    id: `${m.id}|${c.cle}`, mesure: m.id, libelle: c.libelle, brut: c.brut, donnee: c.donnee, nbRegroupes: c.nbRegroupes || 0,
    unite: m.unite, nature: m.nature, valeurs: c.valeurs, comparaison: null,
    total: c.total, totalComparaison: avant ? c.totalComparaison : null,
    ecartTotal: avant ? ecartDe(c.total, c.totalComparaison) : null,
    arrondi: null,
  }));
  series.nonTracees = nonTracees;
  return series;
}

// Échelle d'un axe : les valeurs des séries, ou les piles pour un empilé
// (somme des valeurs positives et somme des négatives de chaque tranche).
//   mode : 'empile' (piles), 'totaux' (barres d'une ventilation sur la
//   période), 'valeurs' (courbes et barres dans le temps, comparaison comprise).
function echelleAxe(series, mode) {
  if (mode === 'empile') {
    const n = Math.max(0, ...series.map((s) => s.valeurs.length));
    const piles = [];
    for (let i = 0; i < n; i += 1) {
      let haut = 0;
      let bas = 0;
      series.forEach((s) => { const v = s.valeurs[i]; if (estNombre(v)) { if (v >= 0) haut += v; else bas += v; } });
      piles.push(haut, bas);
    }
    return echelleDe(piles);
  }
  if (mode === 'totaux') return echelleDe(series.map((s) => s.total));
  return echelleDe(series.flatMap((s) => [...s.valeurs, ...(s.comparaison || [])]));
}

//   graphique : { mesures: [ids], ventilation, type }
//   mesures   : les mesures cochées et visibles, dans l'ordre des cases
//   tranches, tranchesComparaison
//   sources   : { points, totaux, pointsComparaison, totauxComparaison },
//               par famille ; une famille absente de `points` n'est pas lue
//   etats     : { famille: 'loading' | 'ready' | 'error' }
//   familles  : les familles du catalogue (libellé, journée)
// → { type, types, series, unites, echelles, enAttente, nonLues, journees,
//     phrases, choix, ventilation, vide }
export function composer({ graphique, mesures, tranches, tranchesComparaison = null, sources, etats = {}, familles = [] }) {
  const cochees = mesures || [];
  const familleDe = (id) => familles.find((f) => f.id === id);
  const idsFamilles = [...new Set(cochees.map((m) => m.famille))];
  const enAttente = idsFamilles.filter((f) => etats[f] === 'loading' || (etats[f] !== 'error' && !sources.points[f]));
  const nonLues = idsFamilles.filter((f) => etats[f] === 'error');
  const lues = cochees.filter((m) => sources.points[m.famille] && etats[m.famille] !== 'error');

  const seule = cochees.length === 1 ? cochees[0] : null;
  const ventilation = seule ? (seule.ventilations || []).find((v) => v.id === graphique.ventilation) || null : null;
  const avecComparaison = !!tranchesComparaison && !ventilation;
  const src = avecComparaison ? sources : { ...sources, pointsComparaison: null };

  let series = [];
  let nonTracees = 0;
  if (ventilation && lues.length) {
    const v = seriesVentilees(seule, ventilation, sources);
    nonTracees = v.nonTracees;
    series = v.map((s) => ({ ...s, ventile: true }));
  }
  else series = lues.map((m) => serieDeMesure(m, src, graphique));

  const unites = unitesDe(series);
  series = series.map((s, i) => ({ ...s, rang: i, axe: unites.indexOf(s.unite) === 1 ? 'd' : 'g' }));
  const contexte = { nbTranches: tranches.length, nbSeries: series.length, ventilation: !!ventilation, cumulable: !ventilation || seule?.nature === 'flux' };
  const types = typesValides(contexte);
  const type = typeRetenu(graphique, contexte);
  const mode = type === 'empile' ? 'empile' : (type === 'barres' && ventilation ? 'totaux' : 'valeurs');
  const echelles = {
    g: echelleAxe(series.filter((s) => s.axe === 'g'), mode),
    d: unites.length > 1 ? echelleAxe(series.filter((s) => s.axe === 'd'), mode) : null,
  };
  const journees = [...new Set(lues.map((m) => familleDe(m.famille)?.journee).filter(Boolean))];
  return {
    type,
    types,
    series,
    unites,
    echelles,
    ventilation,
    nonTracees,
    // Ventilations qui ont des catégories sur la période (une salle sans zones
    // n'offre pas « par zone ») ; null tant que la famille n'est pas lue.
    ventilationsDisponibles: seule && sources.totaux?.[seule.famille] ? (seule.ventilations || []).filter((v) => v.parts(sources.totaux[seule.famille]).length > 0).map((v) => v.id) : null,
    comparaison: avecComparaison,
    enAttente,
    nonLues,
    journees,
    phrases: cochees.map((m) => ({ id: m.id, libelle: m.libelle, phrase: m.phrase })),
    choix: ventilation ? [] : lues.filter((m) => m.choix).map((m) => choixDe(m, sources.totaux[m.famille], graphique)),
    vide: !cochees.length,
  };
}

// Le tableau des valeurs exactes de ce qui est tracé (D8) : une ligne par
// tranche, puis la période entière. Avec une comparaison : la valeur d'avant
// et l'écart, en valeur et en pourcentage, sur la ligne de la période.
//   → { colonnes: [{ id, libelle, unite, nature, ... }], lignes: [{ tranche,
//       valeurs, avant }], periode: { valeurs, avant, ecarts }, arrondis }
export function tableauDe(composition, tranches) {
  const { series } = composition;
  const lignes = tranches.map((t, i) => ({
    tranche: t,
    valeurs: series.map((s) => s.valeurs[i] ?? null),
    avant: series.map((s) => (s.comparaison ? s.comparaison[i] ?? null : null)),
  }));
  return {
    colonnes: series.map((s) => ({ id: s.id, libelle: s.libelle, unite: s.unite, nature: s.nature, brut: s.brut, donnee: s.donnee, rang: s.rang })),
    lignes,
    periode: {
      valeurs: series.map((s) => s.total),
      avant: series.map((s) => s.totalComparaison),
      ecarts: series.map((s) => s.ecartTotal),
    },
    arrondis: series.filter((s) => estNombre(s.arrondi) && s.arrondi !== 0).map((s) => ({ id: s.id, libelle: s.libelle, unite: s.unite, ecart: s.arrondi })),
    avecComparaison: series.some((s) => s.comparaison) || series.some((s) => s.totalComparaison != null),
  };
}
