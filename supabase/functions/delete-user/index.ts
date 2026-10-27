// SAMPER CONSULTING - Edge Function : delete-user
// Slug : delete-user, verify_jwt = true
//
// Supprime définitivement un compte (profil public.profiles + compte
// auth.users) depuis l'écran Rôles, sans passer par le dashboard.
//
// Appelée par legacySupabase.js > deleteUserViaEdge :
//   client.functions.invoke('delete-user', { body: { user_id } })
// Succès  : 200 { success: true, user_id, method: 'edge', ... }
// Échec   : non-2xx { error } (le front bascule alors sur son repli
//           « suppression du profil seul »).
//
// Sécurité :
//   - JWT vérifié deux fois : par la passerelle (verify_jwt = true) puis
//     ici via auth.getUser(token), qui interroge le serveur Auth.
//   - Réservé au rôle consultant (lu dans public.profiles, pas dans le JWT).
//   - Interdit de se supprimer soi-même et de supprimer un consultant.
//   - La clé service_role reste côté serveur (variable injectée).
//   - CORS limité aux origines de l'app (L0, 27.10.2026).
//
// Ordre : profil d'abord, compte auth ensuite. Si le profil est encore
// référencé par une table en ON DELETE NO ACTION (reservations,
// brigade_taches, pos_connections, kds_orders, kds_order_items), le
// refus arrive AVANT toute suppression irréversible du compte auth.
// (Le trigger on_auth_user_deleted avale ses erreurs : supprimer le
// compte auth d'abord laisserait un profil orphelin sans le dire.)

import { createClient } from 'jsr:@supabase/supabase-js@2';

// Origines admises : l'app, ses previews Vercel, le développement local.
const ORIGINES = ['https://samperconsulting-app.com', 'https://www.samperconsulting-app.com'];
const ORIGINE_PREVIEW = /^https:\/\/sc-app-[a-z0-9-]+-samper-consulting\.vercel\.app$/;
const ORIGINE_LOCALE = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;

function enTetesCors(req: Request): Record<string, string> {
  const origine = req.headers.get('Origin') ?? '';
  const admise = ORIGINES.includes(origine) || ORIGINE_PREVIEW.test(origine) || ORIGINE_LOCALE.test(origine);
  return {
    ...(admise ? { 'Access-Control-Allow-Origin': origine } : {}),
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  const corsHeaders = enTetesCors(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[delete-user] variables d\'environnement manquantes');
      return json({ error: 'Configuration serveur incomplète' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Non authentifié' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) return json({ error: 'Session invalide' }, 401);

    const { data: callerProfile, error: callerErr } = await admin
      .from('profiles')
      .select('role, actif')
      .eq('id', caller.id)
      .maybeSingle();
    if (callerErr) {
      console.error('[delete-user] lecture profil appelant', callerErr.message);
      return json({ error: 'Lecture du profil impossible' }, 500);
    }
    if (!callerProfile || callerProfile.role !== 'consultant' || callerProfile.actif === false) {
      return json({ error: 'Réservé au consultant' }, 403);
    }

    let body: { user_id?: unknown };
    try { body = await req.json(); } catch { return json({ error: 'Corps JSON invalide' }, 400); }
    const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
    if (!UUID_RE.test(userId)) return json({ error: 'user_id manquant ou invalide' }, 400);
    if (userId.toLowerCase() === caller.id.toLowerCase()) {
      return json({ error: 'Vous ne pouvez pas supprimer votre propre compte' }, 400);
    }

    const { data: targetProfile, error: targetErr } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle();
    if (targetErr) {
      console.error('[delete-user] lecture profil cible', targetErr.message);
      return json({ error: 'Lecture du profil cible impossible' }, 500);
    }

    const { data: authData, error: getAuthErr } = await admin.auth.admin.getUserById(userId);
    const targetAuth = getAuthErr ? null : authData?.user ?? null;

    if (!targetProfile && !targetAuth) return json({ error: 'Compte introuvable' }, 404);

    const roleCible = targetProfile?.role
      ?? targetAuth?.app_metadata?.role
      ?? targetAuth?.user_metadata?.role;
    if (roleCible === 'consultant') {
      return json({ error: 'Impossible de supprimer un compte consultant' }, 403);
    }

    let profileDeleted = false;
    if (targetProfile) {
      const { error: delProfErr } = await admin.from('profiles').delete().eq('id', userId);
      if (delProfErr) {
        console.error('[delete-user] suppression profil', delProfErr.code, delProfErr.message);
        if (delProfErr.code === '23503') {
          return json({
            error: 'Ce compte est encore référencé (réservations, tâches, commandes KDS ou connexion caisse). '
              + 'Désactivez-le plutôt que de le supprimer.',
            code: 'referenced',
          }, 409);
        }
        return json({ error: 'Suppression du profil impossible' }, 500);
      }
      profileDeleted = true;
    }

    let authDeleted = false;
    if (targetAuth) {
      const { error: delAuthErr } = await admin.auth.admin.deleteUser(userId);
      if (delAuthErr) {
        console.error('[delete-user] suppression auth', delAuthErr.message);
        return json({
          error: 'Profil supprimé, mais le compte de connexion n\'a pas pu l\'être : '
            + 'à supprimer dans Supabase (Authentication).',
          profile_deleted: profileDeleted,
          auth_deleted: false,
        }, 500);
      }
      authDeleted = true;
    }

    console.log('[delete-user] compte supprimé', { cible: userId, par: caller.id, profileDeleted, authDeleted });
    return json({ success: true, user_id: userId, method: 'edge', profile_deleted: profileDeleted, auth_deleted: authDeleted });
  } catch (err) {
    console.error('[delete-user] erreur inattendue', (err as Error)?.message || String(err));
    return json({ error: 'Erreur inattendue' }, 500);
  }
});
