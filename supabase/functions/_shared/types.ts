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
