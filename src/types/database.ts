// ============================================================
// Types TypeScript — Sprint PRÉVISION + BRIGADE — J1
// Générés depuis la migration 20260520_sprint_prevision_brigade_j1.sql
// ============================================================

// ────────────────────────────────────────────────────────────────
// Enums (union types stricts)
// ────────────────────────────────────────────────────────────────

export type Service = 'midi' | 'soir' | 'brunch';

export type StatutReservation = 'confirme' | 'arrive' | 'parti' | 'no_show' | 'annule';

export type TypeTag = 'allergene' | 'regime' | 'occasion' | 'autre';

export type StatutBrigadeService = 'planifie' | 'en_cours' | 'termine';

export type Poste = 'chaud' | 'froid' | 'patisserie' | 'garde_manger';

export type StatutTache = 'todo' | 'en_cours' | 'termine';

export type StatutCommande = 'recue' | 'en_cuisson' | 'dressee' | 'sortie';

export type SourceVente = 'manuel' | 'lightspeed' | 'autre_pos';

// ────────────────────────────────────────────────────────────────
// Table : reservations
// ────────────────────────────────────────────────────────────────

export interface ReservationRow {
  id: string;
  etablissement_id: string;
  date_service: string; // ISO date "YYYY-MM-DD"
  service: Service;
  heure_arrivee: string; // HH:MM
  nb_couverts: number;
  nom: string;
  telephone: string | null;
  est_groupe: boolean;
  notes_libres: string | null;
  statut: StatutReservation;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationInsert {
  id?: string;
  etablissement_id: string;
  date_service: string;
  service: Service;
  heure_arrivee: string;
  nb_couverts: number;
  nom: string;
  telephone?: string | null;
  est_groupe?: boolean;
  notes_libres?: string | null;
  statut?: StatutReservation;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ReservationUpdate {
  etablissement_id?: string;
  date_service?: string;
  service?: Service;
  heure_arrivee?: string;
  nb_couverts?: number;
  nom?: string;
  telephone?: string | null;
  est_groupe?: boolean;
  notes_libres?: string | null;
  statut?: StatutReservation;
  updated_at?: string;
}

// ────────────────────────────────────────────────────────────────
// Table : reservation_tags
// ────────────────────────────────────────────────────────────────

export interface ReservationTagRow {
  id: string;
  reservation_id: string;
  type_tag: TypeTag;
  valeur: string;
  libre: boolean;
  created_at: string;
}

export interface ReservationTagInsert {
  id?: string;
  reservation_id: string;
  type_tag: TypeTag;
  valeur: string;
  libre?: boolean;
  created_at?: string;
}

export interface ReservationTagUpdate {
  type_tag?: TypeTag;
  valeur?: string;
  libre?: boolean;
}

// ────────────────────────────────────────────────────────────────
// Table : previsions_jour  (cache agrégat — lecture seule côté app)
// ────────────────────────────────────────────────────────────────

export interface PrevisionJourRow {
  id: string;
  etablissement_id: string;
  date_service: string; // ISO date "YYYY-MM-DD"
  couverts_midi: number;
  couverts_soir: number;
  couverts_brunch: number;
  nb_groupes: number;
  tags_critiques: string[];
  last_updated_at: string;
}

/** Rarement utilisé directement — la table est alimentée par triggers */
export interface PrevisionJourInsert {
  id?: string;
  etablissement_id: string;
  date_service: string;
  couverts_midi?: number;
  couverts_soir?: number;
  couverts_brunch?: number;
  nb_groupes?: number;
  tags_critiques?: string[];
  last_updated_at?: string;
}

export interface PrevisionJourUpdate {
  couverts_midi?: number;
  couverts_soir?: number;
  couverts_brunch?: number;
  nb_groupes?: number;
  tags_critiques?: string[];
  last_updated_at?: string;
}

// ────────────────────────────────────────────────────────────────
// Table : brigade_services
// ────────────────────────────────────────────────────────────────

export interface BrigadeServiceRow {
  id: string;
  etablissement_id: string;
  date: string; // ISO date "YYYY-MM-DD"
  couverts_prevus: number;
  couverts_realises: number | null;
  statut: StatutBrigadeService;
  debrief_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrigadeServiceInsert {
  id?: string;
  etablissement_id: string;
  date: string;
  couverts_prevus?: number; // auto-rempli par trigger si previsions_jour existe
  couverts_realises?: number | null;
  statut?: StatutBrigadeService;
  debrief_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BrigadeServiceUpdate {
  couverts_prevus?: number;
  couverts_realises?: number | null;
  statut?: StatutBrigadeService;
  debrief_notes?: string | null;
  updated_at?: string;
}

// ────────────────────────────────────────────────────────────────
// Table : brigade_taches
// ────────────────────────────────────────────────────────────────

export interface BrigadeTacheRow {
  id: string;
  service_id: string;
  recette_id: string | null;
  titre: string;
  description: string | null;
  poste: Poste;
  assignee_id: string | null;
  ordre: number;
  temps_estime_min: number | null;
  deadline: string | null; // ISO timestamptz
  statut: StatutTache;
  termine_at: string | null;
  photo_reference_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrigadeTacheInsert {
  id?: string;
  service_id: string;
  recette_id?: string | null;
  titre: string;
  description?: string | null;
  poste: Poste;
  assignee_id?: string | null;
  ordre?: number;
  temps_estime_min?: number | null;
  deadline?: string | null;
  statut?: StatutTache;
  termine_at?: string | null;
  photo_reference_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BrigadeTacheUpdate {
  recette_id?: string | null;
  titre?: string;
  description?: string | null;
  poste?: Poste;
  assignee_id?: string | null;
  ordre?: number;
  temps_estime_min?: number | null;
  deadline?: string | null;
  statut?: StatutTache;
  termine_at?: string | null;
  photo_reference_url?: string | null;
  updated_at?: string;
}

// ────────────────────────────────────────────────────────────────
// Table : brigade_commandes
// ────────────────────────────────────────────────────────────────

export interface BrigadeCommandeRow {
  id: string;
  service_id: string;
  table_numero: number | null;
  couvert_numero: number | null;
  recette_id: string;
  allergenes_actifs: string[];
  statut: StatutCommande;
  temps_recue_at: string;
  temps_sortie_at: string | null;
  created_at: string;
}

export interface BrigadeCommandeInsert {
  id?: string;
  service_id: string;
  table_numero?: number | null;
  couvert_numero?: number | null;
  recette_id: string;
  allergenes_actifs?: string[];
  statut?: StatutCommande;
  temps_recue_at?: string;
  temps_sortie_at?: string | null;
  created_at?: string;
}

export interface BrigadeCommandeUpdate {
  table_numero?: number | null;
  couvert_numero?: number | null;
  allergenes_actifs?: string[];
  statut?: StatutCommande;
  temps_sortie_at?: string | null;
}

// ────────────────────────────────────────────────────────────────
// Table : ventes_historique  (POS-ready)
// ────────────────────────────────────────────────────────────────

export interface VenteHistoriqueRow {
  id: string;
  etablissement_id: string;
  date_service: string;
  service: Service | null;
  recette_id: string;
  nb_vendus: number;
  source: SourceVente;
  synced_at: string;
}

export interface VenteHistoriqueInsert {
  id?: string;
  etablissement_id: string;
  date_service: string;
  service?: Service | null;
  recette_id: string;
  nb_vendus: number;
  source?: SourceVente;
  synced_at?: string;
}

export interface VenteHistoriqueUpdate {
  service?: Service | null;
  nb_vendus?: number;
  source?: SourceVente;
  synced_at?: string;
}

// ────────────────────────────────────────────────────────────────
// Retours des fonctions RPC
// ────────────────────────────────────────────────────────────────

/** Un jour dans la réponse de get_semaine_previsions() */
export interface PrevisionJourRPC {
  date_service: string;   // "YYYY-MM-DD"
  jour_semaine: string;   // "lundi" | "mardi" | … (locale PostgreSQL)
  couverts_midi: number;
  couverts_soir: number;
  couverts_brunch: number;
  nb_groupes: number;
  tags_critiques: string[];
  total_couverts: number;
}

/** Retour complet de get_semaine_previsions() */
export type SemainePrevisions = PrevisionJourRPC[];

/** Stats dans le retour de get_brigade_dashboard() */
export interface BrigadeDashboardStats {
  taches_total: number;
  taches_terminees: number;
  pct_avancement: number;
  commandes_recues: number;
  commandes_sorties: number;
  retards: number;
}

/** Retour complet de get_brigade_dashboard() */
export interface BrigadeDashboard {
  service: BrigadeServiceRow;
  taches_par_poste: {
    chaud: BrigadeTacheRow[];
    froid: BrigadeTacheRow[];
    patisserie: BrigadeTacheRow[];
    garde_manger: BrigadeTacheRow[];
  };
  commandes_en_cours: BrigadeCommandeRow[];
  stats: BrigadeDashboardStats;
}
