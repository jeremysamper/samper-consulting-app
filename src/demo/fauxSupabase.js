// Mode démo : un Supabase complet, simulé dans le navigateur.
//
// - Le client de l'app pointe sur https://demo.invalid (domaine qui ne se
//   résout jamais) ; toute requête vers lui, ou vers *.supabase.co par
//   sécurité, est servie ici, sans réseau.
// - Auth : session fabriquée pour la personne du rôle choisi.
// - PostgREST : base en mémoire (src/demo/postgrest.js), gardée dans le
//   sessionStorage de l'onglet pour survivre à un changement de rôle.
// - RPC, fonctions Edge, stockage : réponses plausibles ou erreur claire.
// - Realtime : socket simulée qui accepte les abonnements et renvoie les
//   changements faits dans la démo.
// - IA : jamais d'appel à ai-proxy.
import { executer, erreurPg, uuid } from './postgrest.js';
import { decompterPortions, executerRpc, portionsDeLigne } from './rpc.js';
import { creerBase } from './donnees/index.js';
import { ETAB, EQUIPE, ROLES_DEMO, aujourdhui, jour, instant } from './donnees/base.js';
import { STOCKAGE, PREFIXE } from './isolation.js';
import { defaultPermissions } from '../modules/moduleConfig.js';
import { totaux } from '../modules/groupes/facturation/calculs.js';
import { ROLES_POURBOIRES, REFUS_POURBOIRES, changementPourboiresRefuse } from '../modules/caisse/gardesCaisse.js';

export const DEMO_URL = 'https://demo.invalid';
const DEMO_HOTE = new URL(DEMO_URL).hostname;
const CLE_BASE = PREFIXE + 'base';
const CLE_ROLE = PREFIXE + 'role';
// v2 (lot L3) : la commande par QR entre dans les jeux ; une base du jour en
// cache dans l'onglet serait relue sans elle. v3 (Carte des boissons, lot A) :
// plat_formats et cartes.genre. v4 (lot 1, chiffres justes) : type de groupe
// valide, temps de service des fiches salle non inventé. v5 (lot 2a) : réglages
// des modules, modèles de mise en place, stocks cibles, livraisons des fournisseurs.
// v6 (lot 2a, D5) : messages des fils d'équipe (canaux_messages).
// v7 (lot 6a, D4) : branche Hôtel et Spa, praticienne spa dans l'équipe.
// v8 (lot 6b) : réglages des modules Étages, Demandes et Repas hôtel.
// v9 (lot 4a) : commandes par fournisseur, réception, produits habituels,
// pertes reliées, liste J+1, règles de Ventes POS, ingrédients à relier.
// v10 (lot 5) : cadeaux demandés, procédures rappelée et commencée, fiches en
// brouillon, alertes de cuisine, dossiers de Documents aux types de la base.
// v11 (lot 4b, retrait du 23.11) : commandes par fournisseur, stocks cibles,
// produits habituels et règles de Ventes POS retirés des jeux.
// v12 (lot 4a, retrait du 23.11) : fournisseurs sans jours de livraison, heure
// limite ni délai de commande ; correspondances de Ventes POS sans regle_id.
// v13 (23.11.2026) : devis, factures et paiements des groupes.
// v14 (23.11.2026) : coordonnées légales de la caisse ; sans elles, un vrai
// ticket ne s'encaisse pas.
// v15 (lot 05 du panel, 25.11.2026) : origine des lignes de note, deux tickets
// payés « Chambre » (l'un porté sur une note, l'autre à porter).
// v16 (lot 06 du panel, 25.11.2026) : sources de la prévision des couverts
// (pension allumée) et un séjour en demi-pension relié à une réservation.
// v17 (lot 09 du panel, 25.11.2026) : une « Formule midi » à trois étapes.
// v18 (lot 11 du panel, 26.11.2026) : règle de partage des pourboires dans
// les réglages de la caisse (Salle 70, Cuisine 30).
// v20 (lot 13 du panel, 26.11.2026) : un exonéré de la taxe de séjour
// (« Résident de la commune ») dans le registre de la chambre 103.
// v21 (lot 15 du panel, 26.11.2026) : accords des fiches salle reliés aux
// boissons de la caisse (platId).
// v22 (lot 17 du panel, 26.11.2026) : demande par le QR de la chambre
// (demandes_qr_parametres, demandes_qr_chambres, une demande par_qr).
// v23 (lot 18 du panel, 26.11.2026) : question « Formule » de la réservation
// en ligne (questions_en_ligne), réponse et étiquette sur les demandes.
const VERSION_BASE = 'v23-' + aujourdhui();
// Lot 02 du panel : ?maisons=2 sème une seconde maison. Sa base gardée porte
// un suffixe, pour qu'un onglet ouvert sans le paramètre puis avec lui ne
// relise pas la base à une maison, et l'inverse.
let optionsBase = {};
const versionBase = () => VERSION_BASE + (optionsBase.maisons === 2 ? '-m2' : '');

// ── Rôle et session ──────────────────────────────────────────────────────────

export function roleCourant() {
  const r = STOCKAGE.getItem(CLE_ROLE);
  return ROLES_DEMO.some((x) => x.role === r) ? r : 'patron';
}

export function choisirRole(role) {
  STOCKAGE.setItem(CLE_ROLE, role);
}

const b64url = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function lireJeton(entete) {
  try {
    const jeton = String(entete || '').replace(/^Bearer\s+/i, '');
    const [, corps] = jeton.split('.');
    return JSON.parse(decodeURIComponent(escape(atob(corps.replace(/-/g, '+').replace(/_/g, '/')))));
  } catch {
    return null;
  }
}

function utilisateurAuth(profil) {
  return {
    id: profil.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: profil.email,
    email_confirmed_at: '2026-01-05T08:00:00Z',
    phone: '',
    confirmed_at: '2026-01-05T08:00:00Z',
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { prenom: profil.prenom, nom: profil.nom },
    identities: [],
    created_at: '2026-01-05T08:00:00Z',
    updated_at: '2026-11-01T08:00:00Z',
    is_anonymous: false,
  };
}

export function fabriquerSession(userId) {
  const profil = EQUIPE.find((u) => u.id === userId) || EQUIPE[0];
  const maintenant = Math.floor(Date.now() / 1000);
  const exp = maintenant + 365 * 24 * 3600;
  const jeton = [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub: profil.id, aud: 'authenticated', role: 'authenticated', email: profil.email, exp, iat: maintenant, aal: 'aal1', amr: [{ method: 'password', timestamp: maintenant }], session_id: 'demo-' + profil.id, is_anonymous: false }),
    'demo',
  ].join('.');
  return {
    access_token: jeton,
    token_type: 'bearer',
    expires_in: exp - maintenant,
    expires_at: exp,
    refresh_token: 'demo-renouvellement-' + profil.id,
    user: utilisateurAuth(profil),
  };
}

// ── Base en mémoire ──────────────────────────────────────────────────────────

let db = null;
let minuterieSauvegarde = null;

function chargerBase() {
  try {
    const brut = STOCKAGE.getItem(CLE_BASE);
    if (brut) {
      const lu = JSON.parse(brut);
      if (lu?.version === versionBase() && lu.tables) return lu.tables;
    }
  } catch { /* base illisible : on repart du jeu de départ */ }
  return creerBase(optionsBase);
}

function sauverPlusTard() {
  clearTimeout(minuterieSauvegarde);
  minuterieSauvegarde = setTimeout(() => {
    try {
      STOCKAGE.setItem(CLE_BASE, JSON.stringify({ version: versionBase(), tables: db }));
    } catch (e) {
      console.warn('[Démo] La base ne tient plus dans le stockage de l\'onglet ; elle reste en mémoire.', e);
    }
  }, 400);
}

export function oublierBase() {
  STOCKAGE.removeItem(CLE_BASE);
}

// Valeurs par défaut de la base, pour les insertions de l'app.
const DEFAUTS = {
  __sansId: ['user_settings', 'permissions', 'permissions_utilisateurs', 'planning_groupe_membres', 'planning_masques', 'pointage_postes', 'demarrage_etapes', 'achats_hausses_vues', 'compta_reglages', 'caisse_reglages', 'reglages_maison', 'objectifs_maison', 'pointage_codes', 'consultant_messages', 'points_reglages', 'reservation_en_ligne_parametres', 'spa_parametres', 'profile_contacts', 'app_settings', 'donnees_exemple', 'factures_compteurs', 'caisse_compteurs', 'hotel_reglages', 'caisse_commande_qr_parametres', 'demandes_qr_parametres', 'demandes_qr_chambres', 'reglages_modules', 'facturation_reglages', 'groupe_docs_compteurs'],
  reservations: { statut: 'confirme', origine: 'equipe', est_groupe: false, passeport_gourmand: false, created_by: () => sessionUid },
  shifts: { pause: 0, type_shift: 'simple', statut: 'confirmé', pointage_debut: null, pointage_fin: null, pointage_fin_auto: false },
  recettes: { statut: 'brouillon', version: 1, portions: 4, prix_vente: 0, allergenes_ids: [], ingredients: [], etapes: [], masquee: false, created_by: () => sessionUid },
  plats: { categorie: 'Plats', ordre: 0, actif: true },
  salles: { ordre: 0, actif: true, echelle_tables: 1 },
  cartes: { plats: [], archive: false, masquee: false, ordre: 0, genre: 'mets' },
  plat_formats: { ordre: 0 },
  produits: { categorie: 'Autres', unite_ref: 'g', actif: true, allergenes: [], strategie_prix: 'max', prix_verrouille: false },
  pertes: { quantite: 0, unite: 'pcs', valeur_unit: 0, valide: false, produit_id: null, recette_id: null, mep_item_id: null, source: 'saisie' },
  haccp_releves: {},
  documents: { roles_visibles: null },
  private_messages: { read_at: null, sender_id: () => sessionUid },
  caisse_tickets: { statut: 'ouvert', test: false, a_emporter: false, ouvert_par: () => sessionUid, retrait_nom: null, retrait_heure: null, retrait_numero: null },
  caisse_lignes: { quantite: 1, prix_unitaire: 0, suite: 1, statut: 'en_attente', options: [], a_emporter: false, remise_montant: 0, offert: false, formule_id: null, formule_groupe: null, formule_nom: null },
  // Lot 12 du panel (migration 20261126_panel_lot12_caisse_disponibilite).
  caisse_boutons: { epuise_durable: false, portions_le: null, portions_restantes: null },
  // Lot 09 du panel (migration 20261125_panel_lot09_caisse_formules).
  caisse_formules: { actif: true, archivee: false, ordre: 0, created_by: () => sessionUid },
  inventaires: { statut: 'en cours', valeur_totale: 0, lignes: [], nom: 'Général' },
  absences: { motif: 'conge', statut: 'acceptee', created_by: () => sessionUid },
  journal_activite: {},
  temps_gagne: { quantite: 1, fait_par: () => sessionUid },
  points_mouvements: { sens: 'credit' },
  // Lot 2 (migration 20261122_lot2a_reglages_modules) : défauts de la base.
  fournisseurs: { actif: true },
  sops: { roles_designes: [], rappel_actif: false },
  compta_reglages: { delai_paiement_jours: 30, categories_charges: [], exercice_debut_mois: 1, cartes_accueil: null },
  reglages_modules: { config: {}, updated_by: () => sessionUid },
  mep_modeles: { lignes: [], ordre: 0, actif: true, created_by: () => sessionUid },
  // Lot 4a (migration 20261122b_lot4a_commande_base) : colonnes gardées de la
  // mise en place (la commande par fournisseur ne part pas).
  mep_listes: { poste: null, modele_id: null, origine: 'manuel', base_calcul: null },
  mep_items: { quantite_suggeree: null, origine: null },
  // Lot 6a (D4) : branche Hôtel et Spa. Défauts des migrations hotel_h0 à h8 et
  // spa_module ; l'auteur est posé par les déclencheurs de la base.
  chambres: { statut_menage: 'a_faire', ordre: 0, actif: true },
  sejours: { statut: 'prevu', pension: 'aucune', nb_adultes: 1, nb_enfants: 0, created_by: () => sessionUid },
  chambres_minibar: { quantite: 1, par: () => sessionUid },
  objets_trouves: { statut: 'trouve', par: () => sessionUid },
  linge_mouvements: { sens: 'sale', quantite: 1, par: () => sessionUid },
  chambres_turndown: { fait_par: () => sessionUid, at: () => new Date().toISOString() },
  demandes: { origine: 'hote', priorite: 'normale', statut: 'ouverte', escaladee: false, par_qr: false, cree_par: () => sessionUid },
  hotes: { langue: 'fr', vip: false, consentement_marketing: false, archive: false, created_by: () => sessionUid },
  tarifs: { pension: 'petit_dejeuner', personnes_incluses: 2, prix_personne_sup: 0, prix_enfant: 0, actif: true, ordre: 0 },
  sejour_occupants: { exonere_taxe: false, created_by: () => sessionUid },
  // montant : colonne calculée en base (quantité x prix unitaire).
  // origine, origine_id : lot 05 du panel (ligne venue de la Caisse).
  sejour_lignes: { quantite: 1, prix_unitaire: 0, montant: (l) => Math.round((Number(l.quantite ?? 1) * Number(l.prix_unitaire ?? 0)) * 100) / 100, origine: null, origine_id: null, created_by: () => sessionUid },
  forfaits: { prix_par_nuit: 0, actif: true, ordre: 0 },
  forfait_droits: { categorie: 'autre', ordre: 0 },
  activites: { prix: 0, inclus_forfait: true, annulee: false, created_by: () => sessionUid },
  activite_inscriptions: { nb_personnes: 1, statut: 'inscrit', created_by: () => sessionUid },
  consommations: { quantite: 1, at: () => new Date().toISOString(), par: () => sessionUid },
  passations: { service: 'matin', important: false, created_by: () => sessionUid },
  passation_lectures: { user_id: () => sessionUid, at: () => new Date().toISOString() },
  taches_recurrentes: { recurrence: 'quotidien', actif: true, ordre: 0 },
  taches_faites: { fait_par: () => sessionUid, at: () => new Date().toISOString() },
  room_service_commandes: { articles: [], total: 0, statut: 'recue', portee_sur_note: false, created_by: () => sessionUid },
  sejour_liens: { created_by: () => sessionUid },
  equipements: { categorie: 'autre', actif: true },
  maintenance_plans: { categorie: 'autre', actif: true },
  ordres_travail: { categorie: 'autre', priorite: 'normale', statut: 'ouvert', created_by: () => sessionUid },
  spa_soins: { duree_min: 60, actif: true, en_ligne: true },
  spa_clients: { consentement_marketing: false, archive: false },
  spa_reservations: { duree_min: 60, statut: 'prevue', origine: 'equipe' },
  spa_bons: { motif: 'cadeau' },
  groupe_devis: { statut: 'brouillon', lignes: [], total: 0, date_devis: () => aujourdhui() },
  groupe_factures: { statut: 'prevue', type: 'totale', ordre: 1, lignes: [], relances: [], montant: 0, mode_prevu: 'virement' },
  groupe_paiements: { mode: 'virement', date_paiement: () => aujourdhui(), updated_at: null },
};

const CLES_PRIMAIRES = {
  user_settings: ['user_id', 'key'],
  permissions: ['role_key'],
  permissions_utilisateurs: ['user_id'],
  planning_groupe_membres: ['etablissement_id', 'user_id'],
  planning_masques: ['etablissement_id', 'user_id'],
  pointage_postes: ['etablissement_id', 'user_id'],
  demarrage_etapes: ['etablissement_id', 'etape'],
  achats_hausses_vues: ['etablissement_id', 'cle', 'vu_par'],
  compta_reglages: ['etablissement_id'],
  caisse_reglages: ['etablissement_id'],
  reglages_maison: ['etablissement_id'],
  pointage_codes: ['user_id', 'etablissement_id'],
  objectifs_maison: ['etablissement_id'],
  consultant_messages: ['etablissement_id'],
  points_reglages: ['etablissement_id'],
  reservation_en_ligne_parametres: ['etablissement_id'],
  spa_parametres: ['etablissement_id'],
  profile_contacts: ['user_id'],
  app_settings: ['key'],
  factures_compteurs: ['etablissement_id', 'date'],
  caisse_compteurs: ['etablissement_id', 'cle'],
  caisse_commande_qr_parametres: ['etablissement_id'],
  demandes_qr_parametres: ['etablissement_id'],
  demandes_qr_chambres: ['chambre_id'],
  reglages_modules: ['etablissement_id', 'module'],
  hotel_reglages: ['etablissement_id'],
  facturation_reglages: ['etablissement_id'],
};

let sessionUid = null;

// Ce que posent les déclencheurs des devis et factures des groupes (migration
// 20261123) : numéro DEV / FAC à la création ou à l'émission, total et
// montant depuis les lignes, horodatages des changements d'état, auteur.
function numeroDemo(etab, prefixe, dateIso) {
  const annee = Number(String(dateIso || aujourdhui()).slice(0, 4));
  if (!db.groupe_docs_compteurs) db.groupe_docs_compteurs = [];
  let c = db.groupe_docs_compteurs.find((x) => x.etablissement_id === etab && x.prefixe === prefixe && x.annee === annee);
  if (!c) { c = { etablissement_id: etab, prefixe, annee, dernier: 0 }; db.groupe_docs_compteurs.push(c); }
  c.dernier += 1;
  return `${prefixe}-${annee}-${String(c.dernier).padStart(4, '0')}`;
}

// Lot 12 du panel : le compteur de portions du jour, comme le déclencheur
// trg_caisse_ligne_portions (décompte, refus de la ligne de trop, portion
// rendue). Une seule règle, decompterPortions de rpc.js.
function majBouton(b, valeurs) {
  const avant = { ...b };
  Object.assign(b, valeurs);
  diffuser({ type: 'UPDATE', table: 'caisse_boutons', record: { ...b }, old_record: avant });
}

// Déclencheurs de la base qui refusent une écriture, rejoués avant qu'elle
// touche la base en mémoire (postgrest.js, option garde). Lot 19 : la clé
// « pourboires » de caisse_reglages, consultant et patron actifs seulement
// (trg_caisse_reglages_garde_pourboires), même message que la production.
function gardeEcriture(type, table, nouvelle, ancienne) {
  if (table !== 'caisse_reglages') return;
  const profil = (db.profiles || []).find((p) => p.id === sessionUid);
  const estDirection = (etab) => Boolean(profil && profil.actif !== false
    && ROLES_POURBOIRES.includes(profil.role) && (profil.etablissement_ids || []).includes(etab));
  // En insertion, la garde relit la règle déjà en base pour l'établissement.
  const avant = type === 'INSERT'
    ? (db.caisse_reglages || []).find((r) => r.etablissement_id === nouvelle?.etablissement_id) || null
    : ancienne;
  if (changementPourboiresRefuse({ type, nouvelle, ancienne: avant, estDirection })) {
    throw Object.assign(new Error(REFUS_POURBOIRES), { code: '42501' });
  }
}

function avantEcriture(type, table, ligne, avant) {
  const maintenant = new Date().toISOString();
  if (table === 'caisse_lignes') {
    const delta = portionsDeLigne(ligne.quantite) - (type === 'INSERT' ? 0 : portionsDeLigne(avant?.quantite));
    try {
      decompterPortions(db, [{ plat_id: ligne.plat_id, ticket_id: ligne.ticket_id, delta }], majBouton);
    } catch (e) {
      // PATCH : postgrest.js a déjà copié les valeurs neuves, la base n'écrit rien.
      if (avant) { Object.keys(ligne).forEach((k) => { if (!(k in avant)) delete ligne[k]; }); Object.assign(ligne, avant); }
      throw e;
    }
  }
  if (table === 'groupe_devis') {
    if (type === 'INSERT') { ligne.numero = numeroDemo(ligne.etablissement_id, 'DEV', ligne.date_devis); ligne.created_by = sessionUid; }
    if (ligne.statut !== avant?.statut) {
      if (ligne.statut === 'accepte') { ligne.accepte_le = maintenant; ligne.accepte_par = sessionUid; } else { ligne.accepte_le = null; ligne.accepte_par = null; }
      if (ligne.statut === 'envoye' && !ligne.envoye_le) ligne.envoye_le = maintenant;
      ligne.refuse_le = ligne.statut === 'refuse' ? maintenant : null;
    }
    ligne.total = totaux(ligne.lignes).total;
  }
  if (table === 'groupe_factures') {
    if (type === 'INSERT') ligne.created_by = sessionUid;
    if (!avant || avant.statut === 'prevue') ligne.montant = totaux(ligne.lignes).total;
    if (ligne.statut === 'emise' && (!avant || avant.statut === 'prevue')) {
      if (!ligne.date_facture) ligne.date_facture = aujourdhui();
      ligne.emise_le = maintenant;
      ligne.emise_par = sessionUid;
    }
    if (ligne.statut === 'emise' && !ligne.numero) ligne.numero = numeroDemo(ligne.etablissement_id, 'FAC', ligne.date_facture);
    if (ligne.statut === 'annulee' && avant?.statut !== 'annulee') ligne.annulee_le = maintenant;
  }
  if (table === 'groupe_paiements' && type === 'INSERT') ligne.created_by = sessionUid;
}

// Lecture filtrée comme la RLS : messages privés des seuls participants,
// droits pour toute la maison.
function avantLecture(table, lignes) {
  if (table === 'private_messages') return lignes.filter((m) => m.sender_id === sessionUid || m.recipient_id === sessionUid);
  if (table === 'permissions' && !lignes.length) {
    return Object.entries(defaultPermissions).map(([role_key, perms]) => ({ role_key, perms, updated_at: '2026-11-01T08:00:00Z' }));
  }
  return lignes;
}

// ── Realtime simulé ─────────────────────────────────────────────────────────

const sockets = new Set();
let idLiaison = 1;

function correspond(filtre, ligne) {
  if (!filtre) return true;
  const m = String(filtre).match(/^([a-z_]+)=([a-z]+)\.(.*)$/);
  if (!m || !ligne) return true;
  const [, col, op, val] = m;
  const v = ligne[col];
  if (op === 'eq') return String(v) === val;
  if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').includes(String(v));
  if (op === 'neq') return String(v) !== val;
  return true;
}

function diffuser(evt) {
  sauverPlusTard();
  const charge = {
    schema: 'public', table: evt.table, commit_timestamp: new Date().toISOString(), type: evt.type,
    record: evt.record || {}, old_record: evt.old_record || {}, columns: [], errors: null,
  };
  setTimeout(() => {
    for (const s of sockets) s.pousser(charge);
  }, 30);
}

// Déclencheurs de la base que les écrans de l'hôtel attendent (lot 6a) :
// chambres_journal_statut, demandes_avant_ecriture et demandes_journal_ecrire.
function journaliser(evt) {
  const { type, table, record: r, old_record: o } = evt;
  if (type === 'DELETE' || !r) return;
  const maintenant = new Date().toISOString();
  const ajouter = (t, ligne) => {
    const l = { id: uuid(), etablissement_id: r.etablissement_id, par: sessionUid, at: maintenant, ...ligne };
    (db[t] ||= []).push(l);
    diffuser({ type: 'INSERT', table: t, record: { ...l } });
  };
  if (table === 'chambres' && (type === 'INSERT' || r.statut_menage !== o?.statut_menage)) {
    ajouter('chambres_statut_journal', { chambre_id: r.id, ancien: type === 'UPDATE' ? o.statut_menage : null, nouveau: r.statut_menage });
  }
  if (table !== 'demandes') return;
  const ligne = db.demandes?.find((x) => x.id === r.id);
  if (ligne && r.statut === 'faite' && (type === 'INSERT' || o?.statut !== 'faite')) Object.assign(ligne, { faite_par: sessionUid, faite_at: ligne.faite_at || maintenant });
  if (ligne && r.statut !== 'faite') Object.assign(ligne, { faite_par: null, faite_at: null });
  if (ligne && r.escaladee && (type === 'INSERT' || !o?.escaladee)) ligne.escaladee_at = ligne.escaladee_at || maintenant;
  const trace = (action, detail) => ajouter('demandes_journal', { demande_id: r.id, action, detail });
  if (type === 'INSERT') { trace('creee', r.pole); return; }
  if (r.statut !== o?.statut) trace('statut', r.statut);
  if (r.assignee_a !== o?.assignee_a) trace('assignation', r.assignee_a);
  if (r.escaladee !== o?.escaladee) trace('escalade', r.escaladee ? 'oui' : 'non');
  if (r.echeance !== o?.echeance) trace('echeance', r.echeance);
  if (r.pole !== o?.pole) trace('pole', r.pole);
}

function apresEcriture(evt) {
  // postgrest.js n'appelle pas avantEcriture à la suppression : la portion
  // d'une ligne retirée est rendue ici.
  if (evt.type === 'DELETE' && evt.table === 'caisse_lignes' && evt.old_record) {
    const o = evt.old_record;
    decompterPortions(db, [{ plat_id: o.plat_id, ticket_id: o.ticket_id, delta: -portionsDeLigne(o.quantite) }], majBouton);
  }
  journaliser(evt);
  diffuser(evt);
}

class SocketDemo {
  constructor(url) {
    this.url = String(url);
    this.vsn = new URL(this.url).searchParams.get('vsn') || '1.0.0';
    this.readyState = 0;
    this.protocol = '';
    this.extensions = '';
    this.bufferedAmount = 0;
    this.binaryType = 'arraybuffer';
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.canaux = new Map();
    this.ecouteurs = { open: [], message: [], close: [], error: [] };
    sockets.add(this);
    setTimeout(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.emettre('open', new Event('open'));
    }, 15);
  }

  addEventListener(type, f) { (this.ecouteurs[type] ||= []).push(f); }
  removeEventListener(type, f) { this.ecouteurs[type] = (this.ecouteurs[type] || []).filter((x) => x !== f); }
  dispatchEvent() { return true; }

  emettre(type, evt) {
    const h = this['on' + type];
    if (typeof h === 'function') h.call(this, evt);
    for (const f of this.ecouteurs[type] || []) f.call(this, evt);
  }

  envoyer(msg) {
    if (this.readyState !== 1) return;
    const texte = this.vsn === '2.0.0'
      ? JSON.stringify([msg.join_ref ?? null, msg.ref ?? null, msg.topic, msg.event, msg.payload])
      : JSON.stringify(msg);
    setTimeout(() => this.emettre('message', new window.MessageEvent('message', { data: texte })), 5);
  }

  send(donnees) {
    if (typeof donnees !== 'string') return;
    let m;
    try {
      const brut = JSON.parse(donnees);
      m = Array.isArray(brut) ? { join_ref: brut[0], ref: brut[1], topic: brut[2], event: brut[3], payload: brut[4] } : brut;
    } catch { return; }
    const repondre = (response = {}) => this.envoyer({ join_ref: m.join_ref, ref: m.ref, topic: m.topic, event: 'phx_reply', payload: { status: 'ok', response } });
    if (m.topic === 'phoenix' && m.event === 'heartbeat') { repondre({}); return; }
    if (m.event === 'phx_join') {
      const liaisons = (m.payload?.config?.postgres_changes || []).map((f) => ({ ...f, id: idLiaison++ }));
      this.canaux.set(m.topic, { join_ref: m.join_ref, liaisons });
      repondre({ postgres_changes: liaisons });
      return;
    }
    if (m.event === 'phx_leave') { this.canaux.delete(m.topic); repondre({}); return; }
    if (m.ref != null && m.event !== 'access_token') repondre({});
  }

  pousser(charge) {
    for (const [topic, canal] of this.canaux) {
      const ids = canal.liaisons
        .filter((l) => (l.table === charge.table || l.table === '*' || !l.table)
          && (l.event === '*' || String(l.event).toUpperCase() === charge.type)
          && correspond(l.filter, charge.type === 'DELETE' ? charge.old_record : charge.record))
        .map((l) => l.id);
      if (ids.length) this.envoyer({ join_ref: canal.join_ref, ref: null, topic, event: 'postgres_changes', payload: { data: charge, ids } });
    }
  }

  close(code = 1000, raison = '') {
    if (this.readyState === 3) return;
    this.readyState = 3;
    sockets.delete(this);
    setTimeout(() => this.emettre('close', new window.CloseEvent('close', { code, reason: raison, wasClean: true })), 0);
  }
}
SocketDemo.CONNECTING = 0;
SocketDemo.OPEN = 1;
SocketDemo.CLOSING = 2;
SocketDemo.CLOSED = 3;

// ── Routage des requêtes ────────────────────────────────────────────────────

// Même hôte en https et en wss : on compare le nom d'hôte, pas l'origine.
const estSupabase = (url) => url.hostname === DEMO_HOTE || /\.supabase\.(co|in)$/i.test(url.hostname);

const reponse = (status, corps, entetes = {}) => {
  const sansCorps = [204, 205, 304].includes(status);
  return new Response(sansCorps || corps == null ? null : (typeof corps === 'string' ? corps : JSON.stringify(corps)), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...entetes },
  });
};

async function lireCorps(input, init) {
  let corps = init?.body;
  if (corps == null && input instanceof Request) {
    try { corps = await input.clone().text(); } catch { corps = null; }
  }
  if (typeof corps === 'string') {
    try { return JSON.parse(corps); } catch { return corps; }
  }
  return corps ?? null;
}

// Contexte passé aux RPC : écriture avec diffusion realtime.
function contexte() {
  return {
    db,
    uid: sessionUid,
    inserer(table, ligne) {
      const r = executer(db, { methode: 'POST', table, params: new URLSearchParams(), entetes: new Headers({ Prefer: 'return=representation' }), corps: ligne }, { defauts: DEFAUTS, clesPrimaires: CLES_PRIMAIRES, apresEcriture: diffuser });
      return Array.isArray(r.corps) ? r.corps[0] : r.corps;
    },
    maj(table, ligne, valeurs) {
      const avant = { ...ligne };
      Object.assign(ligne, valeurs);
      diffuser({ type: 'UPDATE', table, record: { ...ligne }, old_record: avant });
    },
    // Lot 09 du panel : retrait d'une formule (caisse_retirer_formule).
    supprimer(table, ligne) {
      const i = (db[table] || []).indexOf(ligne);
      if (i < 0) return;
      db[table].splice(i, 1);
      apresEcriture({ type: 'DELETE', table, record: null, old_record: { ...ligne } });
    },
  };
}

function repondreAuth(chemin, methode, url, corps, entetes) {
  if (chemin === '/auth/v1/token') {
    const type = url.searchParams.get('grant_type');
    let userId = sessionUid;
    if (type === 'password') {
      const email = String(corps?.email || '').toLowerCase();
      userId = EQUIPE.find((u) => u.email === email)?.id || ROLES_DEMO.find((r) => r.role === roleCourant())?.userId;
    }
    sessionUid = userId;
    return reponse(200, fabriquerSession(userId));
  }
  if (chemin === '/auth/v1/user') {
    const claims = lireJeton(entetes.get('Authorization'));
    const profil = EQUIPE.find((u) => u.id === claims?.sub);
    if (!profil) return reponse(401, { code: 401, error_code: 'no_authorization', msg: 'Session absente.' });
    if (methode === 'PUT') return reponse(200, utilisateurAuth(profil));
    return reponse(200, utilisateurAuth(profil));
  }
  if (chemin === '/auth/v1/logout') return reponse(204, null);
  if (chemin === '/auth/v1/recover' || chemin === '/auth/v1/otp') return reponse(200, {});
  if (chemin.startsWith('/auth/v1/factors')) return reponse(400, { code: 400, error_code: 'demo', msg: 'La double authentification n\'est pas disponible dans la démo.' });
  if (chemin === '/auth/v1/health' || chemin === '/auth/v1/settings') return reponse(200, { name: 'GoTrue', version: 'demo', external: {}, disable_signup: true });
  return reponse(200, {});
}

const IA_FERMEE = { error: 'L\'assistant IA n\'est pas ouvert dans la démo. Il l\'est dans l\'application.' };

async function repondreFonction(nom, corps) {
  if (nom === 'ai-proxy') {
    const tache = corps?.task;
    if (tache === 'translate') {
      // Pas de traduction automatique dans la démo : le glossaire suffit, le
      // reste garde son texte d'origine. Jamais d'appel au vrai service.
      const textes = corps?.payload?.texts || [];
      return reponse(200, { result: { t: textes.map(() => '') }, target: corps?.payload?.target || 'en' });
    }
    if (tache === 'dedupe-commande') return reponse(200, { result: { groupes: [] } });
    return reponse(200, IA_FERMEE);
  }
  if (nom === 'create-user') {
    const c = corps || {};
    const id = 'demo-' + uuid().slice(0, 8);
    db.profiles.push({
      id, email: c.email || `${id}@brasserie-demo.ch`, prenom: c.prenom || '', nom: c.nom || '', avatar: ((c.prenom?.[0] || '') + (c.nom?.[0] || '')).toUpperCase(),
      role: c.role || 'cuisinier', poste: c.poste || null, etablissement_ids: c.etablissement_ids || c.etablissementIds || [ETAB], actif: true,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    diffuser({ type: 'INSERT', table: 'profiles', record: db.profiles[db.profiles.length - 1] });
    return reponse(200, { user: { id }, id, ok: true });
  }
  if (nom === 'update-user') return reponse(200, { ok: true });
  if (nom === 'delete-user') {
    const id = corps?.user_id;
    const p = db.profiles.find((x) => x.id === id);
    if (p) { p.actif = false; diffuser({ type: 'UPDATE', table: 'profiles', record: { ...p } }); }
    return reponse(200, { ok: true });
  }
  if (nom === 'upload-recette-photo' || nom === 'upload-haccp-photo') {
    if (corps instanceof FormData) {
      const f = corps.get('file');
      const url = f instanceof Blob ? URL.createObjectURL(f) : null;
      return reponse(200, { path: 'demo/' + uuid(), url, signedUrl: url });
    }
    return reponse(200, { ok: true });
  }
  if (nom === 'notifications') {
    return reponse(200, corps?.action === 'cle' ? { cle: null, erreur: 'Notifications indisponibles dans la démo.' } : { ok: false, envoyes: 0, echecs: 0, expires: 0 });
  }
  if (nom === 'pos-oauth') {
    // Caisse Lightspeed simulée : l'état de la connexion de démo, rien d'autre.
    if (corps?.action === 'status') {
      const c = db.pos_connections.find((x) => x.etablissement_id === corps.etablissementId) || null;
      return reponse(200, c ? { ...c, connected: true } : { status: 'disconnected' });
    }
    return reponse(400, { error: 'La connexion à une caisse Lightspeed n\'est pas disponible dans la démo.' });
  }
  if (nom === 'pos-backfill' || nom === 'pos-sync') return reponse(400, { error: 'La synchronisation Lightspeed n\'est pas disponible dans la démo.' });
  if (nom === 'spa-mailer') return reponse(200, { ok: true, demo: true });
  if (nom === 'caisse-tpe') return reponse(400, { error: 'Aucun terminal de paiement n\'est relié dans la démo.' });
  // Envoi par Brevo : jamais relié dans la démo, le bouton « Envoyer » ne s'affiche pas.
  if (nom === 'envoi-documents') return reponse(200, corps?.action === 'etat' ? { configure: false } : { error: 'L\'envoi par e-mail n\'est pas disponible dans la démo.' });
  return reponse(200, { error: 'Ce service n\'est pas disponible dans la démo.' });
}

function repondreStockage(chemin, methode) {
  if (chemin.includes('/object/list/')) return reponse(200, []);
  if (chemin.includes('/object/sign/')) {
    // Aucun fichier dans la démo : jamais d'URL vers le vrai stockage.
    return reponse(400, { statusCode: '404', error: 'not_found', message: 'Les fichiers ne sont pas disponibles dans la démo.' });
  }
  if (methode === 'POST' || methode === 'PUT') return reponse(200, { Key: chemin.split('/object/')[1] || 'demo', Id: uuid() });
  if (methode === 'DELETE') return reponse(200, []);
  return reponse(404, { statusCode: '404', error: 'not_found', message: 'Fichier absent de la démo.' });
}

function repondreMeteo() {
  const heures = [];
  const jours = [];
  const base = new Date(instant(aujourdhui(), '00:00')).getTime();
  for (let h = 0; h < 7 * 24; h += 1) {
    const t = new Date(base + h * 3600000).toISOString();
    const heure = h % 24;
    const pluie = (h > 50 && h < 62) ? 0.6 : 0;
    const soleil = heure > 8 && heure < 17 && pluie === 0 ? 45 : 0;
    heures.push([t, pluie, soleil]);
  }
  for (let d = 0; d < 7; d += 1) jours.push([jour(d), d === 2 ? 4.5 : 0, 9 - (d % 3), -1 + (d % 2)]);
  return reponse(200, { source: 'MeteoSwiss', run: new Date().toISOString(), point: { id: 'demo', nom: 'Sion', npa: '1950', altitude: 491 }, heures, jours, station: null, historique: [] });
}

async function servir(url, input, init) {
  const methode = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const entetes = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  const chemin = url.pathname;
  const corps = await lireCorps(input, init);
  await new Promise((ok) => setTimeout(ok, 20 + Math.random() * 40));

  if (chemin.startsWith('/auth/v1/')) return repondreAuth(chemin, methode, url, corps, entetes);
  if (chemin.startsWith('/functions/v1/')) return repondreFonction(chemin.slice('/functions/v1/'.length).split('/')[0], corps);
  if (chemin.startsWith('/storage/v1/')) return repondreStockage(chemin, methode);
  if (chemin.startsWith('/realtime/v1/')) return reponse(200, {});
  if (chemin.startsWith('/rest/v1/rpc/')) {
    const nom = chemin.slice('/rest/v1/rpc/'.length);
    const args = methode === 'GET' ? Object.fromEntries(url.searchParams) : (corps || {});
    try {
      const r = executerRpc(contexte(), nom, args);
      sauverPlusTard();
      // Un résultat texte (une date, par exemple) part encodé en JSON, comme
      // PostgREST : reponse() enverrait sinon la chaîne brute, illisible.
      return reponse(200, r === undefined ? null : (typeof r === 'string' ? JSON.stringify(r) : r));
    } catch (e) {
      return reponse(e.code === '42501' ? 403 : 400, { code: e.code || 'P0001', message: e.message, details: null, hint: null });
    }
  }
  if (chemin.startsWith('/rest/v1/')) {
    const table = decodeURIComponent(chemin.slice('/rest/v1/'.length));
    try {
      const r = executer(db, { methode, table, params: url.searchParams, entetes, corps }, { defauts: DEFAUTS, clesPrimaires: CLES_PRIMAIRES, avantLecture, garde: gardeEcriture, avantEcriture, apresEcriture });
      return reponse(r.status, r.corps, r.entetes);
    } catch (e) {
      // Refus levé par un déclencheur simulé (compteur de portions, lot 12 ;
      // règle des pourboires, lot 19). PostgREST rend 403 pour un 42501.
      if (!e?.code) throw e;
      return reponse(e.code === '42501' ? 403 : 400, { code: e.code, message: e.message, details: null, hint: null });
    }
  }
  const e = erreurPg(404, 'Chemin inconnu de la démo : ' + chemin);
  return reponse(e.status, e.corps);
}

// ── Installation ────────────────────────────────────────────────────────────

export function installerFauxSupabase(options = {}) {
  optionsBase = options.maisons === 2 ? { maisons: 2 } : {};
  db = chargerBase();
  const role = roleCourant();
  sessionUid = ROLES_DEMO.find((r) => r.role === role)?.userId || 'demo-patron';

  const fetchReel = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    let url;
    try { url = new URL(input instanceof Request ? input.url : String(input), location.href); } catch { return fetchReel(input, init); }
    if (estSupabase(url)) return servir(url, input, init);
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/meteo') return repondreMeteo();
      return reponse(200, { error: 'Service indisponible dans la démo.' });
    }
    return fetchReel(input, init);
  };

  // XMLHttpRequest et sendBeacon : aucune sortie vers Supabase, par construction.
  const ouvrirReel = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function ouvrir(methode, adresse, ...reste) {
    const u = new URL(String(adresse), location.href);
    if (estSupabase(u)) throw new Error('Requête vers Supabase refusée par la démo.');
    return ouvrirReel.call(this, methode, adresse, ...reste);
  };
  if (navigator.sendBeacon) {
    const beaconReel = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (adresse, donnees) => (estSupabase(new URL(String(adresse), location.href)) ? false : beaconReel(adresse, donnees));
  }

  const WsReel = window.WebSocket;
  function WebSocketDemo(adresse, protocoles) {
    const u = new URL(String(adresse), location.href);
    if (estSupabase(u)) return new SocketDemo(adresse);
    return new WsReel(adresse, protocoles);
  }
  WebSocketDemo.prototype = WsReel.prototype;
  Object.assign(WebSocketDemo, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = WebSocketDemo;

  return { sessionUid, role };
}

export function sessionDemo() {
  return fabriquerSession(sessionUid);
}

export const ETAB_DEMO = ETAB;
