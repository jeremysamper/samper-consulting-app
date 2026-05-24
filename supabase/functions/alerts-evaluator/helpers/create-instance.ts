// ================================================================
// helpers/create-instance.ts
//
// Crée une instance d'alerte si aucune instance active n'existe
// déjà pour cette règle. Idempotent — safe à appeler à chaque tick.
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

interface CreateInstanceParams {
  sb: SupabaseClient;
  ruleId: string;
  etablissementId: string;
  title: string;
  message: string;
  severity: string;
  linkModule?: string | null;
  targetRoles?: string[];
}

/**
 * Vérifie s'il existe une instance active pour cette règle.
 * Si non → insère une nouvelle instance.
 * Si oui → ne fait rien (déduplication).
 */
export async function createInstanceIfNeeded(
  params: CreateInstanceParams,
): Promise<void> {
  const { sb, ruleId, etablissementId, title, message, severity, linkModule, targetRoles } =
    params;

  // Vérification idempotente
  const { data: existing } = await sb
    .from('alert_instances')
    .select('id')
    .eq('rule_id', ruleId)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) return; // Instance active déjà présente — pas de doublon

  const { error } = await sb.from('alert_instances').insert({
    rule_id:          ruleId,
    etablissement_id: etablissementId,
    title,
    message,
    severity,
    link_module:   linkModule ?? null,
    target_roles:  targetRoles ?? ['consultant', 'patron'],
    status:        'active',
  });

  if (error) {
    console.error(`[alerts] createInstanceIfNeeded rule=${ruleId}:`, error.message);
  }
}
