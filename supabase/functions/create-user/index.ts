// ═══════════════════════════════════════════════════════════════
// SAMPER CONSULTING — Edge Function : create-user
// À déployer dans : Supabase Dashboard > Edge Functions > New function
// Nom de la fonction : create-user
// ═══════════════════════════════════════════════════════════════
//
// Cette fonction permet au consultant de créer un nouvel utilisateur
// (compte auth + profil) depuis l'app sans déconnexion ni accès
// manuel à Supabase.
//
// Sécurité : n'accepte que les requêtes authentifiées d'un consultant.
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Gérer preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Vérifier que l'appelant est authentifié
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Créer 2 clients : un avec le token du caller pour vérifier son rôle,
    //    et un avec le service_role pour créer l'utilisateur
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Récupérer le profil du caller
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
        JSON.stringify({ error: "Only consultants can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Lire le body
    const { email, password, prenom, nom, role, poste, etablissement_ids } = await req.json();

    if (!email || !password || !prenom || !nom) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Créer l'utilisateur dans auth (auto-confirmed)
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // pas besoin de valider par email
      user_metadata: { prenom, nom, role: role || "cuisinier" },
    });

    if (createErr) {
      return new Response(
        JSON.stringify({ error: createErr.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Compléter le profil (le trigger l'a déjà créé avec les données de base)
    const avatar = (prenom[0] + nom[0]).toUpperCase();
    await adminClient
      .from("profiles")
      .update({
        prenom, nom, role: role || "cuisinier",
        poste: poste || null,
        etablissement_ids: etablissement_ids || [],
        avatar,
        actif: true,
      })
      .eq("id", newUser.user.id);

    return new Response(
      JSON.stringify({ success: true, user_id: newUser.user.id, email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
