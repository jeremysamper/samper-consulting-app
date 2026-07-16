// ═══════════════════════════════════════════════════════════════
// SAMPER CONSULTING - Edge Function : update-user
// Nom de la fonction : update-user
// ═══════════════════════════════════════════════════════════════
//
// Permet au consultant de modifier l'e-mail et/ou le mot de passe
// d'un compte utilisateur existant, directement depuis l'app, sans
// accès manuel au dashboard Supabase.
//
// Sécurité : n'accepte que les requêtes authentifiées d'un consultant.
// Body attendu : { user_id, email?, password? } - champs absents/vides
// = laissés inchangés.
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
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

    // 2. Vérifier que le caller est un consultant
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(
        JSON.stringify({ error: "Unauthenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "consultant") {
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
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
