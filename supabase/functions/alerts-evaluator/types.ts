// ================================================================
// Types locaux pour alerts-evaluator
// ================================================================

/** Règle d'alerte telle que lue depuis alert_rules (service_role) */
export interface AlertRule {
  id: string;
  etablissement_id: string;
  name: string;
  description?: string | null;
  rule_type: string;
  // Discriminant : 'pointage_manquant' | 'haccp_manquant' | 'reservation_non_confirmee'
  //              | 'stock_critique' | 'ventes_inactives' | 'pertes_elevees' | 'personnalisee'
  rule_config: Record<string, unknown>;
  severity: string;          // 'info' | 'warning' | 'critical'
  schedule_type: string;     // 'hourly' | 'daily'
  schedule_time: string | null; // "HH:MM:SS" (PostgreSQL time, UTC)
  schedule_days: number[] | null; // 1=Lun … 7=Dim ; null = tous les jours
  target_roles: string[] | null;  // défaut : ['consultant', 'patron']
}

/**
 * Une alerte à créer. Un evaluator peut en produire plusieurs pour une
 * même règle (un employé qui n'a pas pointé, une zone HACCP sans relevé…).
 */
export interface AlertItem {
  /**
   * Sujet de l'alerte - porte l'idempotence ET la résolution automatique :
   * une instance active dont la clé ne ressort plus de l'évaluation est
   * résolue. Ex: "shift:sh-123", "zone:z1778761664397".
   * null = une seule instance active par règle (comportement historique).
   */
  dedupeKey?: string | null;
  title: string;
  message: string;
  linkModule?: string; // 'planning' | 'haccp' | 'previsions' | 'inventaire' | 'pos' | 'pertes'
  /** Destinataires nominatifs (auth.users.id), en plus des rôles de la règle. */
  targetUserIds?: string[];
}

/** Résultat renvoyé par chaque evaluator */
export interface EvalResult {
  shouldFire: boolean;
  /** Forme simple : une seule alerte, sans sujet. */
  title?: string;
  message?: string;
  linkModule?: string;
  /** Forme détaillée : une alerte par sujet. Prioritaire sur title/message. */
  items?: AlertItem[];
}
