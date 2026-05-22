// ════════════════════════════════════════════════════════════════
// Edge function « pos-oauth » — OAuth2 Lightspeed K-Series.
//
// Sécurité : tokens JAMAIS exposés côté client.
//   • Cette fonction s'exécute avec SUPABASE_SERVICE_ROLE_KEY →
//     bypasse le RLS pour écrire/lire les tokens.
//   • Le client reçoit uniquement status / last_sync_at / last_error.
//
// Secrets requis (Supabase Dashboard → Edge Functions → Manage secrets) :
//   LS_CLIENT_ID      — Client ID de l'app Lightspeed
//   LS_CLIENT_SECRET  — Client Secret
//   LS_REDIRECT_URI   — https://<project>.supabase.co/functions/v1/pos-oauth
//   LS_ENV            — 'demo' (défaut) | 'prod'
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.
//
// Endpoints exposés :
//   GET  ?code=&state=     → callback OAuth2 (Lightspeed redirige ici)
//   POST { action: 'get_auth_url',  etablissementId, providerId }
//   POST { action: 'status',        etablissementId, providerId }
//   POST { action: 'test',          etablissementId, providerId }
//   POST { action: 'disconnect',    etablissementId, providerId }
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ── Helpers ──────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const env = (name: string): string => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Secret manquant : ${name}`);
  return v.trim().replace(/^["']|["']$/g, '').trim();
};

// ── URLs Lightspeed selon environnement ─────────────────────────
function lsBaseAuth(lsEnv: string) {
  const domain = lsEnv === 'prod' ? 'lsk-prod.app' : 'lsk-demo.app';
  return `https://auth.${domain}/realms/k-series/protocol/openid-connect`;
}
function lsBaseApi(lsEnv: string) {
  return lsEnv === 'prod' ? 'https://api.lsk.lightspeed.app' : 'https://api.lsk-demo.app';
}

// ── Client Supabase service_role (bypasse RLS) ───────────────────
function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
}

// ── Client Supabase anon (pour vérifier l'identité de l'appelant) ─
function userClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

// ── Échange code → tokens ────────────────────────────────────────
async function exchangeCode(code: string, lsEnv: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId     = env('LS_CLIENT_ID');
  const clientSecret = env('LS_CLIENT_SECRET');
  const redirectUri  = env('LS_REDIRECT_URI');
  const tokenUrl     = `${lsBaseAuth(lsEnv)}/token`;

  const body = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Lightspeed token exchange failed (${res.status}): ${txt}`);
  }
  return res.json();
}

// ── Refresh access_token ─────────────────────────────────────────
async function refreshTokens(refreshToken: string, lsEnv: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId     = env('LS_CLIENT_ID');
  const clientSecret = env('LS_CLIENT_SECRET');
  const tokenUrl     = `${lsBaseAuth(lsEnv)}/token`;

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Lightspeed token refresh failed (${res.status}): ${txt}`);
  }
  return res.json();
}

// ── Upsert connexion POS en base ────────────────────────────────
async function upsertConnection(
  admin: ReturnType<typeof adminClient>,
  etablissementId: string,
  providerId: string,
  tokens: { access_token: string; refresh_token: string; expires_in: number },
  lsEnv: string
) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Cherche une connexion existante
  const { data: existing } = await admin
    .from('pos_connections')
    .select('id')
    .eq('etablissement_id', etablissementId)
    .eq('provider_id', providerId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from('pos_connections')
      .update({
        access_token_enc:  tokens.access_token,
        refresh_token_enc: tokens.refresh_token,
        token_expires_at:  expiresAt,
        status:            'connected',
        last_error:        null,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw new Error(`DB update failed: ${error.message}`);
    return existing.id as string;
  } else {
    const { data, error } = await admin
      .from('pos_connections')
      .insert({
        etablissement_id:  etablissementId,
        provider_id:       providerId,
        access_token_enc:  tokens.access_token,
        refresh_token_enc: tokens.refresh_token,
        token_expires_at:  expiresAt,
        status:            'connected',
      })
      .select('id')
      .single();
    if (error) throw new Error(`DB insert failed: ${error.message}`);
    return (data as { id: string }).id;
  }
}

// ────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url    = new URL(req.url);
  const lsEnv  = (Deno.env.get('LS_ENV') ?? 'demo').trim();

  // ── GET : callback OAuth2 depuis Lightspeed ─────────────────────
  if (req.method === 'GET') {
    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return new Response('Paramètres manquants (code, state)', { status: 400 });
    }

    let stateData: { etablissementId: string; providerId: string };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return new Response('State invalide', { status: 400 });
    }

    try {
      const tokens = await exchangeCode(code, lsEnv);
      const admin  = adminClient();
      await upsertConnection(admin, stateData.etablissementId, stateData.providerId, tokens, lsEnv);

      // Renvoie une page HTML minimaliste qui notifie le popup parent et se ferme
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Connexion réussie</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0fdf4;}
.box{text-align:center;padding:32px;border-radius:12px;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.1);}
.icon{font-size:48px;margin-bottom:12px;}
p{color:#15803d;font-weight:600;font-size:16px;margin:0;}
</style></head><body>
<div class="box"><div class="icon">✅</div><p>Connexion Lightspeed réussie !<br>Cette fenêtre va se fermer…</p></div>
<script>
  try { window.opener && window.opener.postMessage({ type: 'pos_oauth_success' }, '*'); } catch(e) {}
  setTimeout(() => window.close(), 1500);
</script>
</body></html>`;
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Erreur de connexion</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fef2f2;}
.box{text-align:center;padding:32px;border-radius:12px;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.1);}
.icon{font-size:48px;margin-bottom:12px;}
p{color:#b91c1c;font-weight:600;font-size:14px;margin:0;}
</style></head><body>
<div class="box"><div class="icon">❌</div><p>Erreur lors de la connexion.<br>${errMsg.replace(/</g, '&lt;')}</p></div>
<script>
  try { window.opener && window.opener.postMessage({ type: 'pos_oauth_error', error: ${JSON.stringify(errMsg)} }, '*'); } catch(e) {}
  setTimeout(() => window.close(), 3000);
</script>
</body></html>`;
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  // ── POST : actions depuis le client ────────────────────────────
  if (req.method === 'POST') {
    // 1. Vérifier l'authentification utilisateur
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Non authentifié' }, 401);

    const userSupa = userClient(authHeader);
    const { data: { user }, error: authErr } = await userSupa.auth.getUser();
    if (authErr || !user) return json({ error: 'Session invalide' }, 401);

    // 2. Lire le body
    let body: Record<string, string>;
    try { body = await req.json(); } catch { return json({ error: 'Body invalide' }, 400); }

    const { action, etablissementId, providerId } = body;
    if (!action || !etablissementId || !providerId) {
      return json({ error: 'Paramètres manquants' }, 400);
    }

    const admin = adminClient();

    // ── Action : get_auth_url ─────────────────────────────────────
    if (action === 'get_auth_url') {
      try {
        const clientId   = env('LS_CLIENT_ID');
        const redirectUri = env('LS_REDIRECT_URI');
        const state       = btoa(JSON.stringify({ etablissementId, providerId }));
        const authUrl     = `${lsBaseAuth(lsEnv)}/auth`
          + `?client_id=${encodeURIComponent(clientId)}`
          + `&response_type=code`
          + `&scope=${encodeURIComponent('financial-api offline_access')}`
          + `&redirect_uri=${encodeURIComponent(redirectUri)}`
          + `&state=${encodeURIComponent(state)}`;
        return json({ url: authUrl });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // ── Action : status ───────────────────────────────────────────
    if (action === 'status') {
      const { data, error } = await admin
        .from('pos_connections')
        .select('id, status, last_sync_at, last_error, token_expires_at')
        .eq('etablissement_id', etablissementId)
        .eq('provider_id', providerId)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ status: 'not_connected' });
      return json({
        id:            data.id,
        status:        data.status,
        last_sync_at:  data.last_sync_at,
        last_error:    data.last_error,
        token_expires_at: data.token_expires_at,
      });
    }

    // ── Action : test ─────────────────────────────────────────────
    if (action === 'test') {
      // Récupère le token (service_role → RLS bypassé)
      const { data: conn, error: connErr } = await admin
        .from('pos_connections')
        .select('id, access_token_enc, refresh_token_enc, token_expires_at')
        .eq('etablissement_id', etablissementId)
        .eq('provider_id', providerId)
        .maybeSingle();

      if (connErr) return json({ error: connErr.message }, 500);
      if (!conn)   return json({ error: 'Aucune connexion trouvée' }, 404);

      let accessToken = conn.access_token_enc;

      // Auto-refresh si expiré (ou expiration dans < 5 min)
      const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
      const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 300_000;
      if (needsRefresh && conn.refresh_token_enc) {
        try {
          const refreshed = await refreshTokens(conn.refresh_token_enc, lsEnv);
          accessToken = refreshed.access_token;
          const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
          await admin.from('pos_connections').update({
            access_token_enc:  refreshed.access_token,
            refresh_token_enc: refreshed.refresh_token,
            token_expires_at:  newExpiry,
            status:            'connected',
            last_error:        null,
          }).eq('id', conn.id);
        } catch (e) {
          // Refresh échoué → marquer en erreur
          await admin.from('pos_connections').update({
            status:     'error',
            last_error: e instanceof Error ? e.message : 'Refresh token invalide',
          }).eq('id', conn.id);
          return json({ error: 'Token expiré — reconnexion nécessaire', needs_reconnect: true }, 401);
        }
      }

      // Appel test : liste les business locations disponibles
      const apiBase = lsBaseApi(lsEnv);
      const testRes = await fetch(`${apiBase}/account/v1/business-locations?pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (testRes.ok) {
        // Mise à jour du statut en DB
        await admin.from('pos_connections').update({
          status:     'connected',
          last_error: null,
        }).eq('id', conn.id);
        return json({ ok: true, message: 'Connexion Lightspeed opérationnelle ✓' });
      } else {
        const errTxt = await testRes.text();
        await admin.from('pos_connections').update({
          status:     'error',
          last_error: `API test failed (${testRes.status}): ${errTxt.slice(0, 200)}`,
        }).eq('id', conn.id);
        return json({ error: `Lightspeed API test échoué (${testRes.status})` }, 502);
      }
    }

    // ── Action : disconnect ───────────────────────────────────────
    if (action === 'disconnect') {
      // Optionnel : tenter une révocation côté Lightspeed
      // (K-Series ne documente pas encore de revocation endpoint — on purge juste en local)
      const { error } = await admin
        .from('pos_connections')
        .update({
          access_token_enc:  null,
          refresh_token_enc: null,
          token_expires_at:  null,
          status:            'disconnected',
          last_error:        null,
        })
        .eq('etablissement_id', etablissementId)
        .eq('provider_id', providerId);

      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, message: 'Déconnexion effectuée' });
    }

    return json({ error: `Action inconnue : ${action}` }, 400);
  }

  return json({ error: 'Méthode non supportée' }, 405);
});
