// ═══════════════════════════════════════════════════════════════
// SAMPER CONSULTING - Edge Function : update-user
// Nom de la fonction : update-user
// ═══════════════════════════════════════════════════════════════
//
// Permet au consultant de modifier l'e-mail et/ou le mot de passe
// d'un compte utilisateur existant, directement depuis l'app, sans
// accès manuel au dashboard Supabase.
//
// Sécurité : n'accepte que les requêtes authentifiées d'un consultant
// actif (relu dans profiles). CORS limité aux origines de l'app ; erreurs
// internes journalisées, jamais renvoyées (L0, 27.10.2026).
// Body attendu : { user_id, email?, password? } - champs absents/vides
// = laissés inchangés.
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const corsHeaders = enTetesCors(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Appelant authentifié
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Vérifier que le caller est un consultant actif
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(
        JSON.stringify({ error: "Unauthenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerProfile, error: profErr } = await adminClient
      .from("profiles")
      .select("role, actif")
      .eq("id", caller.id)
      .maybeSingle();
    if (profErr) {
      console.error("[update-user] lecture profil appelant", profErr.message);
      return new Response(
        JSON.stringify({ error: "Lecture du profil impossible" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!callerProfile || callerProfile.role !== "consultant" || callerProfile.actif === false) {
      return new Response(
        JSON.stringify({ error: "Only consultants can update users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Body
    const body = await req.json();
    const user_id: string | undefined = body.user_id;
    const email: string | undefined = body.email?.trim().toLowerCase() || undefined;
    const password: string | undefined = body.password || undefined;

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "Missing user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!email && !password) {
      return new Response(
        JSON.stringify({ error: "Rien à modifier : fournir un e-mail et/ou un mot de passe." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (password && password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Le mot de passe doit contenir au moins 6 caractères." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Mise à jour du compte auth (email auto-confirmé pour rester connectable)
    const attributes: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (email) { attributes.email = email; attributes.email_confirm = true; }
    if (password) { attributes.password = password; }

    const { error: updErr } = await adminClient.auth.admin.updateUserById(user_id, attributes);
    if (updErr) {
      return new Response(
        JSON.stringify({ error: updErr.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Synchroniser l'e-mail dans le profil (le mot de passe n'y est pas stocké)
    if (email) {
      await adminClient.from("profiles").update({ email }).eq("id", user_id);
    }

    return new Response(
      JSON.stringify({ success: true, user_id, email: email || null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[update-user] erreur inattendue", (err as Error)?.message || String(err));
    return new Response(
      JSON.stringify({ error: "Erreur inattendue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
