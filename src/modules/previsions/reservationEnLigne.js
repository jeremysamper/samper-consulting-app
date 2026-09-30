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
  maxCouverts: 8,
  delaiMinHeures: 2,
  horizonJours: 60,
  pasMinutes: 15,
  joursFermes: [],
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
    maxCouverts: r.max_couverts,
    delaiMinHeures: r.delai_min_heures,
    horizonJours: r.horizon_jours,
    pasMinutes: r.pas_minutes,
    joursFermes: r.jours_fermes || [],
    messageEnLigne: r.message_en_ligne || '',
  };
}

// Rythme : { service: { "HH:MM": plafond } }. On ne garde que les nombres
// saisis (0 compris : demi-heure fermée en ligne) ; une case vidée reprend le
// plafond par défaut.
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
    max_couverts: Number(p.maxCouverts) || 1,
    delai_min_heures: Number(p.delaiMinHeures) || 0,
    horizon_jours: Number(p.horizonJours) || 60,
    pas_minutes: Number(p.pasMinutes) || 15,
    jours_fermes: [...new Set(p.joursFermes || [])].sort(),
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
      return { error: 'Erreur technique. Réessaie ou contacte le support.' };
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

// Confirme ou refuse une demande, puis prévient le client par e-mail. Le
// changement de statut est la seule chose qui doit réussir ; l'e-mail est
// tenté ensuite, et le toast dit s'il est parti.
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
      error: error.code === '42501' ? "Tu n'as pas les droits pour cette action." : 'Erreur technique. Réessaie ou contacte le support.',
    };
  }
  const base = evenement === 'confirmation' ? `Réservation de ${resa.nom} confirmée.` : `Demande de ${resa.nom} refusée.`;
  if (!resa.email) return { error: null, message: `${base} Pas d'e-mail laissé : pensez à appeler le client.`, ton: 'warning' };
  const { data } = await appelerMailer('resa_statut', {
    etablissementId: resa.etablissement_id, reservationId: resa.id, evenement,
  });
  if (data?.envoye) return { error: null, message: `${base} Le client a reçu un e-mail.`, ton: 'success' };
  if (data?.raison === 'non_configure') {
    return { error: null, message: `${base} L'envoi d'e-mails n'est pas encore branché : pensez à prévenir le client.`, ton: 'warning' };
  }
  return { error: null, message: `${base} L'e-mail au client n'a pas pu partir : pensez à le prévenir.`, ton: 'warning' };
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
