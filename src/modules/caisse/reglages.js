import { CUISSONS } from './options.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réglages de la caisse (caisse_reglages.config, migration v4).
//
// La base ne porte que ce que la maison a changé : le front fusionne config
// sur les défauts ci-dessous, une clé absente ou mal formée = défaut. Une
// maison sans aucun réglage voit donc une caisse complète.
//
//   modes           : { visibles, max, libelles }
//                     visibles = nombre de modes « à suivre » toujours affichés
//                     (0 à 8) ; max = jusqu'où le « + » peut aller ; libelles =
//                     noms maison, rang 0 = « En direct » (suite 1).
//   cuissons        : liste de textes
//   sans_rapides    : liste de textes (chips « sans ... » toujours proposées)
//   moyens_paiement : [{ cle: 'especes' | 'carte' | 'autre', libelle }]
//                     cle = la famille stockée en base (caisse_paiements.moyen),
//                     libelle = le nom que la maison lui donne.
//   grille          : 'large' | 'dense'
//   ouverture       : 'tout' | 'categorie' : l'onglet sur lequel la grille
//                     s'ouvre. « Tout » par défaut : tous les produits sur un
//                     écran, à un tap, comme avant les onglets ; une grande
//                     carte préférera s'ouvrir sur sa première catégorie.
//   delai_no_show_min : minutes après l'heure d'une réservation confirmée avant
//                     que la caisse la propose dans « Réservations sans
//                     ticket » (v5). Rien n'est jamais posé sans tap.
//   cartes_ids      : les cartes qui alimentent la caisse (v5). Absente ou
//                     vide = toutes les cartes actives, comme avant. Une carte
//                     archivée ou cachée ne vend jamais, même cochée ; un
//                     identifiant de carte disparue est ignoré.
//   tests_en_cuisine : true = les bons des tickets de test partent au KDS,
//                     « TEST » en tête, pour former la cuisine (v6). Absente
//                     ou autre valeur = rien en cuisine. La base lit la même
//                     clé (caisse_bon_interne) : seul le booléen true compte.
//
// Les modes ne changent rien au schéma : le mode de rang n est la suite n de
// caisse_lignes (1 = En direct, 2 = À suivre, 3 = À suivre 2...).
// ─────────────────────────────────────────────────────────────────────────────

export const SUITE_MAX = 9;
export const DELAI_NO_SHOW_MIN = 5;
export const DELAI_NO_SHOW_MAX = 240;
export const DELAIS_NO_SHOW = [15, 30, 45, 60];
export const MODES_SUIVRE_MAX = SUITE_MAX - 1;
export const FAMILLES_PAIEMENT = ['especes', 'carte', 'autre'];
export const LIBELLES_FAMILLES = { especes: 'Espèces', carte: 'Carte bancaire', autre: 'Autre' };
export const GRILLES = ['large', 'dense'];
export const OUVERTURES = ['tout', 'categorie'];

export const REGLAGES_DEFAUT = {
  modes: { visibles: 2, max: 2, libelles: [] },
  cuissons: CUISSONS,
  sans_rapides: [],
  moyens_paiement: FAMILLES_PAIEMENT.map((cle) => ({ cle, libelle: LIBELLES_FAMILLES[cle] })),
  grille: 'large',
  ouverture: 'tout',
  delai_no_show_min: 30,
  cartes_ids: [],
  tests_en_cuisine: false,
};

const borne = (n, min, max, defaut) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : defaut;
};

// Liste de textes propre : sans vide, sans doublon, bornée.
function listeTextes(v, longueur = 30, taille = 24) {
  if (!Array.isArray(v)) return null;
  const vus = [];
  v.forEach((x) => {
    const t = String(x ?? '').trim().slice(0, longueur);
    if (t && !vus.includes(t)) vus.push(t);
  });
  return vus.slice(0, taille);
}

// config (jsonb de la base, ou null) -> réglages complets. `perso` dit quelles
// listes viennent de la maison : leurs libellés sont alors des données
// (data-no-translate), ceux des défauts restent des textes d'interface.
export function fusionnerReglages(config) {
  const c = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const m = c.modes && typeof c.modes === 'object' ? c.modes : {};
  const visibles = borne(m.visibles, 0, MODES_SUIVRE_MAX, REGLAGES_DEFAUT.modes.visibles);
  const max = Math.max(visibles, borne(m.max, 0, MODES_SUIVRE_MAX, Math.max(visibles, REGLAGES_DEFAUT.modes.max)));
  const libelles = Array.isArray(m.libelles)
    ? m.libelles.slice(0, SUITE_MAX).map((x) => String(x ?? '').trim().slice(0, 24))
    : [];

  const cuissons = listeTextes(c.cuissons);
  const sans = listeTextes(c.sans_rapides);
  const moyens = Array.isArray(c.moyens_paiement)
    ? c.moyens_paiement
      .map((x) => ({
        cle: FAMILLES_PAIEMENT.includes(x?.cle) ? x.cle : 'autre',
        libelle: String(x?.libelle ?? '').trim().slice(0, 40),
      }))
      .filter((x) => x.libelle)
      .slice(0, 8)
    : null;

  return {
    modes: { visibles, max, libelles },
    cuissons: cuissons && cuissons.length ? cuissons : REGLAGES_DEFAUT.cuissons,
    sans_rapides: sans || REGLAGES_DEFAUT.sans_rapides,
    // Une liste de moyens vidée par erreur ne bloque pas l'encaissement.
    moyens_paiement: moyens && moyens.length ? moyens : REGLAGES_DEFAUT.moyens_paiement,
    grille: GRILLES.includes(c.grille) ? c.grille : REGLAGES_DEFAUT.grille,
    ouverture: OUVERTURES.includes(c.ouverture) ? c.ouverture : REGLAGES_DEFAUT.ouverture,
    delai_no_show_min: borne(c.delai_no_show_min, DELAI_NO_SHOW_MIN, DELAI_NO_SHOW_MAX, REGLAGES_DEFAUT.delai_no_show_min),
    cartes_ids: listeTextes(c.cartes_ids, 80, 60) || [],
    tests_en_cuisine: c.tests_en_cuisine === true,
    perso: {
      cuissons: Boolean(cuissons && cuissons.length),
      moyens_paiement: Boolean(moyens && moyens.length),
    },
  };
}

// Les cartes qui alimentent la caisse, et les articles qu'elles portent.
// Fermé par défaut : seule une carte ni archivée ni cachée vend, cochée ou
// non. Sans réglage (cartes_ids vide), toutes les cartes actives vendent et,
// si la maison n'a relié aucun plat à une carte, tous les plats actifs (le
// comportement d'avant la v5). Avec un réglage, seuls les plats des cartes
// cochées encore actives vendent : si plus aucune ne l'est, la grille est vide
// (l'article libre reste), jamais rouverte en grand toute seule.
export function cartesEtArticlesEnVente({ plats, cartes, cartesIds }) {
  const actives = (cartes || []).filter((c) => c && !c.archive && !c.masquee);
  const choisies = Array.isArray(cartesIds) ? cartesIds : [];
  const regle = choisies.length > 0;
  const enVente = regle ? actives.filter((c) => choisies.includes(c.id)) : actives;
  const ids = new Set(enVente.map((c) => c.id));
  const platsActifs = (plats || []).filter((p) => p.actif !== false);
  const surCarte = platsActifs.filter((p) => (p.carteIds || []).some((id) => ids.has(id)));
  const articles = regle || surCarte.length ? surCarte : platsActifs;
  return { cartesActives: actives, cartesEnVente: enVente, articles, regle };
}

// Nom d'un mode. suite 1 = En direct, 2 = À suivre, 3 = À suivre 2...
export function libelleModeDefaut(suite) {
  if (suite <= 1) return 'En direct';
  return suite === 2 ? 'À suivre' : `À suivre ${suite - 1}`;
}

export function libelleMode(reglages, suite) {
  return reglages?.modes?.libelles?.[suite - 1] || libelleModeDefaut(suite);
}

// Les suites proposées dans la barre de modes : En direct, les « à suivre »
// réglés, celles que le « + » a ouvertes pendant ce ticket, et toute suite
// qui porte déjà une ligne (une ligne n'est jamais dans un mode invisible).
export function suitesVisibles(reglages, lignes, ouvertes = 0) {
  const base = 1 + Math.max(reglages?.modes?.visibles ?? 0, ouvertes);
  const portees = (lignes || []).map((l) => Number(l.suite) || 1);
  const haut = Math.min(SUITE_MAX, Math.max(base, ...portees, 1));
  return Array.from({ length: haut }, (_, i) => i + 1);
}

// Le « + » existe tant que la maison autorise un mode de plus.
export function peutOuvrirMode(reglages, suites) {
  const dernier = suites[suites.length - 1] || 1;
  return dernier < 1 + (reglages?.modes?.max ?? 0) && dernier < SUITE_MAX;
}
