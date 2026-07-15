// ================================================================
// Types partagés entre pos-sync, pos-backfill et _shared modules
// ================================================================

/** Une ligne de vente brute telle que retournée par Lightspeed K-Series */
export interface SalesLine {
  /** Nom du plat (tel qu'affiché dans le POS) */
  name: string;
  /** SKU du plat — peut être null si non configuré dans LS */
  sku: string | null;
  /** Quantité vendue */
  qty: number;
  /** Prix unitaire en centimes (ex: 1850 = 18.50 CHF) */
  price: number;
  /** Timestamp UTC de la vente ISO 8601 (ex: "2026-05-22T22:45:00Z") */
  timestamp: string;
}

/** Vente agrégée par plat + date locale, prête pour upsert */
export interface AggregatedSale {
  /** Clé stable : sku si présent, sinon slugify(name) */
  key: string;
  /** Nom du plat tel que vu dans LS */
  name: string;
  /** Date locale au format "YYYY-MM-DD" (convertie depuis UTC) */
  date: string;
  /** Quantité totale vendue ce jour */
  qty: number;
  /** Revenu total en centimes */
  revenue_cts: number;
}

/** Connexion POS telle que lue depuis pos_connections (service_role) */
export interface PosConnection {
  id: string;
  etablissement_id: string;
  provider_id: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  status: string;
  ls_business_id: string | null;
  ls_business_location_id: string | null;
}

/** Établissement enrichi avec le champ timezone */
export interface EtablissementWithTz {
  id: string;
  nom: string;
  timezone: string;
}

/** Résultat d'un sync pour une connexion */
export interface SyncResult {
  connectionId: string;
  etablissementId: string;
  datesSynced: string[];
  itemsCount: number;
  salesCount: number;
  error?: string;
}

/** Location Lightspeed (pour le sélecteur multi-location) */
export interface LightspeedLocation {
  businessId: string;
  businessName: string;
  locationId: string;
  locationName: string;
}

// ══════════════════════════════════════════════════════════════════
// KDS (Kitchen Display System) — ingestion getCheck (Order API)
// ══════════════════════════════════════════════════════════════════

/** Modifier d'une ligne (getCheck salesEntries[].modifiers[]) */
export interface OpenCheckModifier {
  name: string;
  quantity: number;
}

/** Ligne de vente d'un check ouvert (getCheck salesEntries[]) */
export interface OpenCheckLine {
  /** Identité STABLE de la ligne (clé de diff). À confirmer par sonde. */
  uuid: string;
  id?: string;
  itemName: string;
  itemSku: string | null;
  quantity: number;
  modifiers: OpenCheckModifier[];
  timeOfTransactionUtc: string | null;
  /** false = ligne annulée (reste affichée, barrée) */
  active: boolean;
}

/** Un check (table) ouvert renvoyé par getCheck */
export interface OpenCheck {
  uuid: string;
  tableNumber: string | null;
  clientCount: number | null;
  openDate: string | null;
  salesEntries: OpenCheckLine[];
}

/** Snapshot minimal d'une ligne déjà en base (pour le diff) */
export interface ExistingItem {
  ls_line_key: string;
  content_hash: string | null;
  bump_status: string;
  active: boolean;
}

/** Ligne prête à être upsertée dans kds_order_items */
export interface KdsItemUpsert {
  ls_line_key: string;
  nom: string | null;
  sku: string | null;
  qty: number | null;
  modifiers: OpenCheckModifier[];
  fired_at: string | null;
  active: boolean;
  content_hash: string;
  /** true = re-fire : la ligne a changé alors qu'elle était bumpée → repasse pending */
  reset_bump: boolean;
}

/** Résultat du diff d'un check contre le snapshot en base */
export interface CheckDiff {
  order: {
    ls_check_uuid: string;
    table_no: string | null;
    couverts: number | null;
    opened_at: string | null;
  };
  /** lignes nouvelles ou modifiées à upserter */
  upserts: KdsItemUpsert[];
  /** ls_line_key des lignes disparues du check → active=false */
  voidedLineKeys: string[];
}
