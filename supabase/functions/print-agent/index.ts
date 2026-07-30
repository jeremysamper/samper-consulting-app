// ================================================================
// Edge Function « print-agent »
//
// Guichet de l'agent d'impression installé sur le réseau du restaurant.
// L'agent vient CHERCHER le travail : tout est sortant depuis le restaurant,
// donc aucun port ouvert, aucun certificat, l'imprimante n'est jamais exposée.
//
// Authentification par jeton d'appareil, PAS par JWT utilisateur : l'agent
// n'est pas une personne. verify_jwt doit donc être désactivé pour cette
// fonction (voir config.toml), l'authentification est faite ici.
//   Authorization: Bearer <jeton de l'agent>
// Le jeton n'est jamais stocké : la table ne garde que son sha256.
//
// POST body : { action: 'next' | 'done' | 'ping', ... }
//   next  -> {} .................... prend le lot le plus ancien en attente
//   done  -> { jobId, ok, erreur? }  clôture un lot
//   ping  -> { imprimante? } ....... signale que l'agent est vivant
// ================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface Agent {
  id: string;
  etablissement_id: string;
  nom: string;
}

// Résout l'agent depuis son jeton. Retourne null sur tout écart : jeton absent,
// inconnu ou agent désactivé donnent la même réponse, on ne renseigne pas un
// appelant qui tâtonne.
async function resoudreAgent(req: Request, admin: ReturnType<typeof adminClient>): Promise<Agent | null> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token.length < 32) return null;
  const { data, error } = await admin
    .from('print_agents')
    .select('id, etablissement_id, nom, actif')
    .eq('token_sha256', await sha256Hex(token))
    .maybeSingle();
  if (error || !data || data.actif !== true) return null;
  return { id: data.id, etablissement_id: data.etablissement_id, nom: data.nom };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const admin = adminClient();
  const agent = await resoudreAgent(req, admin);
  if (!agent) return json({ error: 'Agent non reconnu' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corps JSON invalide' }, 400);
  }
  const action = String(body.action || '');

  // Toute action vaut battement de cœur : le front lit derniere_vue pour savoir
  // si l'impression directe est réellement disponible avant de la proposer.
  await admin
    .from('print_agents')
    .update({
      derniere_vue: new Date().toISOString(),
      ...(typeof body.imprimante === 'string' ? { imprimante_label: body.imprimante.slice(0, 120) } : {}),
    })
    .eq('id', agent.id);

  if (action === 'ping') {
    return json({ ok: true, agent: agent.nom, etablissement: agent.etablissement_id });
  }

  if (action === 'next') {
    // Prise atomique côté base (for update skip locked) : deux relèves
    // simultanées ne peuvent pas sortir le même lot en double.
    const { data, error } = await admin.rpc('claim_print_job', {
      p_etablissement_id: agent.etablissement_id,
    });
    if (error) {
      console.error('[print-agent next]', error);
      return json({ error: 'Lecture de la file impossible' }, 500);
    }
    const lot = Array.isArray(data) ? data[0] : data;
    if (!lot || !lot.id) return json({ job: null });

    // Ménage opportuniste : la file porte des PDF, elle n'a pas vocation à
    // devenir un journal. Un échec de purge ne doit jamais bloquer une impression.
    admin.rpc('purge_print_jobs', { retention_jours: 7 })
      .then(({ error: err }) => { if (err) console.warn('[print-agent purge]', err.message); });

    return json({
      job: {
        id: lot.id,
        nbEtiquettes: lot.nb_etiquettes,
        mode: lot.mode,
        pdfBase64: lot.pdf_base64,
      },
    });
  }

  if (action === 'done') {
    const jobId = String(body.jobId || '');
    if (!jobId) return json({ error: 'jobId manquant' }, 400);
    const ok = body.ok === true;
    const { error } = await admin
      .from('print_jobs')
      .update({
        statut: ok ? 'imprime' : 'erreur',
        termine_at: new Date().toISOString(),
        erreur: ok ? null : String(body.erreur || 'Erreur inconnue').slice(0, 500),
      })
      .eq('id', jobId)
      .eq('etablissement_id', agent.etablissement_id); // un agent ne clôture que ses lots
    if (error) {
      console.error('[print-agent done]', error);
      return json({ error: 'Mise à jour impossible' }, 500);
    }
    return json({ ok: true });
  }

  return json({ error: 'Action inconnue' }, 400);
});
