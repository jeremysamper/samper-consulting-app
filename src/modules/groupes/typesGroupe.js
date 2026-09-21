// ═══════════════════════════════════════════════════════════════════════════
// Référentiel du module Groupes : types de groupe, états de préparation,
// sections d'un menu, fenêtre d'anticipation.
//
// Source unique pour le calendrier, le formulaire, la fiche, l'éditeur de menus
// et les exports PDF : sans ça, « apéro dînatoire » finit écrit de trois façons
// et la couleur d'un état diverge entre la case et la pastille.
//
// Les ids sont ceux des contraintes CHECK de la migration 20260920 : en ajouter
// un ici sans toucher à la base ferait échouer l'enregistrement.
// ═══════════════════════════════════════════════════════════════════════════

import { addDays, isoDate, parseLocalDate } from '../../utils/dateHelpers.js';

// Trois longueurs de libellé, parce qu'une colonne du calendrier fait 140 px sur
// un iPad couché, 105 px debout et moins de 50 px sur un téléphone :
//   label : « Apéro dînatoire »   moyen : « Apéro »   court : « AD »
// Pas d'abréviation en trois lettres pour le format court : dans un calendrier,
// « Mar 4 » se lit « mardi 4 ». Le numéro du menu, lui, n'est jamais tronqué
// (il est rendu à part dans la case).
export const TYPES_GROUPE = [
  { id: 'mariage',         label: 'Mariage',         moyen: 'Mariage',   court: 'M' },
  { id: 'anniversaire',    label: 'Anniversaire',    moyen: 'Anniv.',    court: 'A' },
  { id: 'seminaire',       label: 'Séminaire',       moyen: 'Séminaire', court: 'S' },
  { id: 'groupe',          label: 'Groupe',          moyen: 'Groupe',    court: 'G' },
  { id: 'apero_dinatoire', label: 'Apéro dînatoire', moyen: 'Apéro',     court: 'AD' },
];

export const NUMEROS_MENU = [1, 2, 3, 4, 5];

const TYPE_PAR_ID = TYPES_GROUPE.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});

export function metaType(id) {
  const nom = String(id || 'Groupe');
  return TYPE_PAR_ID[id] || { id, label: nom, moyen: nom, court: nom.slice(0, 2).toUpperCase() };
}

// « Mariage n°4 », ou « Mariage » tant que le menu n'est pas arrêté.
export function libelleGroupe(typeId, numero) {
  const t = metaType(typeId);
  return numero ? `${t.label} n°${numero}` : t.label;
}

// ── États de préparation ───────────────────────────────────────────────────
// Rouge : pas encore lu par la brigade. Orange : lu, pas préparé. Vert : lu et
// préparé. Tokens de thème uniquement, pour que le code couleur tienne en mode
// sombre. `barre` est la teinte saturée (liseré, pastille), `fond`/`texte` le
// couple lisible pour un aplat portant du texte.
export const STATUTS = ['a_lire', 'lu', 'pret'];

export const STATUT_META = {
  a_lire: {
    label: 'À lire',
    detail: 'Pas encore lu par la brigade',
    fond: 'var(--danger-bg)',
    texte: 'var(--danger-text)',
    bordure: 'var(--danger-bd)',
    barre: 'var(--danger-strong)',
  },
  lu: {
    label: 'Lu, à préparer',
    detail: 'Lu, pas encore préparé',
    fond: 'var(--warning-bg)',
    texte: 'var(--warning-text)',
    bordure: 'var(--warning-bd)',
    barre: 'var(--warning-strong)',
  },
  pret: {
    label: 'Prêt',
    detail: 'Lu et préparé',
    fond: 'var(--success-bg)',
    texte: 'var(--success-text)',
    bordure: 'var(--success-bd)',
    barre: 'var(--success-strong)',
  },
};

export function metaStatut(statut) {
  return STATUT_META[statut] || STATUT_META.a_lire;
}

// Rang d'urgence : sert à trier et à choisir la couleur d'un jour qui porte
// plusieurs groupes (le plus en retard l'emporte).
const RANG_STATUT = { a_lire: 0, lu: 1, pret: 2 };
export const rangStatut = (statut) => RANG_STATUT[statut] ?? 0;

// ── Sections d'un menu ─────────────────────────────────────────────────────
// Une seule liste ordonnée pour les cinq types : un apéro dînatoire n'utilise
// que les pièces, un mariage que le déroulé classique, et un cocktail suivi
// d'un dîner prend dans les deux. L'ordre est celui du service, c'est lui qui
// range les lignes à l'écran et sur le PDF.
export const SECTIONS_MENU = [
  { id: 'aperitif',       label: 'Apéritif' },
  { id: 'pieces_froides', label: 'Pièces froides' },
  { id: 'pieces_chaudes', label: 'Pièces chaudes' },
  { id: 'entree',         label: 'Entrée' },
  { id: 'plat',           label: 'Plat' },
  { id: 'fromage',        label: 'Fromage' },
  { id: 'dessert',        label: 'Dessert' },
  { id: 'pieces_sucrees', label: 'Pièces sucrées' },
  { id: 'mignardises',    label: 'Mignardises' },
];

const SECTION_PAR_ID = SECTIONS_MENU.reduce((acc, s, i) => { acc[s.id] = { ...s, rang: i }; return acc; }, {});

export const labelSection = (id) => SECTION_PAR_ID[id]?.label || 'Autre';

// Section proposée d'office à l'ajout d'une ligne, selon le type de groupe.
export function sectionParDefaut(typeId) {
  return typeId === 'apero_dinatoire' ? 'pieces_froides' : 'entree';
}

// Lignes d'un menu regroupées par section, dans l'ordre du service.
// Retourne [{ id, label, lignes: [...] }] sans les sections vides.
export function lignesParSection(lignes) {
  const map = new Map();
  (Array.isArray(lignes) ? lignes : []).forEach((l) => {
    if (!l) return;
    const sid = SECTION_PAR_ID[l.section] ? l.section : 'autre';
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid).push(l);
  });
  return [...map.entries()]
    .sort((a, b) => (SECTION_PAR_ID[a[0]]?.rang ?? 99) - (SECTION_PAR_ID[b[0]]?.rang ?? 99))
    .map(([id, ls]) => ({ id, label: labelSection(id), lignes: ls }));
}

// ── Anticipation ───────────────────────────────────────────────────────────
// Deux semaines : le délai qu'il faut pour commander les volumes d'un groupe,
// lancer la grosse production et la congeler. Un groupe entre dans l'alerte à
// J-14 et y reste jusqu'au jour J.
export const JOURS_ANTICIPATION = 14;

export function joursAvant(dateISO, aujourdhuiISO) {
  const d = parseLocalDate(dateISO);
  const t = parseLocalDate(aujourdhuiISO);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

export function finFenetreAnticipation(aujourdhuiISO) {
  return isoDate(addDays(parseLocalDate(aujourdhuiISO), JOURS_ANTICIPATION));
}

// Groupes à anticiper : ceux de la fenêtre J → J+14, du plus proche au plus
// lointain, à état égal le moins avancé d'abord.
export function groupesAAnticiper(groupes, aujourdhuiISO) {
  const fin = finFenetreAnticipation(aujourdhuiISO);
  return (groupes || [])
    .filter((g) => !g.annule && g.dateEvenement >= aujourdhuiISO && g.dateEvenement <= fin)
    .sort((a, b) =>
      a.dateEvenement.localeCompare(b.dateEvenement)
      || rangStatut(a.statut) - rangStatut(b.statut));
}

// « Aujourd'hui », « Demain », « Dans 9 jours ».
export function libelleEcheance(jours) {
  if (jours <= 0) return "Aujourd'hui";
  if (jours === 1) return 'Demain';
  return `Dans ${jours} jours`;
}
