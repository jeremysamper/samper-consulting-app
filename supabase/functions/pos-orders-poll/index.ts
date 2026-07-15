// ════════════════════════════════════════════════════════════════
// Edge Function « pos-orders-poll » — ingestion KDS depuis Lightspeed.
//
// Déclenchement : invoquée par l'écran KDS toutes les ~15 s tant qu'il est
//   monté (supabase.functions.invoke). verify_jwt=true. AUCUN cron.
//
// Rôle : polling de getCheck (Order API, scope orders-api) -> diff des
//   salesEntries contre le snapshot en base -> upsert idempotent dans
//   kds_orders / kds_order_items. Clôture des checks disparus.
//
// POST body :
//   { etablissementId?: string, connectionId?: string, dryRun?: boolean }
//   - fournir etablissementId OU connectionId (etablissementId privilégié).
//   - dryRun (ou env POS_ORDERS_POLL_DRY_RUN=true) : charge la fixture,
//     calcule et RENVOIE le plan, N'ÉCRIT RIEN (aucun appel Lightspeed).
//
// Sécurité : garde IDOR (profiles.etablissement_ids) + rôle cuisine, comme
//   pos-backfill. Tokens jamais loggés. OAuth/refresh réutilisés de _shared.
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchOpenChecks, normalizeOpenChecks, refreshAccessToken } from '../_shared/lightspeed-client.ts';
import { computeCheckDiff } from './diff.ts';
import type { PosConnection, OpenCheck, ExistingItem } from '../_shared/types.ts';

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

const KITCHEN_ROLES = ['consultant', 'resp_cuisine', 'cuisinier'];

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

function userClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

/** Fixture locale (dry-run) — chemin relatif à CE fichier (robuste). */
async function loadFixture(): Promise<OpenCheck[]> {
  const url = new URL('./__fixtures__/getcheck_sample.json', import.meta.url);
  const text = await Deno.readTextFile(url);
  return normalizeOpenChecks(JSON.parse(text));
}

/** Détecte un refus de scope (token financial-api au lieu d'orders-api). */
function isScopeError(msg: string): boolean {
  return /\b(401|403)\b/.test(msg);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST requis' }, 405);

  // ── Auth utilisateur ────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Non authentifié' }, 401);
  const { data: { user }, error: authErr } = await userClient(authHeader).auth.getUser();
  if (authErr || !user) return json({ error: 'Session invalide' }, 401);

  // ── Body ─────────────────────────────────────────────────────────
  let body: { etablissementId?: string; connectionId?: string; dryRun?: boolean };
  try { body = await req.json(); } catch { return json({ error: 'Body invalide' }, 400); }

  const dryRun = body.dryRun ?? env('POS_ORDERS_POLL_DRY_RUN') === 'true';
  const lsEnv = env('LS_ENV') ?? 'demo';
  const admin = adminClient();

  // ── Résolution de la connexion / établissement cible ─────────────
  let conn: PosConnection | null = null;
  let etablissementId = body.etablissementId ?? '';

  if (body.connectionId) {
    const { data } = await admin
      .from('pos_connections')
      .select('id, etablissement_id, provider_id, access_token_enc, refresh_token_enc, token_expires_at, status, ls_business_id, ls_business_location_id')
      .eq('id', body.connectionId)
      .maybeSingle() as { data: PosConnection | null };
    conn = data;
    if (conn) etablissementId = conn.etablissement_id;
  } else if (etablissementId) {
    const { data: provider } = await admin
      .from('pos_providers').select('id').eq('slug', 'lightspeed').maybeSingle();
    if (provider) {
      const { data } = await admin
        .from('pos_connections')
        .select('id, etablissement_id, provider_id, access_token_enc, refresh_token_enc, token_expires_at, status, ls_business_id, ls_business_location_id')
        .eq('etablissement_id', etablissementId)
        .eq('provider_id', (provider as { id: string }).id)
        .maybeSingle() as { data: PosConnection | null };
      conn = data;
    }
  }

  if (!etablissementId) return json({ error: 'etablissementId ou connectionId requis' }, 400);

  // ── Garde IDOR + rôle (le service_role bypass la RLS : on filtre ici) ──
  const { data: prof, error: profErr } = await admin
    .from('profiles').select('role, etablissement_ids').eq('id', user.id).maybeSingle();
  if (profErr) return json({ error: `Profil illisible : ${profErr.message}` }, 500);
  const callerEtabs: string[] = Array.isArray(prof?.etablissement_ids) ? prof!.etablissement_ids : [];
  if (!callerEtabs.includes(etablissementId)) return json({ error: 'Accès refusé pour cet établissement' }, 403);
  if (!KITCHEN_ROLES.includes(prof?.role)) return json({ error: 'Rôle non autorisé' }, 403);

  // ── Dry-run : plan depuis la fixture, AUCUN write, aucun appel LS ──
  if (dryRun) {
    const checks = await loadFixture();
    const plan = checks.map((c) => computeCheckDiff(c, []));
    return json({
      dryRun: true,
      etablissementId,
      checks: checks.length,
      plannedUpserts: plan.reduce((s, d) => s + d.upserts.length, 0),
      plan,
    });
  }

  // ── Flux réel : nécessite une connexion active ────────────────────
  if (!conn) return json({ error: 'Aucune connexion Lightspeed pour cet établissement' }, 404);
  if (conn.status !== 'connected') return json({ error: 'Connexion Lightspeed non active' }, 400);

  const locationId = conn.ls_business_location_id ?? '';
  if (!locationId) return json({ error: 'ls_business_location_id non configuré' }, 400);

  // ── Refresh token si nécessaire (réutilise le refresh partagé) ────
  let accessToken = conn.access_token_enc ?? '';
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 300_000;
  if (needsRefresh) {
    if (!conn.refresh_token_enc) return json({ error: 'Refresh token manquant — reconnexion nécessaire', needs_reconnect: true }, 401);
    try {
      const refreshed = await refreshAccessToken(conn.refresh_token_enc, env('LS_CLIENT_ID')!, env('LS_CLIENT_SECRET')!, lsEnv);
      accessToken = refreshed.access_token;
      await admin.from('pos_connections').update({
        access_token_enc: refreshed.access_token,
        refresh_token_enc: refreshed.refresh_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        status: 'connected', last_error: null,
      }).eq('id', conn.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from('pos_connections').update({ status: 'error', last_error: msg }).eq('id', conn.id).catch(() => {});
      return json({ error: 'Token expiré — reconnexion nécessaire', needs_reconnect: true }, 401);
    }
  }

  // ── Fetch getCheck (backoff 429/5xx dans le client) ───────────────
  let checks: OpenCheck[];
  try {
    checks = await fetchOpenChecks(accessToken, locationId, lsEnv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isScopeError(msg)) {
      return json({ error: 'Reconnexion requise avec le scope orders-api', needs_reconnect: true, scope: 'orders-api' }, 403);
    }
    return json({ error: `getCheck: ${msg}` }, 502);
  }

  // ── Diff + upsert idempotent, check par check ─────────────────────
  let inserted = 0, refired = 0, voided = 0;

  for (const check of checks) {
    // 1. upsert de l'en-tête de commande (onConflict ls_check_uuid) -> id
    const { data: orderRow, error: orderErr } = await admin
      .from('kds_orders')
      .upsert({
        etablissement_id: etablissementId,
        ls_check_uuid: check.uuid,
        table_no: check.tableNumber,
        couverts: check.clientCount,
        opened_at: check.openDate,
        status: 'open',
      }, { onConflict: 'ls_check_uuid' })
      .select('id')
      .single();
    if (orderErr || !orderRow) { console.error('[pos-orders-poll] upsert kds_orders:', orderErr?.message); continue; }
    const orderId = (orderRow as { id: string }).id;

    // 2. snapshot des lignes existantes de CE check
    const { data: existRows } = await admin
      .from('kds_order_items')
      .select('ls_line_key, content_hash, bump_status, active')
      .eq('kds_order_id', orderId);
    const existing = (existRows ?? []) as ExistingItem[];

    // 3. diff pur
    const diff = computeCheckDiff(check, existing);

    // 4. upsert des lignes nouvelles/modifiées (bump_status hors payload -> préservé)
    if (diff.upserts.length) {
      const rows = diff.upserts.map((u) => ({
        kds_order_id: orderId,
        ls_line_key: u.ls_line_key,
        nom: u.nom,
        sku: u.sku,
        qty: u.qty,
        modifiers: u.modifiers,
        fired_at: u.fired_at,
        active: u.active,
        content_hash: u.content_hash,
      }));
      const { error: upErr } = await admin
        .from('kds_order_items')
        .upsert(rows, { onConflict: 'ls_line_key', ignoreDuplicates: false });
      if (upErr) { console.error('[pos-orders-poll] upsert kds_order_items:', upErr.message); continue; }
      inserted += diff.upserts.length;

      // 5. re-fire : lignes modifiées alors qu'elles étaient bumpées -> repasse pending
      const resetKeys = diff.upserts.filter((u) => u.reset_bump).map((u) => u.ls_line_key);
      if (resetKeys.length) {
        await admin.from('kds_order_items')
          .update({ bump_status: 'pending', bumped_at: null, bumped_by: null })
          .in('ls_line_key', resetKeys);
        refired += resetKeys.length;
      }
    }

    // 6. lignes disparues -> annulées (active=false, hash nul pour redétecter un retour)
    if (diff.voidedLineKeys.length) {
      await admin.from('kds_order_items')
        .update({ active: false, content_hash: null })
        .in('ls_line_key', diff.voidedLineKeys);
      voided += diff.voidedLineKeys.length;
    }
  }

  // ── Clôture : commandes open de l'établissement absentes du poll ──
  let closed = 0;
  const incoming = new Set(checks.map((c) => c.uuid));
  const { data: openOrders } = await admin
    .from('kds_orders').select('id, ls_check_uuid')
    .eq('etablissement_id', etablissementId).eq('status', 'open');
  const toClose = (openOrders ?? [])
    .filter((o) => !incoming.has((o as { ls_check_uuid: string }).ls_check_uuid))
    .map((o) => (o as { id: string }).id);
  if (toClose.length) {
    await admin.from('kds_orders').update({ status: 'closed' }).in('id', toClose);
    closed = toClose.length;
  }

  console.log(`[pos-orders-poll] etab=${etablissementId} checks=${checks.length} upserts=${inserted} refired=${refired} voided=${voided} closed=${closed}`);
  return json({ etablissementId, checks: checks.length, upserts: inserted, refired, voided, closed });
});
