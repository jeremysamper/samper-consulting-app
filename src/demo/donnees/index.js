// Assemble la base de démonstration : une table par clé, des lignes au format
// de la base (snake_case), datées autour d'aujourd'hui.
import { ETABLISSEMENT, EQUIPE, ETAB } from './base.js';
import { FOURNISSEURS, PRODUITS, PRODUIT_FOURNISSEURS, PRODUIT_PRIX_HISTORIQUE } from './catalogue.js';
import { RECETTES, PLATS, PLAT_RECETTES, CARTES, CARTE_PLATS, FICHES_SALLE, CARTE_FICHES_SALLE } from './cuisine.js';
import {
  SALLES, SALLE_TABLES, SALLE_ELEMENTS, RESA_CLIENTS, GROUPE_MENUS, RESERVATION_EN_LIGNE_PARAMETRES,
  genererReservations, genererGroupes, genererPrevisions,
} from './salle.js';
import {
  PLANNING_GROUPES, PLANNING_GROUPE_MEMBRES, ABSENCES, CONTRATS_TRAVAIL, PLANNING_MODELES, genererShifts,
  HACCP_ZONES, HACCP_CRENEAUX, HACCP_CTRL_TEMPLATES, HACCP_TRACABILITE, ETIQUETTES_PERSO, genererHaccp,
  genererInventaires, PERTES, COMMANDE_ITEMS, MEP_LISTES, MEP_ITEMS, SOPS, DOCUMENTS, genererMessages,
  PROFILE_CONTACTS, POINTS_REGLAGES, POINTS_CADEAUX, genererPointsMouvements, COMPTA_REGLAGES, CHARGES_FIXES,
  genererAchats, genererVentesJour, SALAIRES_ESTIMES, genererJournal,
} from './operations.js';
import { genererCaisse, CARTE_VINS, CARTE_VINS_PLATS } from './caisse.js';
import { genererPos } from './pos.js';
import { empreinteDemo } from '../rpc.js';

// Codes de pointage de la brigade de démo (borne, lot L6) : Inès 4826,
// Sofia 5937, Hugo 3816. Seule l'empreinte est gardée, comme en base.
const CODES_POINTAGE = [['demo-cuisinier', '4826'], ['demo-serveur', '5937'], ['demo-cuis-2', '3816']]
  .map(([user_id, code]) => ({ user_id, etablissement_id: ETAB, code_empreinte: empreinteDemo(`${ETAB}:${code}`), maj_le: '2026-11-20T08:00:00Z' }));

const fournisseursEtab = FOURNISSEURS.map((f) => ({ ...f, etablissement_id: ETAB, actif: true, created_at: '2026-01-10T08:00:00Z', updated_at: '2026-01-10T08:00:00Z' }));

// Préférences déjà vues : la note de nouveautés et la carte d'activation des
// alertes ne s'ouvrent pas devant le visiteur.
function reglagesUtilisateurs() {
  const vues = { v: 1, vues: { '2026-11-maj': '2026-11-15T08:00:00Z', 'points-equipe': '2026-11-15T08:00:00Z' } };
  return EQUIPE.flatMap((u) => [
    { user_id: u.id, key: 'nouveautes_vues', value: vues, updated_at: '2026-11-15T08:00:00Z' },
    { user_id: u.id, key: 'alertes_carte', value: { plus_tard: '2099-01-01T00:00:00.000Z' }, updated_at: '2026-11-15T08:00:00Z' },
    { user_id: u.id, key: 'current_etab_id', value: ETAB, updated_at: '2026-11-15T08:00:00Z' },
    { user_id: u.id, key: `cartes_default:${ETAB}`, value: 'carte-automne', updated_at: '2026-11-15T08:00:00Z' },
  ]);
}

export function creerBase() {
  const { reservations, tags, liens } = genererReservations();
  const { releves, controles } = genererHaccp();
  const { plats_boissons: boissons, ...caisse } = genererCaisse();
  return {
    etablissements: [ETABLISSEMENT],
    profiles: EQUIPE.map((u) => ({ ...u })),
    profile_contacts: PROFILE_CONTACTS,
    permissions: [],
    permissions_utilisateurs: [],
    user_settings: reglagesUtilisateurs(),
    app_settings: [],
    fournisseurs: fournisseursEtab,
    produits: PRODUITS,
    produit_fournisseurs: PRODUIT_FOURNISSEURS,
    produit_prix_historique: PRODUIT_PRIX_HISTORIQUE,
    produit_alias: [],
    recettes: RECETTES,
    plats: [...PLATS, ...boissons],
    plat_recettes: PLAT_RECETTES,
    cartes: [...CARTES, CARTE_VINS],
    carte_plats: [...CARTE_PLATS, ...CARTE_VINS_PLATS],
    fiches_salle: FICHES_SALLE,
    carte_fiches_salle: CARTE_FICHES_SALLE,
    salles: SALLES,
    salle_tables: SALLE_TABLES,
    salle_elements: SALLE_ELEMENTS,
    salle_tables_service: [],
    resa_clients: RESA_CLIENTS,
    reservations,
    reservation_tags: tags,
    reservation_tables: liens,
    reservation_en_ligne_parametres: RESERVATION_EN_LIGNE_PARAMETRES,
    groupe_menus: GROUPE_MENUS,
    groupe_evenements: genererGroupes(),
    previsions_jour: genererPrevisions(reservations),
    planning_groupes: PLANNING_GROUPES,
    planning_groupe_membres: PLANNING_GROUPE_MEMBRES,
    planning_masques: [],
    planning_modeles: PLANNING_MODELES,
    pointage_postes: [],
    shifts: genererShifts(),
    absences: ABSENCES,
    contrats_travail: CONTRATS_TRAVAIL,
    echanges_horaires: [],
    haccp_zones: HACCP_ZONES,
    haccp_creneaux: HACCP_CRENEAUX,
    haccp_ctrl_templates: HACCP_CTRL_TEMPLATES,
    haccp_releves: releves,
    haccp_controls: controles,
    haccp_tracabilite: HACCP_TRACABILITE,
    etiquettes_perso: ETIQUETTES_PERSO,
    inventaires: genererInventaires(),
    pertes: PERTES,
    commande_items: COMMANDE_ITEMS,
    mep_listes: MEP_LISTES,
    mep_items: MEP_ITEMS,
    sops: SOPS,
    sop_executions: [],
    sop_step_states: [],
    kit_items: [],
    documents: DOCUMENTS,
    private_messages: genererMessages(),
    canaux_messages: [],
    consultant_messages: [],
    points_reglages: POINTS_REGLAGES,
    points_cadeaux: POINTS_CADEAUX,
    points_mouvements: genererPointsMouvements(),
    points_commandes: [],
    compta_reglages: COMPTA_REGLAGES,
    charges_fixes: CHARGES_FIXES,
    achats_documents: genererAchats(),
    achats_hausses_vues: [],
    salaires_estimes: SALAIRES_ESTIMES,
    releves_bancaires: [],
    releve_lignes: [],
    ventes_jour: genererVentesJour(),
    journal_activite: genererJournal(),
    demarrage_etapes: ['etablissement', 'recettes', 'catalogue', 'planning', 'exemple'].map((etape) => ({ etablissement_id: ETAB, etape, fait_le: '2026-03-01T08:00:00Z', fait_par: 'demo-patron' })),
    alert_rules: [],
    alert_instances: [],
    alert_reads: [],
    push_abonnements: [],
    traductions: [],
    temps_gagne: [],
    reglages_maison: [],
    bornes_pointage: [],
    bornes_pointage_essais: [],
    pointage_codes: CODES_POINTAGE,
    objectifs_maison: [],
    donnees_exemple: [],
    print_agents: [],
    print_jobs: [],
    pos_providers: [{ id: 'pp-lightspeed', slug: 'lightspeed', label: 'Lightspeed Restaurant' }],
    kds_orders: [],
    kds_order_items: [],
    factures_compteurs: [],
    scans_facture: [],
    ...caisse,
    ...genererPos(),
  };
}
