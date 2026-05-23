// ================================================================
// Edge Function « pos-backfill »
//
// Importe l'historique des ventes pour une connexion POS sur N jours.
// Déclenchée manuellement via le bouton "Importer l'historique" dans
// PosIntegrationsCard.jsx.
//
// POST body :
//   { connectionId: string, days?: number (défaut 14, max 90), dryRun?: boolean }
//
// Réponse en streaming JSON-ND (ndjson) pour afficher la progression :
//   { progress: { done: N, total: N, date: "YYYY-MM-DD" } }
//   { result: { daysProcessed, itemsTotal, salesTotal, errors: [] } }
//
// Alternative simple (non-streaming) : retourne le résultat final quand terminé.
// verify_jwt=true : appelé par l'utilisateur connecté.
// ================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchSalesLines } from '../_shared/lightspeed-client.ts';
import { aggregateSalesLines } from '../_shared/aggregate.ts';
import { upsertItemsAndSales } from '../_shared/upsert.ts';
import { localDateToUtcRange, utcToLocalDateString } from '../_shared/timezone.ts';
import type { PosConnection, EtablissementWithTz } from '../_shared/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const env = (name: string): string | undefined =>
  Deno.env.get(name)?.trim().replace(/^["']|["']$/g, '').trim();

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
}

function userClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

async function refreshAccessToken(
  refreshToken: string,
  lsEnv: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const clientId     = env('LS_CLIENT_ID')!;
  const clientSecret = env('LS_CLIENT_SECRET')!;
  const tokenUrl = lsEnv === 'prod'
    ? 'https://auth.lsk-prod.app/realms/k-series/protocol/openid-connect/token'
    : 'https://auth.lsk-demo.app/realms/k-series/protocol/openid-connect/token';

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST requis' }, 405);

  // Auth utilisateur
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Non authentifié' }, 401);

  const userSupa = userClient(authHeader);
  const { data: { user }, error: authErr } = await userSupa.auth.getUser();
  if (authErr || !user) return json({ error: 'Session invalide' }, 401);

  // Body
  let body: { connectionId?: string; days?: number; dryRun?: boolean };
  try { body = await req.json(); } catch { return json({ error: 'Body invalide' }, 400); }

  const { connectionId, days = 14, dryRun = false } = body;
  if (!connectionId) return json({ error: 'connectionId requis' }, 400);
  if (days < 1 || days > 90) return json({ error: 'days doit être entre 1 et 90' }, 400);

  const lsEnv = env('LS_ENV') ?? 'demo';
  const admin = adminClient();

  // Charger la connexion
  const { data: conn, error: connErr } = await admin
    .from('pos_connections')
    .select('id, etablissement_id, provider_id, access_token_enc, refresh_token_enc, token_expires_at, status, ls_business_id, ls_business_location_id')
    .eq('id', connectionId)
    .single() as { data: PosConnection | null; error: unknown };

  if (connErr || !conn) return json({ error: 'Connexion introuvable' }, 404);
  if (conn.status !== 'connected') return json({ error: 'Connexion non active' }, 400);

  // Charger timezone
  const { data: etab } = await admin
    .from('etablissements')
    .select('id, nom, timezone')
    .eq('id', conn.etablissement_id)
    .single() as { data: EtablissementWithTz | null };

  const timezone = etab?.timezone ?? 'Europe/Zurich';

  // Refresh token si nécessaire (avant le long backfill)
  let accessToken = conn.access_token_enc ?? '';
  if (!dryRun) {
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
    const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 300_000;
    if (needsRefresh && conn.refresh_token_enc) {
      const refreshed = await refreshAccessToken(conn.refresh_token_enc, lsEnv);
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await admin.from('pos_connections').update({
        access_token_enc:  refreshed.access_token,
        refresh_token_enc: refreshed.refresh_token,
        token_expires_at:  newExpiry,
      }).eq('id', conn.id);
    }
  }

  const locationId = conn.ls_business_location_id ?? '';
  if (!dryRun && !locationId) {
    return json({ error: 'ls_business_location_id non configuré' }, 400);
  }

  // ── Backfill : traiter chaque jour J-1 … J-N ─────────────────
  const results: Array<{
    date: string;
    itemsCount: number;
    salesCount: number;
    error?: string;
  }> = [];

  const today = new Date();

  for (let i = 1; i <= days; i++) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const localDate = utcToLocalDateString(d.toISOString(), timezone);

    try {
      // Log running
      const { data: log } = await admin
        .from('pos_sync_logs')
        .insert({ connection_id: conn.id, status: 'running', date_synced: localDate })
        .select('id')
        .single() as { data: { id: string } | null };

      const { from, to } = localDateToUtcRange(localDate, timezone);
      const lines = await fetchSalesLines(accessToken, locationId, from, to, lsEnv, dryRun);
      const aggregated = aggregateSalesLines(lines, timezone);
      const { itemsCount, salesCount } = await upsertItemsAndSales(admin, conn.id, aggregated);

      // Finaliser log
      if (log?.id) {
        await admin.from('pos_sync_logs').update({
          status:      'success',
          finished_at: new Date().toISOString(),
          items_count: itemsCount,
          sales_count: salesCount,
        }).eq('id', log.id);
      }

      results.push({ date: localDate, itemsCount, salesCount });
      console.log(`[pos-backfill] ${localDate} → items=${itemsCount} sales=${salesCount}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[pos-backfill] ${localDate} erreur:`, msg);
      results.push({ date: localDate, itemsCount: 0, salesCount: 0, error: msg });
    }
  }

  // Mettre à jour last_sync_at
  await admin.from('pos_connections').update({
    last_sync_at: new Date().toISOString(),
  }).eq('id', conn.id);

  const errors   = results.filter((r) => r.error);
  const success  = results.filter((r) => !r.error);
  const totItems = success.reduce((s, r) => s + r.itemsCount, 0);
  const totSales = success.reduce((s, r) => s + r.salesCount, 0);

  return json({
    daysProcessed: success.length,
    daysErrored:   errors.length,
    itemsTotal:    totItems,
    salesTotal:    totSales,
    errors:        errors.map((r) => ({ date: r.date, error: r.error })),
    details:       results,
  });
});
