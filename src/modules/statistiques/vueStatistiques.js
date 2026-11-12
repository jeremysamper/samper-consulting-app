// ─────────────────────────────────────────────────────────────────────────────
// La vue du module Statistiques, sans React ni DOM (testé par node --test,
// vueStatistiques.test.mjs) : mesures cochées, période, pas, ventilation,
// comparaison, un à quatre graphiques.
//
// Période, pas et comparaison sont communs aux graphiques (D7) ; chacun a ses
// cases, sa ventilation et son type. La vue se range telle quelle dans
// user_settings (clé statistiques_vue) : du JSON, sans fonction ni date.
//
// Lisibilité (D6) : deux unités au plus par graphique (axe gauche, axe droit),
// six séries au plus. Au-delà, la case est refusée et le module propose un
// graphique de plus.
// ─────────────────────────────────────────────────────────────────────────────

import { ajouterJours, periodeAnnee, periodeMois, periodeTrimestre } from '../comptabilite/periodesCompta.js';
import { bornesComparaison } from '../previsions/rapport/periodesRapport.js';
import { pasPossibles } from './agregation.js';

export const CLE_VUE = 'statistiques_vue';
export const CLE_VUES = 'statistiques_vues';
export const MAX_VUES = 20;
export const MAX_NOM_VUE = 60;
export const MAX_GRAPHIQUES = 4;
export const MAX_SERIES = 6;
export const MAX_UNITES = 2;

export const PERIODES = [
  { id: 'jour', label: 'Aujourd\'hui' },
  { id: '7j', label: '7 jours' },
  { id: '30j', label: '30 jours' },
  { id: 'mois', label: 'Ce mois' },
  { id: 'trimestre', label: 'Ce trimestre' },
  { id: 'annee', label: 'Cette année' },
  { id: 'libre', label: 'Dates choisies' },
];

export const COMPARAISONS = [
  { id: '', label: 'Sans comparaison' },
  { id: 'precedente', label: 'Période précédente' },
  { id: 'n1', label: 'Un an plus tôt' },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Bornes d'une période (jours ISO de Zurich ; aujourd'hui vient de l'appelant).
// 7 jours et 30 jours finissent aujourd'hui ; mois, trimestre et année sont
// civils, comme dans la Comptabilité.
export function bornesDe(periode, aujourdhui) {
  const id = periode?.id || '30j';
  if (id === 'jour') return { debut: aujourdhui, fin: aujourdhui };
  if (id === '7j') return { debut: ajouterJours(aujourdhui, -6), fin: aujourdhui };
  if (id === 'mois') { const p = periodeMois(aujourdhui); return { debut: p.debut, fin: p.fin }; }
  if (id === 'trimestre') { const p = periodeTrimestre(aujourdhui); return { debut: p.debut, fin: p.fin }; }
  if (id === 'annee') { const p = periodeAnnee(aujourdhui); return { debut: p.debut, fin: p.fin }; }
  if (id === 'libre') {
    const a = ISO.test(String(periode.debut || '')) ? periode.debut : ajouterJours(aujourdhui, -29);
    const b = ISO.test(String(periode.fin || '')) ? periode.fin : aujourdhui;
    return a <= b ? { debut: a, fin: b } : { debut: b, fin: a };
  }
  return { debut: ajouterJours(aujourdhui, -29), fin: aujourdhui };
}

// Bornes de la comparaison, ou null sans comparaison.
export function bornesDeComparaison(bornes, mode) {
  if (mode !== 'precedente' && mode !== 'n1') return null;
  return bornesComparaison(bornes, mode);
}

const graphiqueVide = () => ({ mesures: [], ventilation: '', type: '', choix: {} });

// Première ouverture (D13) : la première mesure visible, sur 30 jours.
export function vueParDefaut(mesuresVisibles = []) {
  const premiere = mesuresVisibles[0]?.id;
  return {
    periode: { id: '30j' },
    pas: 'jour',
    comparaison: '',
    graphiques: [{ ...graphiqueVide(), mesures: premiere ? [premiere] : [] }],
  };
}

// Unités d'une liste de mesures, dans l'ordre de leur première apparition.
export function unitesDe(mesures) {
  const vues = [];
  (mesures || []).forEach((m) => { if (m && !vues.includes(m.unite)) vues.push(m.unite); });
  return vues;
}

// Peut-on cocher cette mesure dans ce graphique ? → { ok, raison }
//   raison : 'series' (six séries déjà) ou 'unites' (une troisième unité).
export function peutCocher(mesuresCochees, mesure) {
  const liste = mesuresCochees || [];
  if (liste.some((m) => m.id === mesure.id)) return { ok: true, raison: null };
  if (liste.length >= MAX_SERIES) return { ok: false, raison: 'series' };
  const unites = unitesDe(liste);
  if (!unites.includes(mesure.unite) && unites.length >= MAX_UNITES) return { ok: false, raison: 'unites' };
  return { ok: true, raison: null };
}

// Remet une vue lue (réglage enregistré, lien d'entrée) dans les règles : ne
// garde que les mesures visibles aujourd'hui pour la personne (D11), applique
// D6, borne le nombre de graphiques, rend un pas possible pour la période.
// Une vue vide retombe sur la vue par défaut.
export function nettoyerVue(brute, mesuresVisibles, aujourdhui) {
  const parId = new Map((mesuresVisibles || []).map((m) => [m.id, m]));
  const defaut = vueParDefaut(mesuresVisibles);
  if (!brute || typeof brute !== 'object') return defaut;
  const periode = PERIODES.some((p) => p.id === brute.periode?.id)
    ? { id: brute.periode.id, ...(brute.periode.id === 'libre' ? { debut: brute.periode.debut || null, fin: brute.periode.fin || null } : null) }
    : defaut.periode;
  const bornes = bornesDe(periode, aujourdhui);
  const possibles = pasPossibles(bornes.debut, bornes.fin);
  const pas = possibles.includes(brute.pas) ? brute.pas : (possibles.includes('jour') ? 'jour' : possibles[0] || 'mois');
  const comparaison = COMPARAISONS.some((c) => c.id === brute.comparaison) ? brute.comparaison : '';
  const graphiques = (Array.isArray(brute.graphiques) ? brute.graphiques : []).slice(0, MAX_GRAPHIQUES).map((g) => {
    const gardees = [];
    (Array.isArray(g?.mesures) ? g.mesures : []).forEach((id) => {
      const m = parId.get(id);
      if (m && peutCocher(gardees, m).ok && !gardees.includes(m)) gardees.push(m);
    });
    const seule = gardees.length === 1 ? gardees[0] : null;
    const ventilation = seule && (seule.ventilations || []).some((v) => v.id === g.ventilation) ? g.ventilation : '';
    const type = ['courbe', 'barres', 'empile'].includes(g?.type) ? g.type : '';
    // Choix d'une mesure à choix (zone, produit) : une clé texte par mesure
    // cochée ; une clé qui n'existe plus retombe sur la première option.
    const choix = {};
    gardees.filter((m) => m.choix && typeof g?.choix?.[m.id] === 'string').forEach((m) => { choix[m.id] = g.choix[m.id]; });
    return { mesures: gardees.map((m) => m.id), ventilation, type, choix };
  });
  if (!graphiques.length || graphiques.every((g) => !g.mesures.length)) return { ...defaut, periode, pas, comparaison };
  return { periode, pas, comparaison, graphiques };
}

// Types de graphique valides pour un graphique, le premier étant celui que la
// vue déduit (D5) : courbe pour une mesure dans le temps, barres pour une
// ventilation sur la période, barres empilées pour une ventilation dans le
// temps. La personne peut passer de l'un à l'autre quand deux sont valides.
// Une ventilation d'un taux ou d'un relevé (cumulable faux) ne s'empile pas :
// une courbe par catégorie, ou ses barres sur la période.
export function typesValides({ nbTranches, nbSeries, ventilation, cumulable = true }) {
  if (ventilation && !cumulable) return nbTranches > 1 ? ['courbe', 'barres'] : ['barres'];
  if (ventilation) return nbTranches > 1 ? ['empile', 'barres'] : ['barres'];
  if (nbTranches <= 1) return ['barres'];
  return nbSeries === 1 ? ['courbe', 'barres'] : ['courbe'];
}

export const typeRetenu = (graphique, contexte) => {
  const valides = typesValides(contexte);
  return valides.includes(graphique?.type) ? graphique.type : valides[0];
};

// Vue ouverte par un lien d'entrée (ouvrirStatistiques, D14) : les mesures
// nommées, ou toutes celles d'une famille dans la limite de D6, sur la période
// demandée. null si rien de demandé n'est visible : la vue courante reste.
export function vueDepuisLien(demande, mesuresVisibles, aujourdhui) {
  if (!demande) return null;
  const visibles = mesuresVisibles || [];
  let ids = (Array.isArray(demande.mesures) ? demande.mesures : []).filter((id) => visibles.some((m) => m.id === id));
  if (!ids.length && demande.famille) ids = visibles.filter((m) => m.famille === demande.famille).slice(0, 1).map((m) => m.id);
  if (!ids.length) return null;
  const periode = typeof demande.periode === 'string' ? { id: demande.periode } : demande.periode;
  return nettoyerVue({ periode: periode || { id: '30j' }, pas: demande.pas || 'jour', comparaison: demande.comparaison || '', graphiques: [{ mesures: ids, ventilation: demande.ventilation || '', type: '', choix: demande.choix || {} }] }, visibles, aujourdhui);
}

export const ajouterGraphique = (vue) => (vue.graphiques.length >= MAX_GRAPHIQUES ? vue : { ...vue, graphiques: [...vue.graphiques, graphiqueVide()] });
export const retirerGraphique = (vue, i) => (vue.graphiques.length <= 1 ? vue : { ...vue, graphiques: vue.graphiques.filter((_, k) => k !== i) });
export const majGraphique = (vue, i, maj) => ({ ...vue, graphiques: vue.graphiques.map((g, k) => (k === i ? { ...g, ...maj } : g)) });

// ── Vues enregistrées et nommées (Q4) ──
// Une liste de { id, nom, vue } dans user_settings (clé statistiques_vues),
// vingt au plus. La vue est enregistrée telle quelle ; à l'ouverture, elle
// passe par nettoyerVue : une mesure que la personne ne voit plus disparaît
// (D11). Fonctions pures : l'appelant fournit l'identifiant d'une vue neuve.

const nomPropre = (nom) => String(nom || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOM_VUE);

// Liste lue dans le réglage, débarrassée de ce qui n'a pas la bonne forme.
export function vuesNommeesLues(brute) {
  if (!Array.isArray(brute)) return [];
  return brute
    .filter((v) => v && typeof v === 'object' && typeof v.id === 'string' && nomPropre(v.nom) && v.vue && typeof v.vue === 'object')
    .slice(0, MAX_VUES)
    .map((v) => ({ id: v.id, nom: nomPropre(v.nom), vue: v.vue }));
}

// Enregistre la vue sous un nom. Un nom déjà pris (sans tenir compte des
// majuscules) remplace la vue de ce nom, à sa place ; sinon la vue s'ajoute en
// tête. → { liste, resultat: 'ajoutee' | 'remplacee' | 'pleine' | 'sans_nom' }
export function enregistrerVueNommee(liste, { id, nom, vue }) {
  const propre = nomPropre(nom);
  const actuelles = vuesNommeesLues(liste);
  if (!propre) return { liste: actuelles, resultat: 'sans_nom' };
  const cle = propre.toLocaleLowerCase('fr');
  const rang = actuelles.findIndex((v) => v.nom.toLocaleLowerCase('fr') === cle);
  if (rang >= 0) return { liste: actuelles.map((v, i) => (i === rang ? { ...v, nom: propre, vue } : v)), resultat: 'remplacee' };
  if (actuelles.length >= MAX_VUES) return { liste: actuelles, resultat: 'pleine' };
  return { liste: [{ id, nom: propre, vue }, ...actuelles], resultat: 'ajoutee' };
}

// Renomme une vue ; un nom vide ou déjà pris par une autre vue est refusé.
// → { liste, resultat: 'renommee' | 'sans_nom' | 'pris' | 'absente' }
export function renommerVueNommee(liste, id, nom) {
  const propre = nomPropre(nom);
  const actuelles = vuesNommeesLues(liste);
  if (!actuelles.some((v) => v.id === id)) return { liste: actuelles, resultat: 'absente' };
  if (!propre) return { liste: actuelles, resultat: 'sans_nom' };
  const cle = propre.toLocaleLowerCase('fr');
  if (actuelles.some((v) => v.id !== id && v.nom.toLocaleLowerCase('fr') === cle)) return { liste: actuelles, resultat: 'pris' };
  return { liste: actuelles.map((v) => (v.id === id ? { ...v, nom: propre } : v)), resultat: 'renommee' };
}

export const retirerVueNommee = (liste, id) => vuesNommeesLues(liste).filter((v) => v.id !== id);
