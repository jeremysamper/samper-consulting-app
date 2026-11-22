// SAMPER CONSULTING - Edge Function envoi-documents (22.11.2026)
//
// Envoie par Brevo un fichier versé dans Documents (facture ou autre pièce)
// aux adresses de l'établissement concerné, depuis le compte Brevo du
// consultant. Le navigateur ne voit jamais la clé Brevo : elle vit dans le
// secret BREVO_API_KEY de la fonction.
//
// Actions (POST, jeton de la personne) :
//   - etat     : { configure, expediteur } ; dit au front si l'envoi est prêt.
//   - envoyer  : { documentId, a, cc, objet, message, dryRun? }
//                Le fichier est relu ici dans le bucket `documents` par son
//                identifiant : le navigateur ne fournit ni chemin ni contenu.
//
// Gardes : jeton relu (auth.getUser, verify_jwt laisse passer la clé
// publique), rôle consultant actif, établissement du document dans ses
// établissements, adresses contrôlées (logique.js).
//
// Secrets : BREVO_API_KEY (obligatoire pour envoyer), BREVO_EXPEDITEUR_EMAIL
// et BREVO_EXPEDITEUR_NOM (facultatifs ; l'expéditeur doit être validé dans
// Brevo).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { enTetesCors } from '../_shared/cors.ts';
import { construireCourriel, LIEN_JOURS, modePiece, verifierDemande } from './logique.js';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!;
const CLE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLE_BREVO = Deno.env.get('BREVO_API_KEY') ?? '';
const EXPEDITEUR = {
  email: Deno.env.get('BREVO_EXPEDITEUR_EMAIL') || 'info@jeremysamper.ch',
  name: Deno.env.get('BREVO_EXPEDITEUR_NOM') || 'Jeremy Samper',
};
const ROLES_ENVOI = ['consultant'];
const DELAI_BREVO_MS = 20000;

const admin = createClient(URL_SUPABASE, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Journal : identifiants et comptes seulement, jamais une adresse ni la clé.
const journal = (evenement: string, details: Record<string, unknown>) =>
  console.log(`[envoi-documents] ${evenement} ${JSON.stringify(details)}`);

class Refus extends Error {
  statut: number;
  constructor(statut: number, message: string) { super(message); this.statut = statut; }
}

async function lirePersonne(autorisation: string | null) {
  if (!autorisation) throw new Refus(401, 'Session requise.');
  const client = createClient(URL_SUPABASE, CLE_ANON, {
    global: { headers: { Authorization: autorisation } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await client.auth.getUser();
  const id = data?.user?.id;
  if (!id) throw new Refus(401, 'Session requise.');
  const { data: profil, error } = await admin
    .from('profiles')
    .select('id, role, etablissement_ids, actif')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Refus(500, 'Profil illisible.');
  if (!profil || profil.actif === false || !ROLES_ENVOI.includes(profil.role)) {
    throw new Refus(403, "L'envoi de documents est réservé au consultant.");
  }
  return { id, etablissements: Array.isArray(profil.etablissement_ids) ? profil.etablissement_ids : [] };
}

async function envoyer(personne: { id: string; etablissements: string[] }, corps: Record<string, unknown>) {
  const documentId = typeof corps.documentId === 'string' ? corps.documentId : '';
  if (!documentId) throw new Refus(400, 'Document manquant.');

  const demande = verifierDemande({ a: corps.a, cc: corps.cc, objet: corps.objet, message: corps.message });
  if ('erreur' in demande) throw new Refus(400, demande.erreur as string);

  const { data: doc, error } = await admin
    .from('documents')
    .select('id, etablissement_id, type, nom, storage_path, taille')
    .eq('id', documentId)
    .maybeSingle();
  if (error) throw new Refus(500, 'Document illisible.');
  if (!doc || doc.type !== 'file' || !doc.storage_path) throw new Refus(404, 'Document introuvable.');
  if (!personne.etablissements.includes(doc.etablissement_id)) throw new Refus(403, 'Document hors de vos établissements.');

  const dryRun = corps.dryRun === true;
  if (!dryRun && !CLE_BREVO) throw new Refus(503, "Brevo n'est pas encore relié : la clé BREVO_API_KEY manque côté serveur.");

  const mode = modePiece({ nom: doc.nom, taille: doc.taille });
  let piece: { nom: string; contenu: string } | null = null;
  let lien: string | null = null;
  if (mode === 'jointe') {
    const { data: fichier, error: errFichier } = await admin.storage.from('documents').download(doc.storage_path);
    if (errFichier || !fichier) throw new Refus(502, 'Fichier illisible dans Documents.');
    piece = { nom: doc.nom, contenu: encodeBase64(new Uint8Array(await fichier.arrayBuffer())) };
  } else {
    const { data: signe, error: errLien } = await admin.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, LIEN_JOURS * 24 * 3600, { download: doc.nom });
    if (errLien || !signe?.signedUrl) throw new Refus(502, 'Lien de téléchargement impossible à créer.');
    lien = signe.signedUrl;
  }

  const courriel = construireCourriel({
    expediteur: EXPEDITEUR,
    a: demande.a,
    cc: demande.cc,
    objet: demande.objet,
    message: demande.message,
    piece,
    lien,
    nomFichier: doc.nom,
  });

  const trace = { document: doc.id, etablissement: doc.etablissement_id, destinataires: demande.a.length + demande.cc.length, mode };
  if (dryRun) {
    journal('essai', trace);
    return { ok: true, dryRun: true, mode, destinataires: demande.a.length + demande.cc.length, expediteur: EXPEDITEUR.email };
  }

  let reponse: Response;
  try {
    reponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': CLE_BREVO, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(courriel),
      signal: AbortSignal.timeout(DELAI_BREVO_MS),
    });
  } catch (e) {
    journal('brevo_injoignable', { ...trace, erreur: (e as Error)?.name || 'Error' });
    throw new Refus(502, "Brevo ne répond pas. L'envoi n'est pas parti, réessayez.");
  }
  let retour: Record<string, unknown> = {};
  try { retour = await reponse.json(); } catch { retour = {}; }
  if (!reponse.ok) {
    journal('brevo_refus', { ...trace, statut: reponse.status, code: retour.code ?? null });
    const motif = typeof retour.message === 'string' ? retour.message : `statut ${reponse.status}`;
    if (reponse.status === 401) throw new Refus(502, 'Brevo refuse la clé : vérifiez BREVO_API_KEY.');
    throw new Refus(502, `Brevo a refusé l'envoi : ${motif}`);
  }
  journal('envoye', { ...trace, statut: reponse.status });
  return { ok: true, messageId: typeof retour.messageId === 'string' ? retour.messageId : null, mode };
}

Deno.serve(async (req) => {
  const cors = enTetesCors(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const repondre = (statut: number, corps: unknown) => new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  if (req.method !== 'POST') return repondre(405, { error: 'Méthode non permise.' });

  try {
    let corps: Record<string, unknown> = {};
    try { corps = (await req.json()) ?? {}; } catch { corps = {}; }
    const personne = await lirePersonne(req.headers.get('Authorization'));
    const action = corps.action;
    if (action === 'etat') return repondre(200, { configure: Boolean(CLE_BREVO), expediteur: EXPEDITEUR.email });
    if (action === 'envoyer') return repondre(200, await envoyer(personne, corps));
    return repondre(400, { error: 'Action inconnue.' });
  } catch (e) {
    if (e instanceof Refus) return repondre(e.statut, { error: e.message });
    journal('erreur', { erreur: (e as Error)?.name || 'Error' });
    return repondre(500, { error: 'Erreur du serveur.' });
  }
});
