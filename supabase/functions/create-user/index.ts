// SAMPER CONSULTING - Edge Function : create-user
// Slug : create-user, verify_jwt = true
//
// Crée un compte (auth + profil) depuis l'écran Rôles & accès, sans passer
// par le dashboard. Appelée par legacySupabase.js > createUserViaEdge.
//
// Sécurité (L0, 27.10.2026) :
//   - JWT vérifié par la passerelle, puis relu ici (auth.getUser) ;
//   - appelant relu dans profiles : consultant ET actif ;
//   - rôle dans la liste fermée des rôles de l'app, établissements inclus
//     dans ceux de l'appelant (validation.ts) ;
//   - CORS limité aux origines de l'app ;
//   - erreurs internes journalisées, jamais renvoyées.
// Dry-run : { "dryRun": true } valide la demande et rend ce qui serait créé,
// sans rien créer.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validerCreation } from "./validation.ts";

// Origines admises : l'app, ses previews Vercel, le développement local.
const ORIGINES = ["https://samperconsulting-app.com", "https://www.samperconsulting-app.com"];
const ORIGINE_PREVIEW = /^https:\/\/sc-app-[a-z0-9-]+-samper-consulting\.vercel\.app$/;
const ORIGINE_LOCALE = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;

function enTetesCors(req: Request): Record<string, string> {
  const origine = req.headers.get("Origin") ?? "";
  const admise = ORIGINES.includes(origine) || ORIGINE_PREVIEW.test(origine) || ORIGINE_LOCALE.test(origine);
  return {
    ...(admise ? { "Access-Control-Allow-Origin": origine } : {}),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const cors = enTetesCors(req);
  const json = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // 1. Appelant authentifié
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Unauthenticated" }, 401);

    // 2. Consultant actif, relu en base avec ses établissements
    const { data: callerProfile, error: profErr } = await adminClient
      .from("profiles")
      .select("role, actif, etablissement_ids")
      .eq("id", caller.id)
      .maybeSingle();
    if (profErr) {
      console.error("[create-user] lecture profil appelant", profErr.message);
      return json({ error: "Lecture du profil impossible" }, 500);
    }
    if (!callerProfile || callerProfile.role !== "consultant" || callerProfile.actif === false) {
      return json({ error: "Only consultants can create users" }, 403);
    }

    // 3. Demande validée : rôle connu, établissements de l'appelant
    let corps: unknown;
    try { corps = await req.json(); } catch { return json({ error: "Corps JSON invalide" }, 400); }
    const etabsAppelant = Array.isArray(callerProfile.etablissement_ids) ? callerProfile.etablissement_ids : [];
    const verdict = validerCreation(corps, etabsAppelant);
    if (!verdict.ok) return json({ error: verdict.erreur }, verdict.statut);
    const { email, password, prenom, nom, role, poste, etablissement_ids } = verdict.valeurs;

    if ((corps as { dryRun?: unknown })?.dryRun === true) {
      return json({ ok: true, dryRun: true, email, prenom, nom, role, poste, etablissement_ids });
    }

    // 4. Compte auth (confirmé d'office : le consultant transmet les identifiants)
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { prenom, nom, role },
    });
    if (createErr) {
      // Message d'Auth destiné à l'utilisateur (adresse déjà prise, mot de passe refusé).
      return json({ error: createErr.message }, 400);
    }

    // 5. Profil complété (handle_new_user l'a créé avec l'id et l'e-mail)
    const avatar = (prenom[0] + nom[0]).toUpperCase();
    const { error: majErr } = await adminClient
      .from("profiles")
      .update({ prenom, nom, role, poste, etablissement_ids, avatar, actif: true })
      .eq("id", newUser.user.id);
    if (majErr) {
      console.error("[create-user] profil incomplet", newUser.user.id, majErr.message);
      return json({
        error: "Compte créé, mais son profil n'a pas pu être complété : poser son rôle et ses établissements dans Rôles & accès.",
        user_id: newUser.user.id,
      }, 500);
    }

    return json({ success: true, user_id: newUser.user.id, email });
  } catch (err) {
    console.error("[create-user] erreur inattendue", (err as Error)?.message || String(err));
    return json({ error: "Erreur inattendue" }, 500);
  }
});
