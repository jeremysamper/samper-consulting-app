// ================================================================
// Edge Function « pos-sync »
//
// Synchronise les ventes Lightspeed K-Series pour toutes les
// connexions POS actives. Appelé par le cron Vercel à 04:00 UTC.
//
// Sécurité : verify_jwt=false, auth via CRON_SECRET header.
//
// Mode dry-run : body { dryRun: true } ou env POS_SYNC_DRY_RUN=true
//   → utilise la fixture salesLines_sample.json, aucun appel LS.
//
// POST body (optionnel) :
//   { date?: "YYYY-MM-DD", dryRun?: boolean, connectionId?: string }
//   - date       : forcer une date locale à syncer (défaut : hier)
//   - dryRun     : mode test sans appels LS
//   - connectionId : syncer une seule connexion
// ================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchSalesLines } from '../_shared/lightspeed-client.ts';
import { aggregateSalesLines } from '../_shared/aggregate.ts';
import { upsertItemsAndSales } from '../_shared/upsert.ts';
import { localDateToUtcRange, utcToLocalDateString } from '../_shared/timezone.ts';
import type { PosConnection, EtablissementWithTz, SyncResult } from '../_shared/types.ts';

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

// ── Refresh access_token ──────────────────────────────────────────
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

// ── Sync d'une connexion pour une date donnée ─────────────────────
async function syncConnection(
  admin: ReturnType<typeof adminClient>,
  conn: PosConnection,
  localDate: string,     // "YYYY-MM-DD" date locale à syncer
  lsEnv: string,
  dryRun: boolean
): Promise<SyncResult> {
  const logId = await insertSyncLog(admin, conn.id, localDate);

  try {
    // 1. Récupérer le timezone de l'établissement
    const { data: etab } = await admin
      .from('etablissements')
      .select('id, nom, timezone')
      .eq('id', conn.etablissement_id)
      .single() as { data: EtablissementWithTz | null };

    const timezone = etab?.timezone ?? 'Europe/Zurich';

    // 2. Refresh du token si nécessaire
    let accessToken = conn.access_token_enc ?? '';
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
    const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 300_000;

    if (!dryRun && needsRefresh) {
      if (!conn.refresh_token_enc) {
        throw new Error('Refresh token manquant - reconnexion nécessaire');
      }
      const refreshed = await refreshAccessToken(conn.refresh_token_enc, lsEnv);
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await admin.from('pos_connections').update({
        access_token_enc:  refreshed.access_token,
        refresh_token_enc: refreshed.refresh_token,
        token_expires_at:  newExpiry,
        status:            'connected',
        last_error:        null,
      }).eq('id', conn.id);
    }

    // 3. Calculer les bornes UTC de la journée locale
    const { from, to } = localDateToUtcRange(localDate, timezone);

    // 4. Récupérer les salesLines
    const locationId = conn.ls_business_location_id ?? '';
    if (!dryRun && !locationId) {
      throw new Error('ls_business_location_id non configuré - sélectionner la location dans les paramètres');
    }

    const lines = await fetchSalesLines(
      accessToken,
      locationId,
      from,
      to,
      lsEnv,
      dryRun
    );

    console.log(`[pos-sync] conn=${conn.id} date=${localDate} → ${lines.length} lignes brutes`);

    // 5. Agréger
    const aggregated = aggregateSalesLines(lines, timezone);

    // 6. Upsert
    const { itemsCount, salesCount } = await upsertItemsAndSales(admin, conn.id, aggregated);

    // 7. Mettre à jour pos_connections.last_sync_at
    await admin.from('pos_connections').update({
      last_sync_at: new Date().toISOString(),
      status:       'connected',
      last_error:   null,
    }).eq('id', conn.id);

    // 8. Finaliser le log
    await updateSyncLog(admin, logId, 'success', itemsCount, salesCount);

    return {
      connectionId:  conn.id,
      etablissementId: conn.etablissement_id,
      datesSynced:   [localDate],
      itemsCount,
      salesCount,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pos-sync] Erreur connexion ${conn.id}:`, msg);

    // Marquer la connexion en erreur
    await admin.from('pos_connections').update({
      status:     'error',
      last_error: msg,
    }).eq('id', conn.id).catch(() => {});

    // Finaliser le log en erreur
    await updateSyncLog(admin, logId, 'error', 0, 0, msg).catch(() => {});

    return {
      connectionId:  conn.id,
      etablissementId: conn.etablissement_id,
      datesSynced:   [],
      itemsCount:    0,
      salesCount:    0,
      error:         msg,
    };
  }
}

// ── Helpers log ───────────────────────────────────────────────────
async function insertSyncLog(
  admin: ReturnType<typeof adminClient>,
  connectionId: string,
  dateSynced: string
): Promise<string> {
  const { data, error } = await admin
    .from('pos_sync_logs')
    .insert({ connection_id: connectionId, status: 'running', date_synced: dateSynced })
    .select('id')
    .single();
  if (error) {
    console.error('[pos-sync] insertSyncLog error:', error.message);
    return 'unknown';
  }
  return (data as { id: string }).id;
}

async function updateSyncLog(
  admin: ReturnType<typeof adminClient>,
  logId: string,
  status: 'success' | 'error',
  itemsCount: number,
  salesCount: number,
  errorMessage?: string
): Promise<void> {
  if (logId === 'unknown') return;
  await admin.from('pos_sync_logs').update({
    status,
    finished_at:   new Date().toISOString(),
    items_count:   itemsCount,
    sales_count:   salesCount,
    error_message: errorMessage ?? null,
  }).eq('id', logId);
}

// ── Handler principal ─────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST requis' }, 405);

  // Auth via CRON_SECRET
  const cronSecret = env('CRON_SECRET');
  const authHeader = req.headers.get('Authorization') ?? '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Body optionnel
  let body: { date?: string; dryRun?: boolean; connectionId?: string } = {};
  try { body = await req.json(); } catch { /* body vide = ok */ }

  const globalDryRun = body.dryRun ?? env('POS_SYNC_DRY_RUN') === 'true';
  const lsEnv = env('LS_ENV') ?? 'demo';
  const admin = adminClient();

  // Date à syncer : paramètre, ou hier (jour local UTC-safe : on prend J-1 en UTC)
  let targetDate = body.date;
  if (!targetDate) {
    const yesterday = new Date(Date.now() - 86_400_000);
    targetDate = utcToLocalDateString(yesterday.toISOString(), 'UTC'); // "YYYY-MM-DD" en UTC, converti par chaque connexion
    // Note : on stocke la date UTC J-1 et chaque connexion recalcule ses bornes avec son propre TZ
  }

  // Charger les connexions à syncer
  let query = admin
    .from('pos_connections')
    .select('id, etablissement_id, provider_id, access_token_enc, refresh_token_enc, token_expires_at, status, ls_business_id, ls_business_location_id')
    .eq('status', 'connected');

  if (body.connectionId) {
    query = query.eq('id', body.connectionId) as typeof query;
  }

  const { data: connections, error: connErr } = await query;

  if (connErr) return json({ error: `DB error: ${connErr.message}` }, 500);
  if (!connections || connections.length === 0) {
    return json({ message: 'Aucune connexion active', synced: 0, errors: 0 });
  }

  console.log(`[pos-sync] Démarrage - ${connections.length} connexion(s) - date=${targetDate} dryRun=${globalDryRun}`);

  // Sync en parallèle (Promise.allSettled → une erreur n'arrête pas les autres)
  const results = await Promise.allSettled(
    (connections as PosConnection[]).map((conn) =>
      syncConnection(admin, conn, targetDate!, lsEnv, globalDryRun)
    )
  );

  const summary = {
    synced:     0,
    errors:     0,
    totalItems: 0,
    totalSales: 0,
    details:    [] as Array<SyncResult & { settled: string }>,
  };

  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.error) {
        summary.errors++;
      } else {
        summary.synced++;
        summary.totalItems += r.value.itemsCount;
        summary.totalSales += r.value.salesCount;
      }
      summary.details.push({ ...r.value, settled: 'fulfilled' });
    } else {
      summary.errors++;
      summary.details.push({
        connectionId:  'unknown',
        etablissementId: 'unknown',
        datesSynced:   [],
        itemsCount:    0,
        salesCount:    0,
        error:         r.reason instanceof Error ? r.reason.message : String(r.reason),
        settled:       'rejected',
      });
    }
  }

  console.log(`[pos-sync] Terminé - synced=${summary.synced} errors=${summary.errors}`);
  return json(summary);
});
