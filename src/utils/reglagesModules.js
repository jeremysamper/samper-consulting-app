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

export const MODULES_REGLES = ['pertes', 'groupes', 'mep', 'fiches_salle', 'kds', 'catalogue'];

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
