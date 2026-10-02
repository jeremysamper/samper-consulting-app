// ================================================================
// Edge Function « notifications » : notifications push (Web Push) sur les
// téléphones et tablettes de l'équipe.
//
// Aujourd'hui un seul événement : une nouvelle réservation de table en ligne.
// La base appelle cette fonction elle-même (déclencheur push_nouvelle_resa sur
// reservations, migration 20261002_push_notifications) : peu importe le chemin
// qui a créé la réservation, la notification part.
//
// Actions (POST JSON { action, ... }) :
//   cle            session  → { cle } : clé publique VAPID, pour abonner un
//                             appareil (pushManager.subscribe). Les clés sont
//                             créées au premier appel et ne quittent jamais
//                             la base (push_config, sans politique RLS).
//   test           session  → notification d'essai sur les appareils abonnés
//                             de l'utilisateur appelant
//   nouvelle_resa  interne  → { reservationId, secret } : notifie les appareils
//                             abonnés à l'établissement DE LA RÉSERVATION.
//                             secret = push_config.secret_interne (seule la base
//                             le connaît : c'est elle qui appelle).
//
// Les abonnements (push_abonnements) sont écrits par l'app sous RLS : un
// appareil, un utilisateur, un établissement. Un abonnement que le service de
// push déclare expiré (404 / 410) est supprimé.
//
// Sécurité : verify_jwt=false (l'appel de la base n'a pas de session) ; cle et
// test vérifient eux-mêmes le JWT, nouvelle_resa le secret interne.
// ================================================================
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

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

type Admin = SupabaseClient;

function admin(): Admin {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

type Config = { secret_interne: string; vapid: webpush.ExportedVapidKeys | null; contact: string };

async function lireConfig(sb: Admin): Promise<Config | null> {
  const { data } = await sb.from('push_config').select('secret_interne, vapid, contact').eq('id', 1).maybeSingle();
  return (data as Config) || null;
}

// Clés VAPID : créées une fois, au premier besoin. Deux appels simultanés ne
// peuvent pas en écrire deux paires (mise à jour conditionnée à vapid NULL).
async function clesVapid(sb: Admin): Promise<{ cles: CryptoKeyPair; contact: string } | null> {
  let cfg = await lireConfig(sb);
  if (!cfg) return null;
  if (!cfg.vapid) {
    const neuves = await webpush.exportVapidKeys(await webpush.generateVapidKeys({ extractable: true }));
    await sb.from('push_config').update({ vapid: neuves, updated_at: new Date().toISOString() }).eq('id', 1).is('vapid', null);
    cfg = await lireConfig(sb);
    if (!cfg?.vapid) return null;
  }
  return { cles: await webpush.importVapidKeys(cfg.vapid, { extractable: false }), contact: cfg.contact };
}

type Abonnement = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Message = { titre: string; corps: string; url: string; tag: string };

// Envoie le message à chaque abonnement ; supprime ceux que le service de push
// déclare expirés. Ne lève jamais : renvoie le décompte.
async function envoyer(sb: Admin, abonnements: Abonnement[], message: Message) {
  if (!abonnements.length) return { envoyes: 0, echecs: 0, expires: 0 };
  const vapid = await clesVapid(sb);
  if (!vapid) return { envoyes: 0, echecs: abonnements.length, expires: 0 };
  const serveur = await webpush.ApplicationServer.new({ contactInformation: vapid.contact, vapidKeys: vapid.cles });
  const charge = JSON.stringify(message);
  let envoyes = 0; let echecs = 0; let expires = 0;
  await Promise.all(abonnements.map(async (a) => {
    try {
      await serveur.subscribe({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } })
        .pushTextMessage(charge, { urgency: webpush.Urgency.High, ttl: 24 * 3600, topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) });
      envoyes++;
      await sb.from('push_abonnements').update({ dernier_envoi_at: new Date().toISOString() }).eq('id', a.id);
    } catch (e) {
      const statut = e instanceof webpush.PushMessageError ? e.response.status : 0;
      if (statut === 404 || statut === 410) {
        expires++;
        await sb.from('push_abonnements').delete().eq('id', a.id);
      } else {
        echecs++;
        console.warn('[notifications] envoi refusé', statut, e instanceof Error ? e.message : String(e));
      }
    }
  }));
  return { envoyes, echecs, expires };
}

// ── Textes ────────────────────────────────────────────────────────
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function jourCourt(iso: string) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${JOURS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MOIS[m - 1]}`;
}

// ── Authentification de l'équipe ──────────────────────────────────
async function appelant(req: Request, sb: Admin) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const { data: profil } = await sb.from('profiles').select('actif').eq('id', data.user.id).maybeSingle();
  if (!profil || profil.actif === false) return null;
  return { uid: data.user.id };
}

// Seuls les membres actifs ayant encore accès à l'établissement sont notifiés :
// un abonnement survit à un départ de l'équipe, pas la notification.
async function abonnesDeLEtab(sb: Admin, etabId: string): Promise<Abonnement[]> {
  const { data: abos } = await sb.from('push_abonnements')
    .select('id, user_id, endpoint, p256dh, auth').eq('etablissement_id', etabId);
  const liste = (abos || []) as Abonnement[];
  if (!liste.length) return [];
  const ids = [...new Set(liste.map((a) => a.user_id))];
  const { data: profils } = await sb.from('profiles').select('id, actif, etablissement_ids').in('id', ids);
  const ok = new Set((profils || [])
    .filter((p) => p.actif !== false && Array.isArray(p.etablissement_ids) && p.etablissement_ids.includes(etabId))
    .map((p) => String(p.id)));
  return liste.filter((a) => ok.has(a.user_id));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const action = String(body.action || '');
  const sb = admin();

  // ── Appel de la base : nouvelle réservation en ligne ──
  if (action === 'nouvelle_resa') {
    const cfg = await lireConfig(sb);
    if (!cfg || !body.secret || String(body.secret) !== cfg.secret_interne) return json({ error: 'Non autorisé.' }, 401);
    const { data: r } = await sb.from('reservations')
      .select('id, etablissement_id, nom, date_service, heure_arrivee, nb_couverts, statut, origine')
      .eq('id', String(body.reservationId || '')).maybeSingle();
    if (!r || r.origine !== 'en_ligne') return json({ ok: true, ignore: true });
    const { data: etab } = await sb.from('etablissements').select('id, nom').eq('id', r.etablissement_id).maybeSingle();
    const abonnes = await abonnesDeLEtab(sb, r.etablissement_id);
    const demande = r.statut === 'demande';
    const n = Number(r.nb_couverts || 0);
    const res = await envoyer(sb, abonnes, {
      titre: demande ? 'Nouvelle demande de réservation' : 'Nouvelle réservation en ligne',
      corps: `${r.nom || 'Client'} · ${n} pers. · ${jourCourt(r.date_service)} à ${String(r.heure_arrivee).slice(0, 5)}`
        + (etab?.nom ? `\n${etab.nom}` : '')
        + (demande ? '\nÀ confirmer dans Réservations' : ''),
      url: `/?page=previsions&etab=${encodeURIComponent(r.etablissement_id)}`,
      tag: `resa-${r.id}`,
    });
    console.log('[notifications] nouvelle_resa', r.id, JSON.stringify(res));
    return json({ ok: true, ...res });
  }

  // ── Actions de l'équipe : session obligatoire ──
  const qui = await appelant(req, sb);
  if (!qui) return json({ error: 'Session invalide.' }, 401);

  if (action === 'cle') {
    const vapid = await clesVapid(sb);
    if (!vapid) return json({ error: 'Notifications non configurées sur le serveur.' }, 503);
    return json({ cle: await webpush.exportApplicationServerKey(vapid.cles) });
  }

  if (action === 'test') {
    const { data: abos } = await sb.from('push_abonnements')
      .select('id, user_id, endpoint, p256dh, auth').eq('user_id', qui.uid);
    const liste = (abos || []) as Abonnement[];
    if (!liste.length) return json({ error: 'Aucun appareil abonné pour ce compte.' }, 400);
    const res = await envoyer(sb, liste, {
      titre: 'Notifications activées',
      corps: 'Vous serez prévenu ici à chaque nouvelle réservation en ligne.',
      url: '/?page=previsions',
      tag: 'test',
    });
    return json({ ok: true, ...res });
  }

  return json({ error: 'Action inconnue.' }, 400);
});
