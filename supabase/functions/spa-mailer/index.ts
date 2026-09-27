// ================================================================
// Edge Function « spa-mailer »
//
// Tous les e-mails du module Spa partent d'ici : la clé du fournisseur
// (Resend) reste côté serveur, et c'est ici seulement que naissent les bons
// cadeaux (spa_bons n'a aucune politique INSERT pour le front).
//
// Actions (POST JSON { action, ... }) :
//   etat          membre      → { configure } : le fournisseur est-il branché ?
//   test          direction   → e-mail d'essai (actualité ou anniversaire) à
//                               l'adresse du compte connecté
//   campagne      direction   → actualité à tous les clients consentants
//   bon           équipe      → bon cadeau à un client, tout de suite
//   anniversaires cron        → tous les établissements dont l'envoi est actif
//                 direction   → le seul établissement demandé (rattrapage)
//   desinscription public     → { token } : retire le consentement
//
// Sécurité : verify_jwt=false (le lien de désinscription et le cron n'ont pas
// de session). Chaque action authentifie elle-même : CRON_SECRET pour le cron,
// JWT + profil (rôle, établissements) pour l'équipe, jeton uuid non devinable
// pour la désinscription.
//
// Secrets : RESEND_API_KEY, SPA_MAIL_FROM (adresse d'un domaine vérifié chez
// Resend, ex. spa@samperconsulting-app.com), CRON_SECRET, APP_PUBLIC_URL
// (facultatif, défaut https://samperconsulting-app.com).
// ================================================================
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

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

const TZ = 'Europe/Zurich';
const ROLES_EQUIPE = ['consultant', 'patron', 'resp_cuisine', 'cuisinier', 'serveur', 'hote'];
const ROLES_DIRECTION = ['consultant', 'patron'];
const RESEND_URL = 'https://api.resend.com';
const LOT_MAX = 100; // limite de l'API batch de Resend

type Admin = SupabaseClient;

function admin(): Admin {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

function config() {
  const cle = Deno.env.get('RESEND_API_KEY') || '';
  const from = Deno.env.get('SPA_MAIL_FROM') || '';
  const appUrl = (Deno.env.get('APP_PUBLIC_URL') || 'https://samperconsulting-app.com').replace(/\/+$/, '');
  return { cle, from, appUrl, configure: Boolean(cle && from) };
}

// ── Dates à Zurich ────────────────────────────────────────────────
function zurichToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function estBissextile(annee: number) {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

// Anniversaire « aujourd'hui » : un client né un 29 février est fêté le 28
// les années non bissextiles, plutôt que jamais.
function fetéAujourdhui(naissance: string, aujourdhui: string): boolean {
  const [annee, mois, jour] = aujourdhui.split('-').map(Number);
  const [, mN, jN] = naissance.split('-').map(Number);
  if (mN === 2 && jN === 29 && !estBissextile(annee)) return mois === 2 && jour === 28;
  return mois === mN && jour === jN;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
function dateLongue(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}

// ── Codes de bon : sans caractères ambigus (0/O, 1/I/L) ───────────
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function codeBon(nomEtab: string) {
  const prefixe = (nomEtab || 'SPA').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'SPA';
  const octets = crypto.getRandomValues(new Uint8Array(8));
  const c = Array.from(octets, (o) => ALPHABET[o % ALPHABET.length]).join('');
  return `${prefixe}-${c.slice(0, 4)}-${c.slice(4)}`;
}

// ── Gabarit HTML ─────────────────────────────────────────────────
function esc(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function personnaliser(texte: string, client: { prenom?: string | null; nom?: string | null }) {
  const prenom = (client.prenom || '').trim() || (client.nom || '').trim();
  return String(texte || '')
    .replace(/\{prenom\}/gi, prenom)
    .replace(/\{nom\}/gi, (client.nom || '').trim());
}

function paragraphes(texte: string) {
  return String(texte || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2b2b2b;">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

type Etab = { id: string; nom: string; adresse?: string | null; tel?: string | null; email?: string | null };
type Params = {
  anniversaire_actif: boolean; bon_valeur: string; bon_validite_jours: number;
  anniversaire_sujet: string | null; anniversaire_message: string | null;
  nom_expediteur: string | null; email_reponse: string | null; signature: string | null;
};
type Client = {
  id: string; prenom: string | null; nom: string | null; email: string | null;
  date_naissance: string | null; consentement_marketing: boolean; desinscription_token: string; archive: boolean;
};
type Bon = { code: string; valeur: string; valable_jusqu: string | null; message?: string | null };

const PARAMS_DEFAUT: Params = {
  anniversaire_actif: false,
  bon_valeur: '20 % sur le soin de votre choix',
  bon_validite_jours: 60,
  anniversaire_sujet: null,
  anniversaire_message: null,
  nom_expediteur: null,
  email_reponse: null,
  signature: null,
};

const SUJET_ANNIV = 'Joyeux anniversaire {prenom} : un cadeau vous attend';
const MESSAGE_ANNIV = 'Bonjour {prenom},\n\nToute l\'équipe vous souhaite un très joyeux anniversaire.\n\nPour l\'occasion, nous avons le plaisir de vous offrir le bon ci-dessous. Il suffit de le présenter (ou de nous donner son code) lors de votre réservation.\n\nAu plaisir de vous accueillir très bientôt.';

function lienDesinscription(appUrl: string, token: string) {
  return `${appUrl}/api/spa-desinscription?t=${encodeURIComponent(token)}`;
}

function gabarit(opts: {
  etab: Etab; params: Params; titre: string; corps: string; bon?: Bon | null; lienDesinscr?: string | null;
}) {
  const { etab, params, titre, corps, bon, lienDesinscr } = opts;
  const signature = (params.signature || '').trim() || `L'équipe ${etab.nom}`;
  const coordonnees = [etab.adresse, etab.tel, params.email_reponse || etab.email].filter(Boolean).map(esc).join('<br>');
  const carteBon = bon ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-collapse:separate;">
      <tr><td style="border:1px solid #d9cbb6;border-radius:14px;background:#fbf7f1;padding:26px 22px;text-align:center;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9a8466;margin-bottom:10px;">Bon cadeau</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:#2b2b2b;margin-bottom:16px;">${esc(bon.valeur)}</div>
        ${bon.message ? `<div style="font-size:14px;line-height:1.55;color:#5a5a5a;margin-bottom:16px;">${esc(bon.message)}</div>` : ''}
        <div style="display:inline-block;padding:10px 18px;border:1px dashed #9a8466;border-radius:8px;font-family:'Courier New',monospace;font-size:18px;letter-spacing:2px;color:#2b2b2b;">${esc(bon.code)}</div>
        ${bon.valable_jusqu ? `<div style="font-size:12px;color:#8a8a8a;margin-top:12px;">Valable jusqu'au ${esc(dateLongue(bon.valable_jusqu))}</div>` : ''}
      </td></tr>
    </table>` : '';
  const pied = lienDesinscr
    ? `Vous recevez cet e-mail car vous avez accepté de recevoir nos nouvelles. <a href="${esc(lienDesinscr)}" style="color:#8a8a8a;">Se désinscrire</a>`
    : '';
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titre)}</title></head>
<body style="margin:0;padding:0;background:#f3efe9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe9;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:30px 32px 8px;text-align:center;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:1px;color:#2b2b2b;">${esc(etab.nom)}</div>
          <div style="width:40px;height:1px;background:#d9cbb6;margin:16px auto 0;"></div>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;font-family:Helvetica,Arial,sans-serif;">
          ${paragraphes(corps)}
          ${carteBon}
          <p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:#2b2b2b;">${esc(signature).replace(/\n/g, '<br>')}</p>
        </td></tr>
        <tr><td style="padding:22px 32px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#8a8a8a;text-align:center;border-top:1px solid #f0ebe3;">
          ${coordonnees ? `<div>${coordonnees}</div>` : ''}
          ${pied ? `<div style="margin-top:8px;">${pied}</div>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function texteBrut(corps: string, bon?: Bon | null, lien?: string | null) {
  const lignes = [corps.trim()];
  if (bon) {
    lignes.push('', `BON CADEAU : ${bon.valeur}`, `Code : ${bon.code}`);
    if (bon.valable_jusqu) lignes.push(`Valable jusqu'au ${dateLongue(bon.valable_jusqu)}`);
  }
  if (lien) lignes.push('', `Se désinscrire : ${lien}`);
  return lignes.join('\n');
}

// ── Envoi (Resend) ────────────────────────────────────────────────
type Mail = {
  to: string; subject: string; html: string; text: string;
  from: string; reply_to?: string; headers?: Record<string, string>;
};

function expediteur(etab: Etab, params: Params, from: string) {
  const nom = ((params.nom_expediteur || '').trim() || etab.nom).replace(/["<>]/g, '');
  return `${nom} <${from}>`;
}

function enTetesDesinscription(lien: string | null) {
  if (!lien) return undefined;
  return { 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

async function envoyerUn(cle: string, mail: Mail): Promise<{ id?: string; erreur?: string }> {
  try {
    const r = await fetch(`${RESEND_URL}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mail),
    });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) return { erreur: String(corps?.message || corps?.error || `HTTP ${r.status}`).slice(0, 300) };
    return { id: corps?.id };
  } catch (e) {
    return { erreur: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

// Lot de 100 au plus. Resend renvoie les ids dans l'ordre ; en cas d'échec du
// lot entier, chaque e-mail du lot est marqué en échec.
async function envoyerLot(cle: string, mails: Mail[]): Promise<{ id?: string; erreur?: string }[]> {
  try {
    const r = await fetch(`${RESEND_URL}/emails/batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mails),
    });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) {
      const erreur = String(corps?.message || corps?.error || `HTTP ${r.status}`).slice(0, 300);
      return mails.map(() => ({ erreur }));
    }
    const ids: { id?: string }[] = Array.isArray(corps?.data) ? corps.data : [];
    return mails.map((_, i) => ({ id: ids[i]?.id }));
  } catch (e) {
    const erreur = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    return mails.map(() => ({ erreur }));
  }
}

// ── Lecture établissement + paramètres ────────────────────────────
async function lireEtab(sb: Admin, etabId: string): Promise<{ etab: Etab; params: Params } | null> {
  const [{ data: etab }, { data: params }] = await Promise.all([
    sb.from('etablissements').select('id, nom, adresse, tel, email').eq('id', etabId).maybeSingle(),
    sb.from('spa_parametres').select('*').eq('etablissement_id', etabId).maybeSingle(),
  ]);
  if (!etab) return null;
  return { etab: etab as Etab, params: { ...PARAMS_DEFAUT, ...(params || {}) } as Params };
}

// ── Authentification de l'équipe ──────────────────────────────────
type Appelant = { uid: string; email: string | null; role: string; etabIds: string[] };

async function appelant(req: Request, sb: Admin): Promise<Appelant | null> {
  const auth = req.headers.get('authorization') || '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const { data: profil } = await sb.from('profiles')
    .select('role, etablissement_ids, actif, email').eq('id', data.user.id).maybeSingle();
  if (!profil || profil.actif === false) return null;
  return {
    uid: data.user.id,
    email: profil.email || data.user.email || null,
    role: profil.role || '',
    etabIds: Array.isArray(profil.etablissement_ids) ? profil.etablissement_ids : [],
  };
}

function autorise(a: Appelant | null, etabId: string, roles: string[]) {
  return Boolean(a && etabId && a.etabIds.includes(etabId) && roles.includes(a.role));
}

// ── Émission d'un bon ─────────────────────────────────────────────
async function creerBon(sb: Admin, etab: Etab, clientId: string, champs: {
  motif: 'anniversaire' | 'cadeau'; valeur: string; message?: string | null; validiteJours: number; createdBy?: string | null;
}) {
  for (let essai = 0; essai < 4; essai++) {
    const { data, error } = await sb.from('spa_bons').insert({
      etablissement_id: etab.id,
      client_id: clientId,
      code: codeBon(etab.nom),
      motif: champs.motif,
      valeur: champs.valeur,
      message: champs.message || null,
      valable_jusqu: addDaysIso(zurichToday(), champs.validiteJours),
      created_by: champs.createdBy || null,
    }).select().single();
    if (!error) return data;
    if (error.code !== '23505') throw error; // collision de code : on retire
  }
  throw new Error('Impossible de générer un code de bon unique.');
}

// ── Anniversaires d'un établissement ──────────────────────────────
async function anniversairesEtab(sb: Admin, cfg: ReturnType<typeof config>, etabId: string, forcer = false) {
  const lu = await lireEtab(sb, etabId);
  if (!lu) return { etabId, erreur: 'établissement introuvable' };
  const { etab, params } = lu;
  if (!params.anniversaire_actif && !forcer) return { etabId, ignore: 'envoi désactivé' };

  const aujourdhui = zurichToday();
  const annee = Number(aujourdhui.slice(0, 4));
  const { data: clients, error } = await sb.from('spa_clients')
    .select('id, prenom, nom, email, date_naissance, consentement_marketing, desinscription_token, archive')
    .eq('etablissement_id', etabId)
    .eq('consentement_marketing', true)
    .eq('archive', false)
    .not('email', 'is', null)
    .not('date_naissance', 'is', null);
  if (error) return { etabId, erreur: error.message };

  const fetes = (clients as Client[]).filter((c) => c.date_naissance && fetéAujourdhui(c.date_naissance, aujourdhui));
  let envoyes = 0; let echecs = 0; let dejaFaits = 0;

  for (const c of fetes) {
    // Réservation de la place : l'index unique partiel empêche un second
    // e-mail la même année, même si deux passages du cron se chevauchent.
    const { data: envoi, error: errClaim } = await sb.from('spa_envois').insert({
      etablissement_id: etabId, client_id: c.id, type: 'anniversaire', email: c.email, annee, statut: 'en_cours',
    }).select('id').single();
    if (errClaim) { dejaFaits++; continue; }

    try {
      const bon = await creerBon(sb, etab, c.id, {
        motif: 'anniversaire', valeur: params.bon_valeur, validiteJours: params.bon_validite_jours,
      });
      const lien = lienDesinscription(cfg.appUrl, c.desinscription_token);
      const sujet = personnaliser(params.anniversaire_sujet || SUJET_ANNIV, c);
      const corps = personnaliser(params.anniversaire_message || MESSAGE_ANNIV, c);
      const res = await envoyerUn(cfg.cle, {
        from: expediteur(etab, params, cfg.from),
        to: c.email!,
        reply_to: params.email_reponse || etab.email || undefined,
        subject: sujet,
        html: gabarit({ etab, params, titre: sujet, corps, bon, lienDesinscr: lien }),
        text: texteBrut(corps, bon, lien),
        headers: enTetesDesinscription(lien),
      });
      if (res.erreur) {
        // Le bon n'a pas été reçu : on le retire pour que le rattrapage en
        // émette un propre, et la place se libère (statut 'echec').
        await sb.from('spa_bons').delete().eq('id', bon.id);
        await sb.from('spa_envois').update({ statut: 'echec', erreur: res.erreur }).eq('id', envoi.id);
        echecs++;
      } else {
        await sb.from('spa_bons').update({ envoye_at: new Date().toISOString() }).eq('id', bon.id);
        await sb.from('spa_envois').update({ statut: 'envoye', provider_id: res.id || null, bon_id: bon.id }).eq('id', envoi.id);
        envoyes++;
      }
    } catch (e) {
      await sb.from('spa_envois').update({ statut: 'echec', erreur: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).eq('id', envoi.id);
      echecs++;
    }
  }
  return { etabId, fetes: fetes.length, envoyes, echecs, dejaFaits };
}

// ── Handler ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const action = String(body.action || '');
  const etabId = String(body.etablissementId || '');
  const sb = admin();
  const cfg = config();

  // ── Désinscription : publique, par jeton ──
  if (action === 'desinscription') {
    const token = String(body.token || '');
    if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: 'Lien invalide.' }, 400);
    const { data } = await sb.from('spa_clients')
      .update({ consentement_marketing: false })
      .eq('desinscription_token', token)
      .select('etablissement_id')
      .maybeSingle();
    if (!data) return json({ error: 'Lien invalide ou déjà utilisé.' }, 404);
    const { data: etab } = await sb.from('etablissements').select('nom').eq('id', data.etablissement_id).maybeSingle();
    return json({ ok: true, etablissement: etab?.nom || null });
  }

  // ── Cron : tous les établissements dont l'envoi est actif ──
  if (action === 'anniversaires' && !etabId) {
    const secret = Deno.env.get('CRON_SECRET');
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (!cfg.configure) return json({ ok: false, error: 'Envoi non configuré (RESEND_API_KEY / SPA_MAIL_FROM).' });
    const { data: actifs } = await sb.from('spa_parametres').select('etablissement_id').eq('anniversaire_actif', true);
    const resultats = [];
    for (const p of actifs || []) resultats.push(await anniversairesEtab(sb, cfg, p.etablissement_id));
    console.log('[spa-mailer] anniversaires', JSON.stringify(resultats));
    return json({ ok: true, resultats });
  }

  // ── Actions de l'équipe : session obligatoire ──
  const qui = await appelant(req, sb);
  if (!qui) return json({ error: 'Session invalide.' }, 401);

  if (action === 'etat') {
    if (!autorise(qui, etabId, ROLES_EQUIPE)) return json({ error: 'Accès refusé.' }, 403);
    return json({ configure: cfg.configure });
  }

  if (!cfg.configure) {
    return json({ error: "L'envoi d'e-mails n'est pas encore branché (fournisseur à configurer)." }, 503);
  }

  if (action === 'anniversaires') {
    if (!autorise(qui, etabId, ROLES_DIRECTION)) return json({ error: 'Accès refusé.' }, 403);
    const r = await anniversairesEtab(sb, cfg, etabId);
    return json({ ok: true, ...r });
  }

  if (action === 'test') {
    if (!autorise(qui, etabId, ROLES_DIRECTION)) return json({ error: 'Accès refusé.' }, 403);
    if (!qui.email) return json({ error: "Ton compte n'a pas d'adresse e-mail." }, 400);
    const lu = await lireEtab(sb, etabId);
    if (!lu) return json({ error: 'Établissement introuvable.' }, 404);
    const { etab } = lu;
    const params = { ...lu.params, ...(body.params && typeof body.params === 'object' ? body.params as Partial<Params> : {}) };
    const exemple = { prenom: 'Camille', nom: 'Exemple' };
    const anniv = body.type === 'anniversaire';
    const sujet = '[Essai] ' + personnaliser(anniv ? (params.anniversaire_sujet || SUJET_ANNIV) : String(body.sujet || ''), exemple);
    const corps = personnaliser(anniv ? (params.anniversaire_message || MESSAGE_ANNIV) : String(body.message || ''), exemple);
    if (!corps.trim()) return json({ error: 'Le message est vide.' }, 400);
    const bon = anniv
      ? { code: codeBon(etab.nom).replace(/-\w+$/, '-ESSAI'), valeur: params.bon_valeur, valable_jusqu: addDaysIso(zurichToday(), params.bon_validite_jours) }
      : null;
    const lienFactice = `${cfg.appUrl}/api/spa-desinscription`;
    const res = await envoyerUn(cfg.cle, {
      from: expediteur(etab, params, cfg.from),
      to: qui.email,
      reply_to: params.email_reponse || etab.email || undefined,
      subject: sujet,
      html: gabarit({ etab, params, titre: sujet, corps, bon, lienDesinscr: lienFactice }),
      text: texteBrut(corps, bon, lienFactice),
    });
    await sb.from('spa_envois').insert({
      etablissement_id: etabId, type: 'test', email: qui.email,
      statut: res.erreur ? 'echec' : 'envoye', erreur: res.erreur || null, provider_id: res.id || null,
    });
    if (res.erreur) return json({ error: `Envoi refusé par le fournisseur : ${res.erreur}` }, 502);
    return json({ ok: true, email: qui.email });
  }

  if (action === 'campagne') {
    if (!autorise(qui, etabId, ROLES_DIRECTION)) return json({ error: 'Accès refusé.' }, 403);
    const sujetBrut = String(body.sujet || '').trim();
    const messageBrut = String(body.message || '').trim();
    if (!sujetBrut || !messageBrut) return json({ error: 'Sujet et message sont obligatoires.' }, 400);
    const lu = await lireEtab(sb, etabId);
    if (!lu) return json({ error: 'Établissement introuvable.' }, 404);
    const { etab, params } = lu;

    const { data: clients, error } = await sb.from('spa_clients')
      .select('id, prenom, nom, email, date_naissance, consentement_marketing, desinscription_token, archive')
      .eq('etablissement_id', etabId)
      .eq('consentement_marketing', true)
      .eq('archive', false)
      .not('email', 'is', null);
    if (error) return json({ error: 'Lecture des clients impossible.' }, 500);
    const dest = (clients || []) as Client[];
    if (!dest.length) return json({ error: "Aucun client n'a accepté de recevoir les nouvelles." }, 400);

    const { data: campagne, error: errC } = await sb.from('spa_campagnes').insert({
      etablissement_id: etabId, sujet: sujetBrut, message: messageBrut,
      nb_destinataires: dest.length, envoye_par: qui.uid,
    }).select('id').single();
    if (errC) return json({ error: 'Enregistrement de la campagne impossible.' }, 500);

    let envoyes = 0; let echecs = 0;
    for (let i = 0; i < dest.length; i += LOT_MAX) {
      const lot = dest.slice(i, i + LOT_MAX);
      const mails = lot.map((c) => {
        const lien = lienDesinscription(cfg.appUrl, c.desinscription_token);
        const sujet = personnaliser(sujetBrut, c);
        const corps = personnaliser(messageBrut, c);
        return {
          from: expediteur(etab, params, cfg.from),
          to: c.email!,
          reply_to: params.email_reponse || etab.email || undefined,
          subject: sujet,
          html: gabarit({ etab, params, titre: sujet, corps, lienDesinscr: lien }),
          text: texteBrut(corps, null, lien),
          headers: enTetesDesinscription(lien),
        } as Mail;
      });
      const res = await envoyerLot(cfg.cle, mails);
      const lignes = lot.map((c, k) => ({
        etablissement_id: etabId, client_id: c.id, type: 'news', campagne_id: campagne.id, email: c.email,
        statut: res[k].erreur ? 'echec' : 'envoye', erreur: res[k].erreur || null, provider_id: res[k].id || null,
      }));
      await sb.from('spa_envois').insert(lignes);
      envoyes += lignes.filter((l) => l.statut === 'envoye').length;
      echecs += lignes.filter((l) => l.statut === 'echec').length;
    }
    await sb.from('spa_campagnes').update({ nb_envoyes: envoyes, nb_echecs: echecs }).eq('id', campagne.id);
    return json({ ok: true, destinataires: dest.length, envoyes, echecs });
  }

  if (action === 'bon') {
    if (!autorise(qui, etabId, ['consultant', 'patron', 'hote'])) return json({ error: 'Accès refusé.' }, 403);
    const clientId = String(body.clientId || '');
    const valeur = String(body.valeur || '').trim();
    const validiteJours = Math.max(1, Math.min(730, Math.round(Number(body.validiteJours) || 60)));
    if (!valeur) return json({ error: 'Indique ce que le bon offre.' }, 400);
    const lu = await lireEtab(sb, etabId);
    if (!lu) return json({ error: 'Établissement introuvable.' }, 404);
    const { etab, params } = lu;
    const { data: c } = await sb.from('spa_clients')
      .select('id, prenom, nom, email, date_naissance, consentement_marketing, desinscription_token, archive')
      .eq('id', clientId).eq('etablissement_id', etabId).maybeSingle();
    if (!c) return json({ error: 'Client introuvable.' }, 404);
    if (!c.email) return json({ error: "Ce client n'a pas d'adresse e-mail." }, 400);

    const bon = await creerBon(sb, etab, c.id, {
      motif: 'cadeau', valeur, message: String(body.message || '').trim() || null, validiteJours, createdBy: qui.uid,
    });
    const sujet = personnaliser(String(body.sujet || '').trim() || 'Un bon cadeau pour vous, {prenom}', c);
    const corps = personnaliser(String(body.corps || '').trim()
      || 'Bonjour {prenom},\n\nNous avons le plaisir de vous offrir le bon ci-dessous. Présentez-le, ou donnez-nous son code, lors de votre prochaine réservation.\n\nÀ très bientôt.', c);
    const lien = c.consentement_marketing ? lienDesinscription(cfg.appUrl, c.desinscription_token) : null;
    const res = await envoyerUn(cfg.cle, {
      from: expediteur(etab, params, cfg.from),
      to: c.email,
      reply_to: params.email_reponse || etab.email || undefined,
      subject: sujet,
      html: gabarit({ etab, params, titre: sujet, corps, bon, lienDesinscr: lien }),
      text: texteBrut(corps, bon, lien),
    });
    await sb.from('spa_envois').insert({
      etablissement_id: etabId, client_id: c.id, type: 'bon', bon_id: bon.id, email: c.email,
      statut: res.erreur ? 'echec' : 'envoye', erreur: res.erreur || null, provider_id: res.id || null,
    });
    if (res.erreur) {
      await sb.from('spa_bons').delete().eq('id', bon.id);
      return json({ error: `Envoi refusé par le fournisseur : ${res.erreur}` }, 502);
    }
    await sb.from('spa_bons').update({ envoye_at: new Date().toISOString() }).eq('id', bon.id);
    return json({ ok: true, code: bon.code });
  }

  return json({ error: 'Action inconnue.' }, 400);
});
