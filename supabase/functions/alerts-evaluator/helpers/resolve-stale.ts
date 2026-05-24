// ================================================================
// helpers/resolve-stale.ts
//
// Résout les instances actives d'une règle dont la condition est
// redevenue fausse (ex: tout le monde a pointé → plus d'alerte).
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Met à jour toutes les instances actives de la règle vers 'resolved'.
 * Ne touche pas aux instances 'dismissed' — l'utilisateur les a déjà vues.
 */
export async function resolveStaleInstances(
  sb: SupabaseClient,
  ruleId: string,
): Promise<void> {
  const { error } = await sb
    .from('alert_instances')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('rule_id', ruleId)
    .eq('status', 'active');

  if (error) {
    console.error(`[alerts] resolveStaleInstances rule=${ruleId}:`, error.message);
  }
}
