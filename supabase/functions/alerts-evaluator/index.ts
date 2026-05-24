// ================================================================
// Edge Function « alerts-evaluator »
//
// Évalue toutes les règles d'alerte actives et crée/résout les
// instances en conséquence. Appelée par le cron Vercel toutes les
// heures (0 * * * *).
//
// Sécurité : verify_jwt=false — auth via header CRON_SECRET.
//
// POST body optionnel :
//   { ruleId?: string }   — évaluer une règle précise (debug)
// ================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createInstanceIfNeeded } from './helpers/create-instance.ts';
import { resolveStaleInstances } from './helpers/resolve-stale.ts';
import { evalPointage }       from './evaluators/pointage.ts';
import { evalHaccp }          from './evaluators/haccp.ts';
import { evalReservation }    from './evaluators/reservation.ts';
import { evalStock }          from './evaluators/stock.ts';
import { evalVentes }         from './evaluators/ventes.ts';
import { evalPertes }         from './evaluators/pertes.ts';
import { evalPersonnalisee }  from './evaluators/personnalisee.ts';
import type { AlertRule, EvalResult } from './types.ts';

// ── CORS ─────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ── Client admin ─────────────────────────────────────────────────
function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

// ── Dispatch évaluateur ───────────────────────────────────────────
async function evaluate(
  sb: ReturnType<typeof adminClient>,
  rule: AlertRule,
): Promise<EvalResult> {
  switch (rule.rule_type) {
    case 'pointage_manquant':        return evalPointage(sb, rule);
    case 'haccp_manquant':           return evalHaccp(sb, rule);
    case 'reservation_non_confirmee': return evalReservation(sb, rule);
    case 'stock_critique':           return evalStock(sb, rule);
    case 'ventes_inactives':         return evalVentes(sb, rule);
    case 'pertes_elevees':           return evalPertes(sb, rule);
    case 'personnalisee':            return evalPersonnalisee(sb, rule);
    default:
      console.warn(`[alerts] rule_type inconnu : ${rule.rule_type}`);
      return { shouldFire: false };
  }
}

// ── Vérification du planning journalier ──────────────────────────
/**
 * Pour les règles 'daily', vérifie si l'heure courante (UTC)
 * correspond à l'heure configurée dans schedule_time (stockée UTC).
 */
function shouldRunDaily(rule: AlertRule): boolean {
  if (!rule.schedule_time) return false;

  const now = new Date();
  const currentHourUtc = now.getUTCHours();
  const scheduleHour = parseInt(rule.schedule_time.split(':')[0], 10);

  if (currentHourUtc !== scheduleHour) return false;

  // Vérification du jour si schedule_days est défini
  if (rule.schedule_days && rule.schedule_days.length > 0) {
    // JS getUTCDay() : 0=Dim, 1=Lun … 6=Sam → convertir en ISO 1=Lun…7=Dim
    const jsDay = now.getUTCDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    if (!rule.schedule_days.includes(isoDay)) return false;
  }

  return true;
}

// ── Handler principal ────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Vérification CRON_SECRET
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') ?? '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return json({ error: 'Unauthorized' }, 401);
    }
  }

  const sb = adminClient();

  // Body optionnel — permet de cibler une règle précise en debug
  let ruleIdFilter: string | undefined;
  try {
    const body = await req.json();
    ruleIdFilter = body?.ruleId;
  } catch { /* body vide = ok */ }

  // Chargement des règles actives
  let query = sb
    .from('alert_rules')
    .select('*')
    .eq('is_active', true);
  if (ruleIdFilter) query = query.eq('id', ruleIdFilter);

  const { data: rules, error: rulesErr } = await query;
  if (rulesErr) {
    console.error('[alerts] chargement des règles :', rulesErr.message);
    return json({ error: rulesErr.message }, 500);
  }

  const results: Array<{
    ruleId: string;
    name: string;
    action: 'fired' | 'resolved' | 'skipped' | 'error';
  }> = [];

  for (const rule of (rules as AlertRule[])) {
    try {
      // Filtrage horaire pour les règles daily
      if (rule.schedule_type === 'daily' && !shouldRunDaily(rule)) {
        results.push({ ruleId: rule.id, name: rule.name, action: 'skipped' });
        continue;
      }

      const result = await evaluate(sb, rule);

      if (result.shouldFire) {
        await createInstanceIfNeeded({
          sb,
          ruleId:          rule.id,
          etablissementId: rule.etablissement_id,
          title:           result.title ?? rule.name,
          message:         result.message ?? '',
          severity:        rule.severity,
          linkModule:      result.linkModule ?? null,
          targetRoles:     rule.target_roles ?? ['consultant', 'patron'],
        });
        results.push({ ruleId: rule.id, name: rule.name, action: 'fired' });
      } else {
        // Condition redevenue fausse → résoudre les instances actives
        await resolveStaleInstances(sb, rule.id);
        results.push({ ruleId: rule.id, name: rule.name, action: 'resolved' });
      }

      // Mise à jour last_evaluated_at (+ last_triggered_at si fired)
      const nowIso = new Date().toISOString();
      const update: Record<string, string> = { last_evaluated_at: nowIso };
      if (result.shouldFire) update.last_triggered_at = nowIso;
      await sb.from('alert_rules').update(update).eq('id', rule.id);

    } catch (err) {
      console.error(`[alerts] rule ${rule.id} erreur :`, err);
      results.push({ ruleId: rule.id, name: rule.name, action: 'error' });
    }
  }

  const fired    = results.filter((r) => r.action === 'fired').length;
  const resolved = results.filter((r) => r.action === 'resolved').length;
  const skipped  = results.filter((r) => r.action === 'skipped').length;

  console.log(
    `[alerts] évaluation terminée — ${fired} fired, ${resolved} resolved, ${skipped} skipped`,
  );

  return json({ ok: true, fired, resolved, skipped, details: results });
});
