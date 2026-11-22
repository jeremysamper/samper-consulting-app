import { DUREE_TABLEE, chevauche, fenetre, minutesDe } from '../modules/salle/planTemps.js';
import { cadrage, medianeTables } from '../modules/salle/planVue.js';

// ─────────────────────────────────────────────────────────────────────────────
// Choix de la table en réservant en ligne (lot L9). Fonctions pures, sans
// React : elles se testent sous Node (choixTable.test.mjs).
//
// La base fait foi : table_en_ligne_plan() et resa_tables_libres_en_ligne()
// (migration 20261122_reservation_choix_table) calculent la disponibilité
// pour la page publique et la revérifient à l'envoi. Le même calcul est écrit
// ici pour la démo publique (src/demo/rpc.js) et pour les tests, qui
// comparent aussi la règle de durée à celle de la migration.
// ─────────────────────────────────────────────────────────────────────────────

// Places de trop admises : un couple ne bloque pas une table de huit.
export const ECART_PLACES = 2;

// Côté visé pour une table au doigt, en pixels (cible tactile de 44 px).
export const COTE_TACTILE = 44;

// Échelle au plus : une petite salle ne s'affiche pas en géant à l'ordinateur.
export const ECHELLE_MAX = 1.1;

const SERVICES = ['midi', 'soir', 'brunch'];
const TERMINEES = new Set(['parti', 'no_show', 'annule']);

export const dureeTablee = (service) => DUREE_TABLEE[service] ?? DUREE_TABLEE.soir;

// La table convient au nombre de personnes : assez de places, au plus deux de
// trop ; une place de bar ne reçoit qu'une personne.
export function tableConvient(table, personnes) {
  const p = Number(personnes) || 0;
  const places = Number(table?.nb_places ?? table?.places) || 0;
  if (p < 1) return false;
  if (places < p || places > p + ECART_PLACES) return false;
  return table?.forme !== 'tabouret' || p === 1;
}

// Ids des tables libres pour un créneau, comme resa_tables_libres_en_ligne().
// `tables` : lignes de salle_tables ; `salles` : lignes de salles ;
// `reservations` et `liens` (reservation_tables) du jour ; `ajustements` :
// salle_tables_service du jour. `maintenant` (minutes) n'est donné que pour
// aujourd'hui : un client arrivé occupe sa table jusqu'à maintenant + 15.
export function tablesLibres({
  tables, salles, reservations, liens, ajustements = [], etablissementId,
  service, heure, personnes, sallesOuvertes, maintenant = null,
}) {
  const debut = minutesDe(heure);
  if (debut == null) return new Set();
  const demande = { debut, fin: debut + dureeTablee(service) };
  const ouvertes = new Set(sallesOuvertes || []);
  const sallesActives = new Set((salles || [])
    .filter((s) => s.etablissement_id === etablissementId && s.actif !== false && ouvertes.has(s.id))
    .map((s) => s.id));
  const fusionnees = new Set((ajustements || [])
    .filter((a) => a.service === service && a.fusion)
    .map((a) => a.table_id));
  const parId = new Map((reservations || []).map((r) => [r.id, r]));
  const occupees = new Set();
  for (const l of liens || []) {
    const r = parId.get(l.reservation_id);
    if (!r || TERMINEES.has(r.statut)) continue;
    if (chevauche(demande, fenetre(r, maintenant))) occupees.add(l.table_id);
  }
  return new Set((tables || [])
    .filter((t) => t.etablissement_id === etablissementId && t.actif !== false && sallesActives.has(t.salle_id))
    .filter((t) => tableConvient(t, personnes))
    .filter((t) => !fusionnees.has(t.id) && !occupees.has(t.id))
    .map((t) => t.id));
}

// Service d'une heure d'arrivée, d'après les horaires du jour ISO : celui
// demandé s'il ouvre à cette heure, sinon le premier qui l'ouvre.
export function serviceDeLHeure(horaires, isoJour, heure, demande = null) {
  const m = minutesDe(heure);
  if (m == null) return null;
  const candidats = SERVICES.includes(demande) ? [demande] : SERVICES;
  const jour = (horaires || {})[String(isoJour)] || {};
  return candidats.find((s) => {
    const de = minutesDe(jour[s]?.de);
    const a = minutesDe(jour[s]?.a);
    return de != null && a != null && m >= de && m <= a;
  }) || null;
}

const isoDe = (jour) => {
  const [y, mo, d] = String(jour).split('-').map(Number);
  const j = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return j === 0 ? 7 : j;
};
const ecartJours = (de, a) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

// Réponse de table_en_ligne_plan(), même forme, calculée sur des lignes déjà
// en mémoire (démo publique). Ce qui n'ouvre pas rend { ouvert: false }.
export function planEnLigne({
  params, salles, tables, elements = [], reservations, liens, ajustements = [],
  jour, heure, personnes, service = null, aujourdhui, maintenant,
}) {
  const ferme = (raison) => ({ ouvert: false, raison });
  if (!params?.en_ligne_actif || !params.choix_table || !(params.salles_choix_table || []).length) return ferme('ferme');
  const p = Number(personnes) || 0;
  if (p < 1 || p > (params.max_couverts || 8)) return ferme('couverts');
  const ecart = ecartJours(aujourdhui, jour);
  if (!Number.isFinite(ecart) || ecart < 0 || ecart > (params.horizon_jours || 60) || (params.jours_fermes || []).includes(jour)) return ferme('jour');
  const sv = serviceDeLHeure(params.horaires, isoDe(jour), heure, service);
  if (!sv) return ferme('horaire');
  if ((params.services_fermes?.[jour] || []).includes(sv)) return ferme('jour');
  if (ecart === 0 && minutesDe(heure) < maintenant + (params.delai_min_heures || 0) * 60) return ferme('horaire');

  const etab = params.etablissement_id;
  const libres = tablesLibres({
    tables, salles, reservations: (reservations || []).filter((r) => r.etablissement_id === etab && r.date_service === jour),
    liens, ajustements: (ajustements || []).filter((a) => a.date_service === jour), etablissementId: etab,
    service: sv, heure, personnes: p, sallesOuvertes: params.salles_choix_table, maintenant: ecart === 0 ? maintenant : null,
  });
  const ajust = new Map((ajustements || []).filter((a) => a.date_service === jour && a.service === sv).map((a) => [a.table_id, a]));
  const ouvertes = new Set(params.salles_choix_table);
  const sallesVues = (salles || [])
    .filter((s) => s.etablissement_id === etab && s.actif !== false && ouvertes.has(s.id))
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || String(a.nom).localeCompare(String(b.nom)));
  return {
    ouvert: true,
    service: sv,
    salles: sallesVues.map((s) => ({
      id: s.id,
      nom: s.nom,
      tables: (tables || []).filter((t) => t.salle_id === s.id && t.etablissement_id === etab && t.actif !== false).map((t) => {
        const a = ajust.get(t.id);
        const deplacee = a && a.pos_x != null && a.pos_y != null;
        const libre = libres.has(t.id);
        return {
          id: libre ? t.id : null,
          nom: libre ? t.nom : null,
          forme: t.forme,
          places: t.nb_places,
          x: Number(deplacee ? a.pos_x : t.pos_x),
          y: Number(deplacee ? a.pos_y : t.pos_y),
          largeur: Number(a?.pivotee ? t.hauteur : t.largeur),
          hauteur: Number(a?.pivotee ? t.largeur : t.hauteur),
          pivotee: !!a?.pivotee,
          libre,
        };
      }),
      decor: (elements || []).filter((e) => e.salle_id === s.id && e.etablissement_id === etab).map((e) => ({
        type: e.type, x: Number(e.pos_x), y: Number(e.pos_y), largeur: Number(e.largeur), hauteur: Number(e.hauteur), rotation: Number(e.rotation) || 0,
      })),
    })),
  };
}

// Cadrage d'une salle à l'écran, en pixels : le contour de ce qui est dessiné
// (planVue.cadrage), à l'échelle de la largeur disponible. Quand la table
// médiane y tomberait sous la cible tactile, le plan garde une échelle
// lisible et défile sous le doigt (`defile`) plutôt que de gonfler les
// tables les unes sur les autres (observation 0327).
export function cadragePlan(salle, largeurDispo, { cible = COTE_TACTILE, echelleMax = ECHELLE_MAX } = {}) {
  const versCanevas = (o) => ({ pos_x: o.x, pos_y: o.y, largeur: o.largeur, hauteur: o.hauteur });
  const tables = (salle?.tables || []).map(versCanevas);
  const objets = [...tables, ...(salle?.decor || []).map(versCanevas)];
  const vue = cadrage(objets, 40);
  const dispo = Math.max(1, Number(largeurDispo) || 0);
  const ajuste = Math.min(echelleMax, dispo / vue.w);
  const mediane = medianeTables(tables);
  const lisible = mediane > 0 ? cible / mediane : ajuste;
  const k = Math.min(echelleMax, Math.max(ajuste, lisible));
  return {
    ...vue,
    k,
    largeur: Math.round(vue.w * k),
    hauteur: Math.round(vue.h * k),
    defile: vue.w * k > dispo + 1,
  };
}

// Libellé d'une table pour le visiteur : « Table 12 » pour un numéro seul,
// le nom tel quel sinon (« Bar 2 », « Terrasse 4 »).
export function libelleTable(nom) {
  const n = String(nom ?? '').trim();
  if (!n) return 'Table';
  return /^\d+[a-z]?$/i.test(n) ? `Table ${n}` : n;
}
