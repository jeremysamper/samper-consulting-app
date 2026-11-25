// ─────────────────────────────────────────────────────────────────────────────
// Reprendre les réglages d'un autre établissement (lot 02 du panel, 25.11.2026)
// : la partie pure. Sans React ni Supabase : la section (SectionReprendre.jsx),
// le registre des réglages (garde) et les tests l'importent.
//
// C'est une copie à un instant : rien n'est lié ensuite. On ne reprend que la
// liste blanche ci-dessous, clé par clé, jamais une ligne entière :
//   - un bloc de la maison (reglages_maison, objectifs_maison) se reprend
//     entier sous sa forme lisible, comme l'écrit sa section d'origine, sauf
//     `borne_seulement` (propre aux bornes d'ici) et, dans les objectifs, une
//     valeur nulle là-bas (l'objectif d'ici reste) ;
//   - un module (reglages_modules) ne reprend que les clés présentes dans la
//     config de la source : une clé absente là-bas garde la valeur d'ici.
//
// Sens des imports : ce fichier n'importe pas le registre (le registre
// l'importe pour sa garde) ; il ne porte que des ids de section.
// ─────────────────────────────────────────────────────────────────────────────

import { normaliserFermetures, normaliserObjectifs, normaliserPointage } from '../../../utils/reglagesMaison.js';
import { lireReglagesModule } from '../../../utils/reglagesModules.js';

const NORMALISEURS = { fermetures: normaliserFermetures, pointage: normaliserPointage, objectifs: normaliserObjectifs };

// `champs` : la clé en base, sa clé lisible (blocs de la maison), son libellé
// et la façon de montrer sa valeur (formatReprise.js).
export const REPRENABLES = [
  {
    section: 'horaires_fermetures', table: 'reglages_maison', bloc: 'fermetures',
    champs: [
      { cle: 'jours_fermes', lisible: 'joursFermes', libelle: 'Jours de fermeture', format: 'jours' },
      { cle: 'services_fermes', lisible: 'servicesFermes', libelle: 'Services fermés', format: 'servicesFermes' },
      { cle: 'periodes', lisible: 'periodes', libelle: 'Périodes de fermeture', format: 'periodes' },
    ],
  },
  {
    section: 'planning_pointage', table: 'reglages_maison', bloc: 'pointage',
    champs: [
      { cle: 'arrondi_min', lisible: 'arrondiMin', libelle: 'Arrondi', format: 'arrondi' },
      { cle: 'avance', lisible: 'avance', libelle: 'Arrivée en avance', format: 'avance' },
      { cle: 'cloture_auto_h', lisible: 'clotureAutoH', libelle: 'Clore un pointage oublié après', format: 'cloture' },
    ],
  },
  {
    section: 'objectifs', table: 'objectifs_maison', bloc: 'objectifs',
    champs: [
      { cle: 'matiere_pct', lisible: 'matierePct', libelle: 'Coût matière visé', format: 'pct' },
      { cle: 'personnel_pct', lisible: 'personnelPct', libelle: 'Coût du personnel visé', format: 'pct' },
      { cle: 'ca_mensuel_ht', lisible: 'caMensuelHt', libelle: "Chiffre d'affaires visé", format: 'chf' },
    ],
  },
  {
    section: 'pertes', table: 'reglages_modules', module: 'pertes',
    champs: [
      { cle: 'motifs', libelle: 'Motifs de perte', format: 'textes' },
      { cle: 'valideurs', libelle: 'Qui valide une perte', format: 'roles' },
    ],
  },
  {
    section: 'groupes', table: 'reglages_modules', module: 'groupes',
    champs: [
      { cle: 'delai_alerte_jours', libelle: "Délai d'alerte", format: 'jours_nombre' },
      { cle: 'statuts', libelle: 'États de préparation', format: 'statutsGroupe' },
      { cle: 'types_actifs', libelle: 'Types de groupe proposés', format: 'typesGroupe' },
    ],
  },
  {
    section: 'fiches_salle', table: 'reglages_modules', module: 'fiches_salle',
    champs: [
      { cle: 'valideurs', libelle: 'Qui valide une fiche', format: 'roles' },
      { cle: 'brouillons_visibles_salle', libelle: 'Montrer les brouillons à la salle', format: 'ouiNon' },
      { cle: 'champs', libelle: 'Ce que la salle voit', format: 'champsFiche' },
    ],
  },
  {
    section: 'kds', table: 'reglages_modules', module: 'kds',
    champs: [
      { cle: 'son', libelle: 'Son', format: 'ouiNon' },
      { cle: 'attention_minutes', libelle: 'Bon en attente depuis', format: 'minutes' },
      { cle: 'retard_minutes', libelle: 'Bon en retard depuis', format: 'minutes' },
    ],
  },
  {
    section: 'demandes', table: 'reglages_modules', module: 'demandes',
    champs: [{ cle: 'categories', libelle: 'Demandes courantes', format: 'categoriesDemande' }],
  },
  {
    section: 'journal', table: 'reglages_modules', module: 'journal',
    champs: [
      { cle: 'vue', libelle: "Vue d'office", format: 'vueJournal' },
      { cle: 'export', libelle: "Format de l'export", format: 'exportJournal' },
    ],
  },
  {
    section: 'statistiques', table: 'reglages_modules', module: 'statistiques',
    champs: [{ cle: 'vue_defaut', libelle: "Vue d'office", format: 'vueStatistiques' }],
  },
];

// Sections de reglages_modules qui ne se reprennent pas : leurs listes
// nomment des choses d'ici (postes des modèles de mise en place, unités des
// produits, catégories de chambres, carte à prix du room service).
export const NON_REPRISES = [
  { section: 'mep', module: 'mep' },
  { section: 'catalogue', module: 'catalogue' },
  { section: 'etages', module: 'etages' },
  { section: 'repas', module: 'repas' },
];

// Les établissements d'où reprendre : ceux du profil, sauf l'établissement
// affiché. Vide sans rôle, avec moins de deux établissements, ou quand
// l'établissement affiché n'est pas dans le profil.
export function idsSources(user, etabCourantId) {
  if (!user || !user.role || !etabCourantId) return [];
  const ids = Array.isArray(user.etablissementIds) ? [...new Set(user.etablissementIds.filter(Boolean))] : [];
  if (ids.length < 2 || !ids.includes(etabCourantId)) return [];
  return ids.filter((id) => id !== etabCourantId);
}

// Les mêmes, avec leur nom ; un id sans établissement connu n'est pas proposé.
export function maisonsSources(user, etablissements, etabCourantId) {
  const liste = Array.isArray(etablissements) ? etablissements : [];
  return idsSources(user, etabCourantId)
    .map((id) => {
      const e = liste.find((x) => x?.id === id);
      return e && typeof e.nom === 'string' && e.nom.trim() ? { id, nom: e.nom.trim() } : null;
    })
    .filter(Boolean);
}

const estObjet = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const memes = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Le bloc brut d'une entrée dans une lecture de lectureReprise.js.
export function brutDe(entree, lecture) {
  if (!lecture || !lecture.ok) return null;
  if (entree.module) return lecture.modules?.[entree.module] ?? null;
  return lecture[entree.bloc] ?? null;
}

// Les champs d'un bloc de la maison que la source règle : pour les
// objectifs, une valeur nulle là-bas ne compte pas ; ailleurs, un bloc dont
// toutes les valeurs valent le défaut de l'app n'est pas réglé.
function champsReglesMaison(entree, lisibleSource) {
  if (entree.bloc === 'objectifs') return entree.champs.filter((c) => lisibleSource[c.lisible] != null);
  const defaut = NORMALISEURS[entree.bloc](null);
  const regle = entree.champs.some((c) => !memes(lisibleSource[c.lisible], defaut[c.lisible]));
  return regle ? entree.champs : [];
}

// Les champs d'un module que la source règle : les clés présentes dans sa
// config.
function champsReglesModule(entree, brutSource) {
  if (!estObjet(brutSource)) return [];
  return entree.champs.filter((c) => Object.prototype.hasOwnProperty.call(brutSource, c.cle));
}

// État d'une entrée : 'identique', 'different' ou 'non_regle_la_bas', avec
// les valeurs qui changent (lisibles, montrées par formatReprise.js).
export function comparer(entree, brutSource, brutCible) {
  if (entree.module) {
    const champs = champsReglesModule(entree, brutSource);
    if (!champs.length) return { etat: 'non_regle_la_bas', ecarts: [] };
    const la = lireReglagesModule(entree.module, brutSource);
    const ici = lireReglagesModule(entree.module, brutCible);
    const ecarts = champs
      .filter((c) => !memes(la[c.cle], ici[c.cle]))
      .map((c) => ({ cle: c.cle, libelle: c.libelle, format: c.format, ici: ici[c.cle], labas: la[c.cle] }));
    return { etat: ecarts.length ? 'different' : 'identique', ecarts };
  }
  const normaliser = NORMALISEURS[entree.bloc];
  const la = normaliser(brutSource);
  const ici = normaliser(brutCible);
  const champs = champsReglesMaison(entree, la);
  if (!champs.length) return { etat: 'non_regle_la_bas', ecarts: [] };
  const ecarts = champs
    .filter((c) => !memes(la[c.lisible], ici[c.lisible]))
    .map((c) => ({ cle: c.cle, libelle: c.libelle, format: c.format, ici: ici[c.lisible], labas: la[c.lisible] }));
  return { etat: ecarts.length ? 'different' : 'identique', ecarts };
}

// Ce qui s'écrit, ou null quand la source ne règle rien.
//   bloc de la maison : le bloc lisible entier d'ici, les champs réglés là-bas
//     posés dessus (borneSeulement d'ici gardé), pour ecrireBlocMaison ;
//   module : l'objet `changes` des seules clés présentes là-bas, valeurs
//     brutes de la source, pour ecrireConfigModule.
export function valeurAEcrire(entree, brutSource, brutCible) {
  if (entree.module) {
    const champs = champsReglesModule(entree, brutSource);
    if (!champs.length) return null;
    const changes = {};
    champs.forEach((c) => { changes[c.cle] = brutSource[c.cle]; });
    return changes;
  }
  const normaliser = NORMALISEURS[entree.bloc];
  const la = normaliser(brutSource);
  const champs = champsReglesMaison(entree, la);
  if (!champs.length) return null;
  const valeur = { ...normaliser(brutCible) };
  champs.forEach((c) => { valeur[c.lisible] = la[c.lisible]; });
  return valeur;
}

// L'aperçu : une ligne par entrée proposée. Une lecture en échec, d'un côté
// ou de l'autre, ne rend aucune ligne : jamais « Non réglé là-bas » à la
// place d'un échec, et rien à cocher.
export function apercu(entrees, lectureSource, lectureCible) {
  if (!lectureSource?.ok || !lectureCible?.ok) return { echec: true, lignes: [] };
  return {
    echec: false,
    lignes: entrees.map((entree) => {
      const r = comparer(entree, brutDe(entree, lectureSource), brutDe(entree, lectureCible));
      return { entree, ...r, cochable: r.etat === 'different' };
    }),
  };
}
