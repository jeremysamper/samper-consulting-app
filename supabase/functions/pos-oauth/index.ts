// ════════════════════════════════════════════════════════════════
// Edge function « pos-oauth » v2 — OAuth2 Lightspeed K-Series.
//
// Nouveautés v2 :
//   • Détection multi-location après token exchange
//   • Si 1 location → auto-select, status='connected'
//   • Si N locations → status='needs_location', page HTML envoie
//     postMessage({ type: 'pos_oauth_needs_location', locations })
//   • Nouveau endpoint POST action='set_location'
//   • status étendu : 'needs_location' (état intermédiaire)
//
// Sécurité : tokens JAMAIS exposés côté client.
//
// Secrets requis :
//   LS_CLIENT_ID, LS_CLIENT_SECRET, LS_REDIRECT_URI, LS_ENV
//
// Endpoints :
//   GET  ?code=&state=           → callback OAuth2
//   POST action='get_auth_url'   → URL OAuth Lightspeed
//   POST action='status'         → statut connexion (sans tokens)
//   POST action='set_location'   → choisit la location (multi-location)
//   POST action='test'           → vérifie le token
//   POST action='disconnect'     → purge tokens
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchBusinessLocations } from '../_shared/lightspeed-client.ts';

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

function lsBaseAuth(lsEnv: string) {
  const domain = lsEnv === 'prod' ? 'lsk-prod.app' : 'lsk-demo.app';
  return `https://auth.${domain}/realms/k-series/protocol/openid-connect`;
}
function lsBaseApi(lsEnv: string) {
  return lsEnv === 'prod' ? 'https://api.lsk.lightspeed.app' : 'https://api.lsk-demo.app';
}

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

async function exchangeCode(code: string, lsEnv: string) {
  const tokenUrl = `${lsBaseAuth(lsEnv)}/token`;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${env('LS_CLIENT_ID')}:${env('LS_CLIENT_SECRET')}`)}`,
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: env('LS_REDIRECT_URI'),
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

async function refreshTokens(refreshToken: string, lsEnv: string) {
  const res = await fetch(`${lsBaseAuth(lsEnv)}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${env('LS_CLIENT_ID')}:${env('LS_CLIENT_SECRET')}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

/** Upsert la connexion POS (sans ls_business_location_id — sera ajouté par set_location) */
async function upsertConnection(
  admin: ReturnType<typeof adminClient>,
  etablissementId: string,
  providerId: string,
  tokens: { access_token: string; refresh_token: string; expires_in: number },
  status: 'connected' | 'needs_location',
  locationIds?: { businessId: string; locationId: string }
): Promise<string> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const payload: Record<string, unknown> = {
    access_token_enc:  tokens.access_token,
    refresh_token_enc: tokens.refresh_token,
    token_expires_at:  expiresAt,
    status,
    last_error:        null,
    updated_at:        new Date().toISOString(),
  };
  if (locationIds) {
    payload.ls_business_id          = locationIds.businessId;
    payload.ls_business_location_id = locationIds.locationId;
  }

  const { data: existing } = await admin
    .from('pos_connections')
    .select('id')
    .eq('etablissement_id', etablissementId)
    .eq('provider_id', providerId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin.from('pos_connections').update(payload).eq('id', existing.id);
    if (error) throw new Error(`DB update failed: ${error.message}`);
    return existing.id as string;
  } else {
    const { data, error } = await admin
      .from('pos_connections')
      .insert({ ...payload, etablissement_id: etablissementId, provider_id: providerId })
      .select('id')
      .single();
    if (error) throw new Error(`DB insert failed: ${error.message}`);
    return (data as { id: string }).id;
  }
}

// ────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const lsEnv = (Deno.env.get('LS_ENV') ?? 'demo').trim();
  const url   = new URL(req.url);

  // ── GET : callback OAuth2 + utilitaires ─────────────────────────
  if (req.method === 'GET') {

    // ── ping — vérifie la présence des secrets (aucune auth requise) ──
    if (url.searchParams.get('action') === 'ping') {
      const configured = !!(
        Deno.env.get('LS_CLIENT_ID') &&
        Deno.env.get('LS_CLIENT_SECRET') &&
        Deno.env.get('LS_REDIRECT_URI')
      );
      return json({ configured });
    }

    // ── Erreur OAuth renvoyée par Lightspeed (?error=...) ─────────
    const oauthError = url.searchParams.get('error');
    if (oauthError) {
      const errorDesc = url.searchParams.get('error_description') ?? oauthError;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Erreur OAuth</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
height:100vh;margin:0;background:#fef2f2;}.box{padding:28px 32px;border-radius:12px;
background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.1);text-align:center;}
.icon{font-size:42px;margin-bottom:12px;}p{color:#b91c1c;font-weight:600;font-size:14px;margin:0;}
small{color:#6b7280;font-size:12px;font-weight:400;display:block;margin-top:6px;}
</style></head><body>
<div class="box">
  <div class="icon">❌</div>
  <p>Autorisation refusée<small>${errorDesc.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</small></p>
</div>
<script>
  try { window.opener && window.opener.postMessage({
    type: 'pos_oauth_error',
    error_code: ${JSON.stringify(oauthError)},
    error: ${JSON.stringify(errorDesc)}
  }, '*'); } catch(e) {}
  setTimeout(() => window.close(), 2500);
</script></body></html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return new Response('Paramètres manquants', { status: 400 });

    let stateData: { etablissementId: string; providerId: string };
    try { stateData = JSON.parse(atob(state)); }
    catch { return new Response('State invalide', { status: 400 }); }

    try {
      const tokens    = await exchangeCode(code, lsEnv);
      const admin     = adminClient();

      // Récupère les business locations disponibles
      const locations = await fetchBusinessLocations(tokens.access_token, lsEnv);

      let connectionId: string;
      let htmlMsg: string;

      if (locations.length === 1) {
        // Auto-sélection : 1 seule location
        connectionId = await upsertConnection(
          admin,
          stateData.etablissementId,
          stateData.providerId,
          tokens,
          'connected',
          { businessId: locations[0].businessId, locationId: locations[0].locationId }
        );
        htmlMsg = `
<div class="box">
  <div class="icon">✅</div>
  <p>Connexion Lightspeed réussie !<br>
     <small style="font-size:12px;color:#6b7280">${locations[0].locationName}</small><br>
     Cette fenêtre va se fermer…</p>
</div>
<script>
  try { window.opener && window.opener.postMessage({
    type: 'pos_oauth_success',
    connectionId: ${JSON.stringify(connectionId)},
    locationName: ${JSON.stringify(locations[0].locationName)}
  }, '*'); } catch(e) {}
  setTimeout(() => window.close(), 1500);
</script>`;
      } else {
        // Multi-location : stocker les tokens, statut intermédiaire
        connectionId = await upsertConnection(
          admin,
          stateData.etablissementId,
          stateData.providerId,
          tokens,
          'needs_location'
        );

        const locJson = JSON.stringify(locations);
        htmlMsg = `
<div class="box" style="max-width:480px;text-align:left">
  <div class="icon" style="text-align:center">🔍</div>
  <p style="text-align:center;color:#1d4ed8;font-weight:700;font-size:15px;margin:0 0 12px">
    Plusieurs locations détectées
  </p>
  <p style="color:#374151;font-size:13px;margin:0 0 16px">
    Votre compte Lightspeed contient ${locations.length} restaurants.<br>
    La sélection se fait dans l'application Samper — cette fenêtre va se fermer.
  </p>
</div>
<script>
  try { window.opener && window.opener.postMessage({
    type: 'pos_oauth_needs_location',
    connectionId: ${JSON.stringify(connectionId)},
    locations: ${locJson}
  }, '*'); } catch(e) {}
  setTimeout(() => window.close(), 2000);
</script>`;
      }

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lightspeed</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
height:100vh;margin:0;background:#f0f9ff;}.box{padding:28px 32px;border-radius:12px;
background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.1);}.icon{font-size:42px;margin-bottom:12px;}
p{margin:0;line-height:1.5;}small{color:#6b7280;}</style>
</head><body>${htmlMsg}</body></html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Erreur</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
height:100vh;margin:0;background:#fef2f2;}.box{padding:28px 32px;border-radius:12px;
background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.1);text-align:center;}
.icon{font-size:42px;margin-bottom:12px;}p{color:#b91c1c;font-weight:600;font-size:14px;margin:0;}
</style></head><body>
<div class="box"><div class="icon">❌</div><p>Erreur lors de la connexion.<br>
${errMsg.replace(/</g, '&lt;')}</p></div>
<script>
  try { window.opener && window.opener.postMessage({
    type: 'pos_oauth_error', error: ${JSON.stringify(errMsg)}
  }, '*'); } catch(e) {}
  setTimeout(() => window.close(), 3000);
</script></body></html>`;
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  }

  // ── POST : actions ───────────────────────────────────────────────
  if (req.method === 'POST') {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Non authentifié' }, 401);
    const userSupa = userClient(authHeader);
    const { data: { user }, error: authErr } = await userSupa.auth.getUser();
    if (authErr || !user) return json({ error: 'Session invalide' }, 401);

    let body: Record<string, string>;
    try { body = await req.json(); } catch { return json({ error: 'Body invalide' }, 400); }

    const { action, etablissementId, providerId } = body;
    if (!action || !etablissementId || !providerId) return json({ error: 'Paramètres manquants' }, 400);

    const admin = adminClient();

    // ── get_auth_url ─────────────────────────────────────────────
    if (action === 'get_auth_url') {
      try {
        const state   = btoa(JSON.stringify({ etablissementId, providerId }));
        const authUrl = `${lsBaseAuth(lsEnv)}/auth`
          + `?client_id=${encodeURIComponent(env('LS_CLIENT_ID'))}`
          + `&response_type=code`
          + `&scope=${encodeURIComponent('financial-api offline_access')}`
          + `&redirect_uri=${encodeURIComponent(env('LS_REDIRECT_URI'))}`
          + `&state=${encodeURIComponent(state)}`;
        return json({ url: authUrl });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // ── status ───────────────────────────────────────────────────
    if (action === 'status') {
      const { data, error } = await admin
        .from('pos_connections')
        .select('id, status, last_sync_at, last_error, token_expires_at, ls_business_id, ls_business_location_id')
        .eq('etablissement_id', etablissementId)
        .eq('provider_id', providerId)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ status: 'not_connected' });
      return json({
        id:                      data.id,
        status:                  data.status,
        last_sync_at:            data.last_sync_at,
        last_error:              data.last_error,
        token_expires_at:        data.token_expires_at,
        ls_business_id:          data.ls_business_id,
        ls_business_location_id: data.ls_business_location_id,
      });
    }

    // ── set_location (multi-location flow) ───────────────────────
    if (action === 'set_location') {
      const { connectionId, businessId, locationId } = body;
      if (!connectionId || !businessId || !locationId) {
        return json({ error: 'connectionId, businessId, locationId requis' }, 400);
      }
      const { error } = await admin
        .from('pos_connections')
        .update({
          ls_business_id:          businessId,
          ls_business_location_id: locationId,
          status:                  'connected',
          last_error:              null,
        })
        .eq('id', connectionId)
        .eq('etablissement_id', etablissementId); // double sécurité

      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, message: 'Location sélectionnée ✓' });
    }

    // ── test ──────────────────────────────────────────────────────
    if (action === 'test') {
      const { data: conn, error: connErr } = await admin
        .from('pos_connections')
        .select('id, access_token_enc, refresh_token_enc, token_expires_at')
        .eq('etablissement_id', etablissementId)
        .eq('provider_id', providerId)
        .maybeSingle();
      if (connErr) return json({ error: connErr.message }, 500);
      if (!conn)   return json({ error: 'Aucune connexion trouvée' }, 404);

      let accessToken = conn.access_token_enc;
      const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
      const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 300_000;
      if (needsRefresh && conn.refresh_token_enc) {
        try {
          const refreshed = await refreshTokens(conn.refresh_token_enc, lsEnv);
          accessToken = refreshed.access_token;
          await admin.from('pos_connections').update({
            access_token_enc:  refreshed.access_token,
            refresh_token_enc: refreshed.refresh_token,
            token_expires_at:  new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            status:            'connected', last_error: null,
          }).eq('id', conn.id);
        } catch (e) {
          await admin.from('pos_connections').update({
            status: 'error', last_error: e instanceof Error ? e.message : 'Refresh token invalide',
          }).eq('id', conn.id);
          return json({ error: 'Token expiré — reconnexion nécessaire', needs_reconnect: true }, 401);
        }
      }

      const testRes = await fetch(`${lsBaseApi(lsEnv)}/account/v1/business-locations?pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (testRes.ok) {
        await admin.from('pos_connections').update({ status: 'connected', last_error: null }).eq('id', conn.id);
        return json({ ok: true, message: 'Connexion Lightspeed opérationnelle ✓' });
      } else {
        const errTxt = await testRes.text();
        await admin.from('pos_connections').update({
          status: 'error', last_error: `API test failed (${testRes.status}): ${errTxt.slice(0, 200)}`,
        }).eq('id', conn.id);
        return json({ error: `Lightspeed API test échoué (${testRes.status})` }, 502);
      }
    }

    // ── disconnect ────────────────────────────────────────────────
    if (action === 'disconnect') {
      const { error } = await admin
        .from('pos_connections')
        .update({
          access_token_enc:        null,
          refresh_token_enc:       null,
          token_expires_at:        null,
          ls_business_id:          null,
          ls_business_location_id: null,
          status:                  'disconnected',
          last_error:              null,
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
