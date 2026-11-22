// ─────────────────────────────────────────────────────────────────────────────
// Réglages des modules (table reglages_modules, lot 2 du plan 15) : une ligne
// par établissement et par module, un bloc jsonb `config`. Lecture par toute
// l'équipe de l'établissement, écriture par la direction de la maison
// (consultant, patron, resp_cuisine), comme la RLS de la table.
//
// Une ligne ou une clé absente vaut le comportement d'avant le réglage : les
// défauts ci-dessous sont ceux que les modules avaient écrits en dur. Une clé
// mal formée est lue comme absente (la base refuse de toute façon de
// l'écrire : reglages_modules_config_valide).
//
// Fichier pur, sans React ni Supabase : le registre des réglages et les tests
// le lisent.
// ─────────────────────────────────────────────────────────────────────────────

// Lot 6b : trois modules de la branche Hôtel (étages, demandes, repas),
// migration 20261122_lot6b_reglages_hotel.
// Lot 5 : Journal et Statistiques, migration 20261122_lot5_bureau.
export const MODULES_REGLES = ['pertes', 'groupes', 'mep', 'fiches_salle', 'kds', 'catalogue', 'etages', 'demandes', 'repas', 'journal', 'statistiques'];

// ── Journal et Statistiques (lot 5) ──────────────────────────────────────────
// Journal : vue regroupée (les lignes identiques qui se suivent en une seule)
// ou ligne par ligne, et format de l'export. Statistiques : la réponse toute
// faite qui s'ouvre d'office pour qui n'a pas de vue à lui (id d'une question
// de statistiques/questionsStatistiques.js ; inconnue = la vue de l'app).
export const VUES_JOURNAL = [
  { id: 'regroupee', label: 'Regroupée' },
  { id: 'detail', label: 'Ligne par ligne' },
];
export const FORMATS_EXPORT_JOURNAL = [
  { id: 'csv', label: 'CSV' },
  { id: 'xlsx', label: 'Excel' },
];
const IDENTIFIANT = /^[a-z][a-z0-9_]{0,39}$/;

// ── Branche Hôtel (lot 6b) ───────────────────────────────────────────────────
// Identifiants recopiés de hebergement/hotelData.js (ce fichier reste pur, sans
// React) : mêmes listes que les contraintes de la base.
export const POLES_IDS = ['reception', 'etages', 'technique', 'cuisine', 'restaurant', 'spa', 'direction'];
export const PRIORITES_IDS = ['basse', 'normale', 'haute', 'urgente'];
export const LINGE_IDS = ['draps', 'serviettes', 'peignoirs', 'tapis', 'autre'];
export const REPAS_IDS = ['petit_dejeuner', 'dejeuner', 'diner'];

// Temps de ménage d'avant le réglage : une demi-heure pour un départ, un quart
// d'heure pour une recouche (chambre occupée qui reste).
export const TEMPS_MENAGE_DEFAUT = { depart: 30, recouche: 15 };

// Demandes courantes d'avant le réglage, proposées en tête du formulaire : un
// toucher remplit la demande, son pôle, sa priorité et son échéance.
export const CATEGORIES_DEMANDE_DEFAUT = [
  { libelle: 'Oreillers en plus', pole: 'etages', priorite: 'normale', delai_minutes: 30 },
  { libelle: 'Serviettes en plus', pole: 'etages', priorite: 'normale', delai_minutes: 30 },
  { libelle: 'Lit bébé', pole: 'etages', priorite: 'haute', delai_minutes: 60 },
  { libelle: 'Fuite d\'eau', pole: 'technique', priorite: 'urgente', delai_minutes: 30 },
  { libelle: 'Chauffage ou climatisation', pole: 'technique', priorite: 'haute', delai_minutes: 60 },
  { libelle: 'Télévision ou wifi', pole: 'technique', priorite: 'normale', delai_minutes: 120 },
  { libelle: 'Taxi à commander', pole: 'reception', priorite: 'haute', delai_minutes: 30 },
  { libelle: 'Départ tardif', pole: 'reception', priorite: 'normale', delai_minutes: 120 },
  { libelle: 'Repas sans allergène', pole: 'cuisine', priorite: 'haute', delai_minutes: 180 },
];

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const heure = (v) => (typeof v === 'string' && HEURE.test(v) ? v : null);
const plage = (v) => {
  if (!v || typeof v !== 'object') return null;
  const debut = heure(v.debut);
  const fin = heure(v.fin);
  return debut && fin && debut < fin ? { debut, fin } : null;
};
const montant = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : null);

function lireEtages(c) {
  const defaut = c.temps_defaut && typeof c.temps_defaut === 'object' ? c.temps_defaut : {};
  const temps = {
    depart: entier(defaut.depart, 5, 240) ?? TEMPS_MENAGE_DEFAUT.depart,
    recouche: entier(defaut.recouche, 5, 240) ?? TEMPS_MENAGE_DEFAUT.recouche,
  };
  const vus = new Set();
  const types = Array.isArray(c.types)
    ? c.types.map((t) => {
      const categorie = texte(t?.categorie, 60);
      if (!categorie || vus.has(categorie.toLowerCase())) return null;
      vus.add(categorie.toLowerCase());
      const linge = {};
      if (t.linge && typeof t.linge === 'object') {
        LINGE_IDS.forEach((id) => { const n = entier(t.linge[id], 0, 50); if (n) linge[id] = n; });
      }
      return {
        categorie,
        depart: entier(t.depart, 5, 240) ?? temps.depart,
        recouche: entier(t.recouche, 5, 240) ?? temps.recouche,
        linge,
      };
    }).filter(Boolean).slice(0, 20)
    : [];
  return { temps_defaut: temps, types };
}

function lireDemandes(c) {
  if (!Array.isArray(c.categories)) return { categories: CATEGORIES_DEMANDE_DEFAUT, categoriesReglees: false };
  const vus = new Set();
  const categories = c.categories.map((x) => {
    const libelle = texte(x?.libelle, 60);
    if (!libelle || vus.has(libelle.toLowerCase()) || !POLES_IDS.includes(x?.pole)) return null;
    vus.add(libelle.toLowerCase());
    return {
      libelle,
      pole: x.pole,
      priorite: PRIORITES_IDS.includes(x.priorite) ? x.priorite : 'normale',
      delai_minutes: entier(x.delai_minutes, 5, 10080),
    };
  }).filter(Boolean).slice(0, 40);
  return { categories, categoriesReglees: true };
}

function lireRepas(c) {
  const horaires = {};
  REPAS_IDS.forEach((id) => { horaires[id] = plage(c.horaires && typeof c.horaires === 'object' ? c.horaires[id] : null); });
  const rs = c.room_service && typeof c.room_service === 'object' ? c.room_service : {};
  const vus = new Set();
  const carte = Array.isArray(c.carte)
    ? c.carte.map((a) => {
      const libelle = texte(a?.libelle, 80);
      const prix = montant(a?.prix, 1000);
      if (!libelle || prix == null || vus.has(libelle.toLowerCase())) return null;
      vus.add(libelle.toLowerCase());
      return { libelle, prix };
    }).filter(Boolean).slice(0, 80)
    : [];
  return {
    horaires,
    room_service: { heures: plage(rs.heures), frais: montant(rs.frais, 100) ?? 0 },
    carte,
  };
}

// Temps de ménage d'une chambre selon sa catégorie et ce qui s'y passe.
export function tempsMenage(reglagesEtages, categorie, nature) {
  const t = (reglagesEtages?.types || []).find((x) => x.categorie.toLowerCase() === String(categorie || '').toLowerCase());
  const base = t || reglagesEtages?.temps_defaut || TEMPS_MENAGE_DEFAUT;
  return nature === 'recouche' ? base.recouche : base.depart;
}

// Linge d'un départ pour une catégorie de chambre : { draps: 2, ... } ou {}.
export function lingeDepart(reglagesEtages, categorie) {
  const t = (reglagesEtages?.types || []).find((x) => x.categorie.toLowerCase() === String(categorie || '').toLowerCase());
  return t ? t.linge : {};
}

// Qui écrit ces réglages : même liste que les policies de reglages_modules,
// mep_modeles, commande_cibles et que le déclencheur des colonnes de réglage
// de sops et fournisseurs.
export const ROLES_DIRECTION_MODULES = ['consultant', 'patron', 'resp_cuisine'];
export const estDirectionModules = (role) => ROLES_DIRECTION_MODULES.includes(role);

// Les rôles proposés comme « qui valide » (une perte, une fiche salle).
export const ROLES_VALIDEURS = [
  { id: 'consultant', label: 'Consultant' },
  { id: 'patron', label: 'Patron' },
  { id: 'resp_cuisine', label: 'Responsable cuisine' },
  { id: 'cuisinier', label: 'Cuisinier' },
  { id: 'serveur', label: 'Serveur' },
  { id: 'hote', label: 'Hôte' },
];

// Motifs de perte d'avant le réglage (Pertes.jsx).
export const MOTIFS_PERTE_DEFAUT = ['DLC dépassée', 'Surproduction', 'Erreur de préparation', 'Erreur de commande', 'Retour client', 'Casse', 'Autre'];

export const TYPES_GROUPE_IDS = ['mariage', 'anniversaire', 'seminaire', 'groupe', 'apero_dinatoire'];
export const STATUTS_GROUPE_IDS = ['a_lire', 'lu', 'pret'];

export const KDS_ATTENTION_DEFAUT = 7;
export const KDS_RETARD_DEFAUT = 12;
export const DELAI_ALERTE_GROUPES_DEFAUT = 14;

export const BASES_UNITE = [
  { id: 'g', label: 'grammes' },
  { id: 'ml', label: 'millilitres' },
  { id: 'pcs', label: 'pièces' },
];

const texte = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);

// Liste de textes : chaînes non vides, distinctes (casse ignorée), bornées.
// null si la valeur n'est pas une liste.
export function listeTextes(v, maxItems, maxLen) {
  if (!Array.isArray(v)) return null;
  const vus = new Set();
  const out = [];
  v.forEach((x) => {
    const t = texte(x, maxLen);
    if (!t || vus.has(t.toLowerCase()) || out.length >= maxItems) return;
    vus.add(t.toLowerCase());
    out.push(t);
  });
  return out;
}

const entier = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const booleen = (v) => (typeof v === 'boolean' ? v : null);
const rolesValides = (v) => {
  const l = listeTextes(v, 20, 40);
  return l ? l.filter((r) => /^[a-z_]+$/.test(r)) : null;
};

// Le bloc lisible d'un module : toutes les clés présentes, défauts compris.
// `valideurs: null` = pas de réglage, le module garde sa règle d'avant.
export function lireReglagesModule(module, config) {
  const c = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  switch (module) {
    case 'pertes': {
      const motifs = listeTextes(c.motifs, 30, 60);
      return {
        motifs: motifs && motifs.length ? motifs : MOTIFS_PERTE_DEFAUT,
        motifsRegles: Boolean(motifs && motifs.length),
        valideurs: rolesValides(c.valideurs),
      };
    }
    case 'groupes': {
      const statuts = {};
      STATUTS_GROUPE_IDS.forEach((id) => {
        const s = c.statuts && typeof c.statuts === 'object' ? c.statuts[id] : null;
        statuts[id] = {
          libelle: s ? texte(s.libelle, 40) : null,
          // Seule l'étape « lu » peut s'éteindre : « à lire » et « prêt » sont
          // le début et la fin du parcours.
          actif: id === 'lu' ? booleen(s?.actif) ?? true : true,
        };
      });
      const types = listeTextes(c.types_actifs, 5, 40);
      return {
        delai_alerte_jours: entier(c.delai_alerte_jours, 1, 60) ?? DELAI_ALERTE_GROUPES_DEFAUT,
        statuts,
        types_actifs: types && types.length ? types.filter((t) => TYPES_GROUPE_IDS.includes(t)) : TYPES_GROUPE_IDS,
      };
    }
    case 'mep':
      return { postes: listeTextes(c.postes, 30, 40) || [] };
    case 'fiches_salle': {
      const champs = c.champs && typeof c.champs === 'object' ? c.champs : {};
      return {
        valideurs: rolesValides(c.valideurs),
        brouillons_visibles_salle: booleen(c.brouillons_visibles_salle) ?? false,
        champs: {
          temps: booleen(champs.temps) ?? true,
          accords: booleen(champs.accords) ?? true,
          allergenes: booleen(champs.allergenes) ?? true,
        },
      };
    }
    case 'kds': {
      const attention = entier(c.attention_minutes, 1, 119) ?? KDS_ATTENTION_DEFAUT;
      const retard = entier(c.retard_minutes, 2, 120);
      return {
        son: booleen(c.son) ?? false,
        attention_minutes: attention,
        retard_minutes: retard && retard > attention ? retard : Math.max(KDS_RETARD_DEFAUT, attention + 1),
      };
    }
    case 'catalogue': {
      const unites = Array.isArray(c.unites)
        ? c.unites
          .map((u) => ({ code: texte(u?.code, 20), base: u?.base, facteur: Number(u?.facteur) }))
          .filter((u) => u.code && ['g', 'ml', 'pcs'].includes(u.base) && Number.isFinite(u.facteur) && u.facteur > 0)
          .slice(0, 40)
        : [];
      return { categories: listeTextes(c.categories, 40, 60) || [], unites };
    }
    case 'etages':
      return lireEtages(c);
    case 'demandes':
      return lireDemandes(c);
    case 'repas':
      return lireRepas(c);
    case 'journal':
      return {
        vue: VUES_JOURNAL.some((v) => v.id === c.vue) ? c.vue : 'regroupee',
        export: FORMATS_EXPORT_JOURNAL.some((f) => f.id === c.export) ? c.export : 'csv',
      };
    case 'statistiques':
      return { vue_defaut: typeof c.vue_defaut === 'string' && IDENTIFIANT.test(c.vue_defaut) ? c.vue_defaut : null };
    default:
      return {};
  }
}

// Le bloc à écrire : la config d'avant, avec les clés changées. Les clés
// inconnues de la ligne sont gardées (un lot suivant peut en ajouter).
export function fusionnerConfig(avant, changes) {
  const base = avant && typeof avant === 'object' && !Array.isArray(avant) ? avant : {};
  return { ...base, ...changes };
}

// Le rôle peut-il valider ? Règle du réglage s'il existe, sinon celle d'avant
// (passée par l'appelant : canManageModule du module).
export function peutValider(valideurs, role, regleAvant) {
  if (Array.isArray(valideurs)) return valideurs.includes(role);
  return Boolean(regleAvant);
}
