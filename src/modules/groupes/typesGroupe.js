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

// Un menu est un palier de prix, numéroté de 1 à 12 par type (migration
// 20261014). Le n°0 est la carte des compléments du type : apéritif du vin
// d'honneur, stations, gâteau, mignardises, communs à tous ses menus.
// NUMEROS_MENU sert de proposition tant qu'aucun menu n'est composé.
export const NUMEROS_MENU = [1, 2, 3, 4, 5];
export const NUMERO_MAX = 12;
export const NUMERO_COMPLEMENTS = 0;

const TYPE_PAR_ID = TYPES_GROUPE.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});

export function metaType(id) {
  const nom = String(id || 'Groupe');
  return TYPE_PAR_ID[id] || { id, label: nom, moyen: nom, court: nom.slice(0, 2).toUpperCase() };
}

// Le menu d'un groupe dans une phrase qui nomme déjà le client (tableau de
// bord) : « menu 1 » pour un simple groupe, « Mariage, menu 2 » sinon ; sans
// menu arrêté, le type seul (rien pour un simple groupe).
export function libelleMenuGroupe(typeId, numero) {
  const menu = numero ? `menu ${numero}` : '';
  if (!typeId || typeId === 'groupe') return menu;
  const t = metaType(typeId);
  return menu ? `${t.label}, ${menu}` : t.label;
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

// Réglages de la maison (Réglages > Groupes, reglages_modules 'groupes') :
// libellés des états, étape « lu » éteinte ou non, types proposés, délai
// d'alerte. Posés par useReglagesGroupes à chaque rendu qui les lit ; sans
// réglage, les valeurs d'origine. Les codes restent ceux des CHECK de la base.
let reglageMaison = { delai: 14, libelles: {}, luActif: true, typesActifs: null };
export function reglerGroupes(r) {
  reglageMaison = {
    delai: Number.isInteger(r?.delai_alerte_jours) ? r.delai_alerte_jours : 14,
    libelles: Object.fromEntries(STATUTS.map((s) => [s, r?.statuts?.[s]?.libelle || null]).filter(([, l]) => l)),
    luActif: r?.statuts?.lu?.actif !== false,
    typesActifs: Array.isArray(r?.types_actifs) ? r.types_actifs : null,
  };
}

export function metaStatut(statut) {
  const meta = STATUT_META[statut] || STATUT_META.a_lire;
  const libelle = reglageMaison.libelles[STATUT_META[statut] ? statut : 'a_lire'];
  return libelle ? { ...meta, label: libelle, detail: libelle } : meta;
}

// Les états proposés : « lu » sort du parcours si la maison l'a éteint (un
// groupe déjà « lu » garde son état et le montre).
export const statutsActifs = (courant) => STATUTS.filter((s) => s !== 'lu' || reglageMaison.luActif || s === courant);

// Les types proposés à la saisie, plus le type courant d'un groupe existant.
export const typesProposes = (courant) => TYPES_GROUPE.filter((t) => !reglageMaison.typesActifs || reglageMaison.typesActifs.includes(t.id) || t.id === courant);

// Rang d'urgence : sert à trier et à choisir la couleur d'un jour qui porte
// plusieurs groupes (le plus en retard l'emporte).
const RANG_STATUT = { a_lire: 0, lu: 1, pret: 2 };
export const rangStatut = (statut) => RANG_STATUT[statut] ?? 0;

// ── Sections d'un menu ─────────────────────────────────────────────────────
// Une seule liste ordonnée pour les cinq types : un apéro dînatoire n'utilise
// que les pièces, un mariage que le déroulé classique, et un cocktail suivi
// d'un dîner prend dans les deux. L'ordre est celui du service, c'est lui qui
// range les lignes à l'écran et sur le PDF. Les stations tiennent le vin
// d'honneur avec l'apéritif ; le trou valaisan passe entre les entrées et le
// plat ; le poisson du menu gastronomique avant le plat.
// `pluriel` titre une rubrique dans laquelle on choisit (« Entrées »), `label`
// nomme le service sur un menu imprimé (« Entrée »).
export const SECTIONS_MENU = [
  { id: 'aperitif',       label: 'Apéritif',               pluriel: 'Apéritif' },
  { id: 'stations',       label: 'Stations et animations', pluriel: 'Stations et animations' },
  { id: 'pieces_froides', label: 'Pièces froides',         pluriel: 'Pièces froides' },
  { id: 'pieces_chaudes', label: 'Pièces chaudes',         pluriel: 'Pièces chaudes' },
  { id: 'entree',         label: 'Entrée',                 pluriel: 'Entrées' },
  { id: 'poisson',        label: 'Poisson',                pluriel: 'Poisson' },
  { id: 'trou',           label: 'Trou valaisan',          pluriel: 'Trou valaisan' },
  { id: 'plat',           label: 'Plat',                   pluriel: 'Plats' },
  { id: 'fromage',        label: 'Fromage',                pluriel: 'Fromages' },
  { id: 'dessert',        label: 'Dessert',                pluriel: 'Desserts' },
  { id: 'gateau',         label: 'Gâteau',                 pluriel: 'Gâteau' },
  { id: 'pieces_sucrees', label: 'Pièces sucrées',         pluriel: 'Pièces sucrées' },
  { id: 'mignardises',    label: 'Mignardises',            pluriel: 'Mignardises' },
];

const SECTION_PAR_ID = SECTIONS_MENU.reduce((acc, s, i) => { acc[s.id] = { ...s, rang: i }; return acc; }, {});

export const labelSection = (id) => SECTION_PAR_ID[id]?.label || 'Autre';
export const rangSection = (id) => SECTION_PAR_ID[id]?.rang ?? 99;
export const plurielSection = (id) => SECTION_PAR_ID[id]?.pluriel || labelSection(id);

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
// Le délai de la maison (Réglages > Groupes), 14 jours sans réglage.
export const joursAnticipation = () => reglageMaison.delai;

export function joursAvant(dateISO, aujourdhuiISO) {
  const d = parseLocalDate(dateISO);
  const t = parseLocalDate(aujourdhuiISO);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

export function finFenetreAnticipation(aujourdhuiISO) {
  return isoDate(addDays(parseLocalDate(aujourdhuiISO), joursAnticipation()));
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
