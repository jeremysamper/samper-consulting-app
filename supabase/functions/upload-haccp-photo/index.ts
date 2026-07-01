// ================================================================
// Edge Function « upload-haccp-photo »
//
// Upload des photos de traçabilité HACCP (étiquettes produits) côté serveur.
// Le client envoie le fichier + etabId en multipart avec son JWT. La fonction :
//   1. valide le token (getUser)
//   2. verifie l'acces de l'utilisateur a l'etablissement (profiles)
//   3. ecrit dans le bucket haccp-photos avec la cle SERVICE (bypass RLS),
//      sous <etabId>/<YYYY>/<MM>/<DD>/<timestamp>.<ext> (heure Zurich)
//   4. renvoie l'URL publique permanente
//
// Meme pattern que upload-recette-photo (verify_jwt=false, auth geree manuellement).
// ================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { utcToLocalDateString } from '../_shared/timezone.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST requis' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Non authentifie' }, 401);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1) Valider le token utilisateur
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return json({ error: 'Session invalide ou expiree. Reconnectez-vous.' }, 401);

  // 2) Lire le formulaire multipart
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: 'Body invalide (multipart attendu)' }, 400); }
  const file = form.get('file');
  const etabId = String(form.get('etabId') ?? '').trim();
  if (!(file instanceof File)) return json({ error: 'Fichier manquant' }, 400);
  if (!etabId) return json({ error: 'Etablissement manquant' }, 400);

  const mime = file.type || 'image/jpeg';
  if (!ALLOWED_MIME.includes(mime)) return json({ error: `Format non supporte (${mime})` }, 400);
  if (file.size > 8 * 1024 * 1024) return json({ error: 'Image trop volumineuse (> 8 Mo)' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // 3) Verifier l'acces de l'utilisateur a l'etablissement
  const { data: profile, error: pErr } = await admin
    .from('profiles').select('etablissement_ids').eq('id', user.id).maybeSingle();
  if (pErr) return json({ error: `Profil illisible : ${pErr.message}` }, 500);
  const etabs: string[] = Array.isArray(profile?.etablissement_ids) ? profile!.etablissement_ids : [];
  if (!etabs.includes(etabId)) return json({ error: 'Acces refuse pour cet etablissement' }, 403);

  // 4) Upload via service role (bypass RLS storage), classe Annee/Mois/Jour (heure Zurich)
  const localDate = utcToLocalDateString(new Date().toISOString(), 'Europe/Zurich');
  const [yyyy, mm, dd] = localDate.split('-');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${etabId}/${yyyy}/${mm}/${dd}/${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from('haccp-photos').upload(path, bytes, {
    contentType: mime, cacheControl: '31536000', upsert: true,
  });
  if (upErr) return json({ error: `Upload echoue : ${upErr.message}` }, 500);

  const { data } = admin.storage.from('haccp-photos').getPublicUrl(path);
  return json({ path, url: data.publicUrl, date: localDate });
});
