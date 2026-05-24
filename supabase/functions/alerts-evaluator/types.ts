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

/** Résultat renvoyé par chaque evaluator */
export interface EvalResult {
  shouldFire: boolean;
  title?: string;
  message?: string;
  linkModule?: string; // 'planning' | 'haccp' | 'previsions' | 'inventaire' | 'pos' | 'pertes'
}
