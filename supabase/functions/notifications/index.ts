// ================================================================
// Edge Function « notifications » : notifications push (Web Push) sur les
// téléphones et tablettes de l'équipe.
//
// Deux événements :
// - une nouvelle réservation de table en ligne. La base appelle cette fonction
//   elle-même (déclencheur push_nouvelle_resa sur reservations, migration
//   20261002_push_notifications) : peu importe le chemin qui a créé la
//   réservation, la notification part ;
// - une nouvelle alerte (alert_instances), à la fin de chaque passage de
//   alerts-evaluator (migration 20261027_alertes_notification_push).
//
// Actions (POST JSON { action, ... }) :
//   cle            session  → { cle } : clé publique VAPID, pour abonner un
//                             appareil (pushManager.subscribe). Les clés sont
//                             créées au premier appel et ne quittent jamais
//                             la base (push_config, sans politique RLS).
//   test           session  → notification d'essai sur les appareils abonnés
//                             de l'utilisateur appelant
//   nouvelle_resa  interne  → { reservationId, secret, dryRun? } : notifie les
//                             appareils abonnés à l'établissement DE LA
//                             RÉSERVATION dont la personne voit Réservations
//                             (gardeReservations). secret =
//                             push_config.secret_interne (seule la base le
//                             connaît : c'est elle qui appelle). dryRun : rien
//                             n'est envoyé ; rend le nombre d'appareils et de
//                             personnes qui recevraient.
//   alertes        interne  → { secret, dryRun?, instanceIds? } : envoie les
//                             instances d'alerte en attente (push_etat
//                             'a_envoyer'), chacune une seule fois, aux appareils
//                             abonnés de ses destinataires (rôle dans
//                             target_roles ou id dans target_user_ids, profil
//                             actif, établissement de l'instance). Appelée par
//                             alerts-evaluator avec le même secret.
//                             dryRun : rien n'est pris, envoyé ni écrit ; rend
//                             l'aperçu (titre, corps, nombre d'appareils) des
//                             instances en attente, ou de instanceIds.
//
// Les abonnements (push_abonnements) sont écrits par l'app sous RLS : un
// appareil, un utilisateur, un établissement. Un abonnement que le service de
// push déclare expiré (404 / 410) est supprimé.
//
// Sécurité : verify_jwt=false (l'appel de la base n'a pas de session) ; cle et
// test vérifient eux-mêmes le JWT, nouvelle_resa et alertes le secret interne.
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
// un abonnement survit à un départ de l'équipe, pas la notification. Même règle
// que user_can_access_etab (actif IS NOT FALSE, sans passe-droit consultant).
// garde : filtre de plus sur le profil (destinataires d'une alerte).
type Profil = { id: string; role: string | null; actif: boolean | null; etablissement_ids: string[] | null };
async function abonnesDeLEtab(sb: Admin, etabId: string, garde?: (p: Profil) => boolean): Promise<Abonnement[]> {
  const { data: abos } = await sb.from('push_abonnements')
    .select('id, user_id, endpoint, p256dh, auth').eq('etablissement_id', etabId);
  const liste = (abos || []) as Abonnement[];
  if (!liste.length) return [];
  const ids = [...new Set(liste.map((a) => a.user_id))];
  const { data: profils } = await sb.from('profiles').select('id, role, actif, etablissement_ids').in('id', ids);
  const ok = new Set(((profils || []) as Profil[])
    .filter((p) => p.actif !== false && Array.isArray(p.etablissement_ids) && p.etablissement_ids.includes(etabId))
    .filter((p) => !garde || garde(p))
    .map((p) => String(p.id)));
  return liste.filter((a) => ok.has(a.user_id));
}

// ── Réservations en ligne ─────────────────────────────────────────
// Le corps nomme le client : seuls les abonnés qui voient Réservations dans
// l'établissement le reçoivent. Même règle que le menu (useVisibleNav) :
// module actif pour l'établissement (modules_actifs, NULL = tous), puis écart
// de la personne (permissions_utilisateurs), sinon réglage du rôle
// (permissions), sinon défaut du code (defaultPermissions de moduleConfig.js).
// Seul écart voulu : un rôle inconnu du code n'a rien, là où le menu
// l'afficherait. Une lecture en échec rend null : la réservation ne part à
// personne.
const RESA_PAR_DEFAUT = ['consultant', 'patron', 'resp_cuisine', 'serveur', 'hote'];
async function gardeReservations(sb: Admin, etabId: string): Promise<((p: Profil) => boolean) | null> {
  const [etab, roles, abos] = await Promise.all([
    sb.from('etablissements').select('modules_actifs').eq('id', etabId).maybeSingle(),
    sb.from('permissions').select('role_key, perms'),
    sb.from('push_abonnements').select('user_id').eq('etablissement_id', etabId),
  ]);
  if (etab.error || !etab.data || roles.error || abos.error) return null;
  const actifs = etab.data.modules_actifs;
  if (Array.isArray(actifs) && !actifs.includes('previsions')) return () => false;
  const ids = [...new Set((abos.data || []).map((a) => String(a.user_id)))];
  if (!ids.length) return () => false;
  const perso = await sb.from('permissions_utilisateurs').select('user_id, perms').in('user_id', ids);
  if (perso.error) return null;
  const droit = (perms: unknown) => (perms as Record<string, unknown> | null)?.previsions;
  const duRole = new Map((roles.data || []).map((r) => [String(r.role_key), droit(r.perms)] as [string, unknown]));
  const ecart = new Map((perso.data || []).map((r) => [String(r.user_id), droit(r.perms)] as [string, unknown]));
  return (p) => {
    const v = [ecart.get(String(p.id)), duRole.get(String(p.role || ''))].find((x) => typeof x === 'boolean');
    return typeof v === 'boolean' ? v : RESA_PAR_DEFAUT.includes(String(p.role || ''));
  };
}

// ── Alertes ───────────────────────────────────────────────────────
type Instance = {
  id: string; rule_id: string; etablissement_id: string; title: string | null; status: string;
  link_module: string | null; target_roles: string[] | null; target_user_ids: string[] | null;
  dedupe_key: string | null; created_at: string;
};

// Une instance plus vieille ne part plus (reprise après une panne : on ne
// réveille pas l'équipe pour une alerte de la veille).
const ALERTE_PERIMEE_MS = 3 * 3600 * 1000;
// Une alerte horaire écartée dont le sujet est toujours en défaut est recréée
// au passage suivant (relevé du 27.10.2026) : la nouvelle instance ne sonne
// pas si l'écarter date de moins de 20 h. Une règle quotidienne n'est pas
// concernée : son instance du lendemain est un nouvel événement (relevé du
// jour, rappel du jour), même si celle de la veille a été écartée.
const REBOND_MS = 20 * 3600 * 1000;

// Écran verrouillé : le titre ne nomme personne. Le pointage nomme l'employé
// (« Pointage manquant - Prénom Nom ») : seul le motif part. Les autres titres
// nomment une zone, un produit ou un nombre ; celui d'une alerte personnalisée
// est le texte choisi par l'auteur de la règle. Type inconnu : titre neutre.
const TITRE_SANS_PERSONNE = new Set([
  'haccp_manquant', 'reservation_non_confirmee', 'stock_critique',
  'ventes_inactives', 'pertes_elevees', 'personnalisee',
]);
function titreAlerte(ruleType: string | undefined, titre: string | null): string {
  if (ruleType === 'pointage_manquant') return 'Pointage manquant';
  const t = String(titre || '').trim();
  return ruleType && TITRE_SANS_PERSONNE.has(ruleType) && t ? t : 'Nouvelle alerte';
}

async function recreeeApresEcarter(sb: Admin, inst: Instance): Promise<boolean> {
  let q = sb.from('alert_instances').select('status, dismissed_at')
    .eq('rule_id', inst.rule_id).neq('id', inst.id).lt('created_at', inst.created_at);
  q = inst.dedupe_key ? q.eq('dedupe_key', inst.dedupe_key) : q.is('dedupe_key', null);
  const { data } = await q.order('created_at', { ascending: false }).limit(1);
  const prev = data?.[0] as { status: string; dismissed_at: string | null } | undefined;
  return prev?.status === 'dismissed' && !!prev.dismissed_at
    && Date.now() - Date.parse(prev.dismissed_at) < REBOND_MS;
}

async function envoyerAlertes(sb: Admin, dryRun: boolean, instanceIds: string[] | null) {
  let q = sb.from('alert_instances')
    .select('id, rule_id, etablissement_id, title, status, link_module, target_roles, target_user_ids, dedupe_key, created_at');
  q = instanceIds ? q.in('id', instanceIds) : q.eq('push_etat', 'a_envoyer');
  const { data, error } = await q.order('created_at', { ascending: true }).limit(100);
  if (error) throw new Error(error.message);
  const instances = (data || []) as Instance[];
  const bilan = { traitees: 0, envoyees: 0, sans_envoi: 0, appareils: 0, echecs: 0, expires: 0 };
  if (!instances.length) return { ...bilan, dryRun, apercu: [] as unknown[] };

  const { data: regles } = await sb.from('alert_rules').select('id, rule_type, schedule_type')
    .in('id', [...new Set(instances.map((i) => i.rule_id))]);
  const typeRegle = new Map((regles || []).map((r) => [String(r.id), String(r.rule_type)] as [string, string]));
  const quotidienne = new Set((regles || []).filter((r) => r.schedule_type === 'daily').map((r) => String(r.id)));
  const { data: etabs } = await sb.from('etablissements').select('id, nom')
    .in('id', [...new Set(instances.map((i) => i.etablissement_id))]);
  const nomEtab = new Map((etabs || []).map((e) => [String(e.id), String(e.nom || '')] as [string, string]));

  const apercu: unknown[] = [];
  for (const inst of instances) {
    // Prise : une seule exécution passe a_envoyer à en_cours. Un passage
    // doublé, ou une reprise après un envoi interrompu, ne renvoie jamais.
    if (!dryRun) {
      const { data: prise } = await sb.from('alert_instances')
        .update({ push_etat: 'en_cours', push_at: new Date().toISOString() })
        .eq('id', inst.id).eq('push_etat', 'a_envoyer').select('id');
      if (!prise?.length) continue;
    }
    bilan.traitees++;

    let motif = '';
    if (inst.status !== 'active') motif = 'close';
    else if (Date.now() - Date.parse(inst.created_at) > ALERTE_PERIMEE_MS) motif = 'perimee';
    else if (!quotidienne.has(inst.rule_id) && await recreeeApresEcarter(sb, inst)) motif = 'ecartee';

    const roles = inst.target_roles || [];
    const nominatifs = inst.target_user_ids || [];
    const abonnes = motif && !dryRun ? [] : await abonnesDeLEtab(sb, inst.etablissement_id,
      (p) => roles.includes(String(p.role || '')) || nominatifs.includes(String(p.id)));
    if (!motif && !abonnes.length) motif = 'aucun_abonne';

    const message: Message = {
      titre: titreAlerte(typeRegle.get(inst.rule_id), inst.title),
      corps: nomEtab.get(inst.etablissement_id) || '',
      url: `/?page=${encodeURIComponent(inst.link_module || 'dashboard')}&etab=${encodeURIComponent(inst.etablissement_id)}`,
      tag: `alerte-${inst.id}`,
    };

    if (dryRun) {
      apercu.push({
        instance: inst.id, regle: typeRegle.get(inst.rule_id) || null, titre: message.titre,
        corps: message.corps, url: message.url, appareils: abonnes.length,
        personnes: new Set(abonnes.map((a) => a.user_id)).size, motif: motif || null,
      });
      continue;
    }
    if (motif) {
      await sb.from('alert_instances').update({ push_etat: 'sans_envoi' }).eq('id', inst.id);
      bilan.sans_envoi++;
      console.log('[notifications] alerte', inst.id, 'sans envoi :', motif);
      continue;
    }
    const res = await envoyer(sb, abonnes, message);
    await sb.from('alert_instances').update({ push_etat: res.envoyes > 0 ? 'envoye' : 'sans_envoi' }).eq('id', inst.id);
    if (res.envoyes > 0) bilan.envoyees++; else bilan.sans_envoi++;
    bilan.appareils += res.envoyes; bilan.echecs += res.echecs; bilan.expires += res.expires;
    console.log('[notifications] alerte', inst.id, JSON.stringify(res));
  }
  return { ...bilan, dryRun, apercu };
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
    const garde = await gardeReservations(sb, r.etablissement_id);
    if (!garde) console.warn('[notifications] nouvelle_resa', r.id, 'droits illisibles : aucun envoi');
    const abonnes = garde ? await abonnesDeLEtab(sb, r.etablissement_id, garde) : [];
    if (body.dryRun === true) {
      return json({ ok: true, dryRun: true, appareils: abonnes.length, personnes: new Set(abonnes.map((a) => a.user_id)).size });
    }
    const demande = r.statut === 'demande';
    const n = Number(r.nb_couverts || 0);
    const res = await envoyer(sb, abonnes, {
      titre: demande ? 'Nouvelle demande de réservation' : 'Nouvelle réservation en ligne',
      corps: `${r.nom || 'Client'}, ${n} pers., ${jourCourt(r.date_service)} à ${String(r.heure_arrivee).slice(0, 5)}`
        + (etab?.nom ? `\n${etab.nom}` : '')
        + (demande ? '\nÀ confirmer dans Réservations' : ''),
      url: `/?page=previsions&etab=${encodeURIComponent(r.etablissement_id)}`,
      tag: `resa-${r.id}`,
    });
    console.log('[notifications] nouvelle_resa', r.id, JSON.stringify(res));
    return json({ ok: true, ...res });
  }

  // ── Appel de alerts-evaluator : nouvelles alertes ──
  if (action === 'alertes') {
    const cfg = await lireConfig(sb);
    if (!cfg || !body.secret || String(body.secret) !== cfg.secret_interne) return json({ error: 'Non autorisé.' }, 401);
    const dryRun = body.dryRun === true;
    const ids = dryRun && Array.isArray(body.instanceIds) ? body.instanceIds.map(String).slice(0, 50) : null;
    try {
      return json({ ok: true, ...(await envoyerAlertes(sb, dryRun, ids)) });
    } catch (e) {
      console.error('[notifications] alertes', e instanceof Error ? e.message : String(e));
      return json({ error: 'Lecture des alertes impossible.' }, 500);
    }
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
      corps: 'Vous serez prévenu ici des réservations en ligne et des alertes qui vous sont destinées.',
      url: '/?page=previsions',
      tag: 'test',
    });
    return json({ ok: true, ...res });
  }

  return json({ error: 'Action inconnue.' }, 400);
});
