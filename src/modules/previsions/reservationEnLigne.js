// ─────────────────────────────────────────────────────────────────────────────
// Réservation d'une table en ligne : données et liens.
//
// Le restaurant ouvre une page publique /table/<adresse> (lien, QR code ou
// widget sur son site). Les réservations arrivent dans le module, « À
// confirmer » ou déjà confirmées selon le mode choisi. Le calcul des heures
// libres et la réservation elle-même sont côté serveur (Edge Function
// spa-mailer, actions public_table_* ; fonction SQL resa_reserver_en_ligne).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabase.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { lienGmail, lienMailto } from '../spa/integration.js';

export { lienGmail, lienMailto };

const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);

export const ORIGINE_PUBLIQUE = 'https://samperconsulting-app.com';
export const COULEUR_DEFAUT = '#003042';
export const SLUG_OK = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function versSlug(nom) {
  return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

// Semaine type proposée au premier réglage : du mardi au samedi, midi et soir.
const HORAIRES_DEFAUT = Object.fromEntries([2, 3, 4, 5, 6].map((j) => [String(j), {
  midi: { de: '12:00', a: '13:30' },
  soir: { de: '19:00', a: '21:00' },
}]));

export const PARAMETRES_DEFAUT = {
  enLigneActif: false,
  slug: '',
  mode: 'demande',
  horaires: HORAIRES_DEFAUT,
  capaciteService: 40,
  capaciteCreneau: null,
  capaciteDemiHeure: null,
  rythme: {},
  capaciteJours: {},
  maxCouverts: 8,
  delaiMinHeures: 2,
  horizonJours: 60,
  pasMinutes: 15,
  joursFermes: [],
  servicesFermes: {},
  messageEnLigne: '',
};

function depuisBase(r) {
  if (!r) return null;
  return {
    enLigneActif: Boolean(r.en_ligne_actif),
    slug: r.slug || '',
    mode: r.mode === 'auto' ? 'auto' : 'demande',
    horaires: r.horaires && Object.keys(r.horaires).length ? r.horaires : HORAIRES_DEFAUT,
    capaciteService: r.capacite_service,
    capaciteCreneau: r.capacite_creneau,
    capaciteDemiHeure: r.capacite_demi_heure ?? null,
    rythme: r.rythme || {},
    capaciteJours: r.capacite_jours || {},
    maxCouverts: r.max_couverts,
    delaiMinHeures: r.delai_min_heures,
    horizonJours: r.horizon_jours,
    pasMinutes: r.pas_minutes,
    joursFermes: r.jours_fermes || [],
    servicesFermes: r.services_fermes && typeof r.services_fermes === 'object' ? r.services_fermes : {},
    messageEnLigne: r.message_en_ligne || '',
  };
}

// Rythme : { service: { "HH:MM": plafond } }. On ne garde que les nombres
// saisis (0 compris : demi-heure fermée en ligne) ; une case vidée reprend le
// plafond par défaut. Même forme pour les couverts par jour :
// { jour: { service: plafond } }.
function nettoyerRythme(rythme) {
  const sortie = {};
  Object.entries(rythme || {}).forEach(([service, cases]) => {
    const gardees = Object.entries(cases || {})
      .filter(([, v]) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0)
      .map(([h, v]) => [h, Math.round(Number(v))]);
    if (gardees.length) sortie[service] = Object.fromEntries(gardees);
  });
  return sortie;
}

// Services fermés par date : { "2026-10-12": ["soir"] }. On garde les dates
// qui ont au moins un service, sans doublon. Les dates passées restent : le
// rapport les retire de la capacité théorique (l'écran de réglage et la page
// publique ne montrent que les dates à venir).
function nettoyerServicesFermes(services) {
  const sortie = {};
  Object.entries(services || {}).forEach(([date, liste]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(liste)) return;
    const gardes = [...new Set(liste.filter((x) => typeof x === 'string' && x))];
    if (gardes.length) sortie[date] = gardes;
  });
  return sortie;
}

function versBase(p) {
  return {
    en_ligne_actif: Boolean(p.enLigneActif),
    slug: p.slug || null,
    mode: p.mode,
    horaires: p.horaires,
    capacite_service: Number(p.capaciteService) || 1,
    capacite_creneau: p.capaciteCreneau ? Number(p.capaciteCreneau) : null,
    capacite_demi_heure: p.capaciteDemiHeure ? Number(p.capaciteDemiHeure) : null,
    rythme: nettoyerRythme(p.rythme),
    capacite_jours: nettoyerRythme(p.capaciteJours),
    max_couverts: Number(p.maxCouverts) || 1,
    delai_min_heures: Number(p.delaiMinHeures) || 0,
    horizon_jours: Number(p.horizonJours) || 60,
    pas_minutes: Number(p.pasMinutes) || 15,
    jours_fermes: [...new Set(p.joursFermes || [])].sort(),
    services_fermes: nettoyerServicesFermes(p.servicesFermes),
    message_en_ligne: String(p.messageEnLigne || '').trim() || null,
    updated_at: new Date().toISOString(),
  };
}

// Réglages de l'établissement. status : loading | ready | absent | error
// (absent = migration pas encore appliquée).
export function useParametresEnLigne(etabId) {
  const [parametres, setParametres] = useState(null);
  const [existe, setExiste] = useState(false);
  const [status, setStatus] = useState('loading');

  const charger = useCallback(async () => {
    if (!etabId) return;
    setStatus('loading');
    const { data, error } = await supabase
      .from('reservation_en_ligne_parametres')
      .select('*')
      .eq('etablissement_id', etabId)
      .maybeSingle();
    if (error) {
      console.error('[resa en ligne] lecture des réglages', error);
      setStatus(RELATION_ABSENTE.has(error.code) ? 'absent' : 'error');
      return;
    }
    setExiste(Boolean(data));
    setParametres(depuisBase(data) || { ...PARAMETRES_DEFAUT });
    setStatus('ready');
  }, [etabId]);

  useEffect(() => { charger(); }, [charger]);

  const enregistrer = useCallback(async (p) => {
    const { data, error } = await supabase
      .from('reservation_en_ligne_parametres')
      .upsert({ ...versBase(p), etablissement_id: etabId }, { onConflict: 'etablissement_id' })
      .select()
      .single();
    if (error) {
      console.error('[resa en ligne] enregistrement des réglages', error);
      if (error.code === '23505') return { error: 'Cette adresse de réservation est déjà prise par un autre restaurant.' };
      if (error.code === '23514') return { error: 'Une des valeurs est refusée : vérifiez l\'adresse (lettres minuscules, chiffres et tirets) et les nombres.' };
      if (error.code === '42501') return { error: 'Seuls le patron et le consultant peuvent modifier ces réglages.' };
      return { error: 'Erreur technique. Réessayez ou contactez le support.' };
    }
    setExiste(true);
    setParametres(depuisBase(data));
    return { error: null };
  }, [etabId]);

  return { parametres, existe, status, enregistrer, reload: charger };
}

// Demandes venues du site, à confirmer, d'aujourd'hui et à venir.
export async function listerDemandes(etabId) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*, reservation_tags(*)')
    .eq('etablissement_id', etabId)
    .eq('statut', 'demande')
    .gte('date_service', zurichToday())
    .order('date_service')
    .order('heure_arrivee');
  if (error) {
    // Avant la migration, 'demande' n'existe pas : rien à afficher.
    console.error('[resa en ligne] lecture des demandes', error);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

async function appelerMailer(action, charge) {
  try {
    const { data, error } = await supabase.functions.invoke('spa-mailer', { body: { action, ...charge } });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// Ce que le client a reçu, d'après la réponse de spa-mailer : envoye / raison
// pour l'e-mail, sms { envoye, raison } pour le SMS (absent d'un serveur plus
// ancien). Un SMS non branché ou un numéro fixe ne valent pas un échec : seul
// un SMS qui aurait dû partir est signalé.
function bilanEnvoi(data, resa) {
  const mail = Boolean(data?.envoye);
  const sms = Boolean(data?.sms?.envoye);
  const smsEnPanne = ['echec', 'passerelle_en_erreur'].includes(data?.sms?.raison);
  return {
    partis: [mail && 'e-mail', sms && 'SMS'].filter(Boolean).join(' et '),
    mailNonBranche: Boolean(resa.email) && !mail && data?.raison === 'non_configure',
    mailEnEchec: Boolean(resa.email) && !mail && data?.raison !== 'non_configure',
    smsEnPanne,
  };
}

// Confirme ou refuse une demande, puis prévient le client par e-mail et par
// SMS. Le changement de statut est la seule chose qui doit réussir ; les
// envois sont tentés ensuite, et le toast dit ce qui est parti.
// evenement : 'confirmation' | 'refus'. Renvoie { error, message, ton }.
export async function traiterDemande(resa, evenement) {
  const statut = evenement === 'confirmation' ? 'confirme' : 'annule';
  const { error } = await supabase
    .from('reservations')
    .update({ statut, updated_at: new Date().toISOString() })
    .eq('id', resa.id)
    .eq('statut', 'demande');
  if (error) {
    console.error('[resa en ligne] traitement de la demande', error);
    return {
      error: error.code === '42501' ? "Vous n'avez pas les droits pour cette action." : 'Erreur technique. Réessayez ou contactez le support.',
    };
  }
  const base = evenement === 'confirmation' ? `Réservation de ${resa.nom} confirmée.` : `Demande de ${resa.nom} refusée.`;
  if (!resa.email && !resa.telephone) return { error: null, message: `${base} Ni e-mail ni téléphone laissé : le client ne peut pas être prévenu.`, ton: 'warning' };
  const { data } = await appelerMailer('resa_statut', {
    etablissementId: resa.etablissement_id, reservationId: resa.id, evenement,
  });
  const b = bilanEnvoi(data, resa);
  if (b.partis) {
    const panne = b.smsEnPanne ? " Le SMS n'est pas parti." : b.mailEnEchec ? " L'e-mail n'est pas parti." : '';
    return { error: null, message: `${base} Le client a reçu un ${b.partis}.${panne}`, ton: panne ? 'warning' : 'success' };
  }
  if (!resa.email && data?.sms?.raison === 'sans_mobile') {
    return { error: null, message: `${base} Pas de numéro de portable laissé : pensez à appeler le client.`, ton: 'warning' };
  }
  if (b.mailNonBranche || (!resa.email && !b.smsEnPanne)) {
    return { error: null, message: `${base} L'envoi d'e-mails et de SMS n'est pas encore branché : pensez à prévenir le client.`, ton: 'warning' };
  }
  return { error: null, message: `${base} Le message au client n'a pas pu partir : pensez à le prévenir.`, ton: 'warning' };
}

// Confirmation d'une réservation saisie par l'équipe (téléphone, sur place) :
// e-mail avec récapitulatif, et SMS si le restaurant a relié son téléphone.
// evenement : 'creation' | 'modification'. Le serveur prend l'établissement
// de la réservation elle-même. Ne bloque jamais l'enregistrement : renvoie un
// texte à ajouter au toast, ou '' quand rien n'avait à partir.
export async function envoyerConfirmation(resa, evenement = 'creation') {
  if (!resa?.id || (!resa.email && !resa.telephone)) return { suffixe: '', ton: 'success' };
  const { data } = await appelerMailer('resa_confirmation', { reservationId: resa.id, evenement });
  const b = bilanEnvoi(data, resa);
  const notes = [];
  if (b.mailNonBranche) notes.push("L'envoi d'e-mails n'est pas encore branché pour cet établissement.");
  if (b.mailEnEchec) notes.push("L'e-mail de confirmation n'a pas pu partir.");
  if (b.smsEnPanne) notes.push("Le SMS de confirmation n'a pas pu partir.");
  const partis = b.partis ? ` Confirmation envoyée par ${b.partis}.` : '';
  return { suffixe: `${partis}${notes.map((n) => ` ${n}`).join('')}`, ton: notes.length ? 'warning' : 'success' };
}

// ── Liens et codes à mettre sur le site du restaurant ──────────────────────
// L'origine est toujours la production : le site du restaurant doit pointer
// vers samperconsulting-app.com, même si le réglage est fait depuis une préversion.
const COULEUR_OK = /^#[0-9a-f]{6}$/i;
const attrCouleur = (couleur) => (
  couleur && COULEUR_OK.test(couleur) && couleur.toLowerCase() !== COULEUR_DEFAUT ? ` data-couleur="${couleur.toLowerCase()}"` : ''
);

export const lienReservation = (slug) => `${ORIGINE_PUBLIQUE}/table/${slug}`;

export const codeBouton = (slug, couleur) => (
  `<script src="${ORIGINE_PUBLIQUE}/widget-table.js" data-table="${slug}"${attrCouleur(couleur)} async></script>`
);

export const codeIntegre = (slug, couleur) => (
  `<div id="reservation-table"></div>\n<script src="${ORIGINE_PUBLIQUE}/widget-table.js" data-table="${slug}" data-mode="integre" data-cible="#reservation-table"${attrCouleur(couleur)} async></script>`
);

export function messageWebmaster({ nomEtab, slug, couleur }) {
  const nom = nomEtab || 'le restaurant';
  return {
    sujet: `Réservation en ligne ${nom} : à ajouter sur le site`,
    corps: [
      'Bonjour,',
      '',
      `Nous ouvrons la réservation de tables en ligne (${nom}). Pourriez-vous l'ajouter sur notre site ?`,
      '',
      'Le plus simple : mettre ce lien sur le bouton « Réserver » du site, et dans le menu :',
      lienReservation(slug),
      '',
      'Pour afficher un bouton qui ouvre la réservation par-dessus le site, sans le quitter, il suffit de coller ce code là où le bouton doit apparaître :',
      codeBouton(slug, couleur),
      '',
      'Ou, pour afficher la réservation directement dans une page :',
      codeIntegre(slug, couleur),
      '',
      'Merci beaucoup,',
    ].join('\n'),
  };
}
