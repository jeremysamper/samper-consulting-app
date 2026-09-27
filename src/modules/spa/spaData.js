import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { addDays, isoDate, parseLocalDate } from '../../utils/dateHelpers.js';
import { zurichToday } from '../../utils/zurichTime.js';

// ─────────────────────────────────────────────────────────────────────────────
// Données du module Spa (migration 20260927_spa_module).
//
// Un seul hook générique, useSpaTable, pour les cinq tables que le front lit :
// même contrat que useGroupes -
//   'loading' aucune lecture n'a encore abouti
//   'ready'   données fiables (la liste peut être vide pour de vrai)
//   'error'   la première lecture a échoué
//   'absent'  la table n'existe pas (migration non appliquée)
// Une lecture en échec ne vide jamais la liste affichée : on garde la dernière
// version et on réessaie (tablette de la réception qui sort de veille).
//
// Les e-mails (bons cadeaux, anniversaires, actualités) ne passent jamais par
// ici : ils partent de l'Edge Function spa-mailer, voir appelerMailer.
// ─────────────────────────────────────────────────────────────────────────────

const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;

const MESSAGES_ERREUR = {
  '23503': 'Élément lié introuvable (client ou soin supprimé entre-temps ?).',
  '23505': 'Cet enregistrement existe déjà.',
  '23514': 'Une des valeurs saisies est refusée (e-mail, durée ou date).',
  '42501': "Tu n'as pas les droits pour cette action.",
};

export function messageErreur(error) {
  if (!error) return null;
  console.error('[spa] erreur Supabase', error);
  if (RELATION_ABSENTE.has(error.code)) return "Le module Spa n'est pas encore activé sur la base de données.";
  return MESSAGES_ERREUR[String(error.code || '')] || 'Erreur technique. Réessaie ou contacte le support.';
}

const texte = (v) => { const t = String(v ?? '').trim(); return t || null; };

// ── Mappers ────────────────────────────────────────────────────────────────
export function mapClient(r) {
  return {
    id: r.id,
    prenom: r.prenom || '',
    nom: r.nom || '',
    email: r.email || '',
    telephone: r.telephone || '',
    dateNaissance: r.date_naissance || '',
    adresse: r.adresse || '',
    notesSante: r.notes_sante || '',
    preferences: r.preferences || '',
    notes: r.notes || '',
    consentementMarketing: r.consentement_marketing === true,
    consentementAt: r.consentement_at || null,
    desinscritAt: r.desinscrit_at || null,
    archive: r.archive === true,
    createdAt: r.created_at || null,
  };
}

export function clientVersDB(c) {
  return {
    prenom: texte(c.prenom),
    nom: texte(c.nom),
    email: texte(c.email),
    telephone: texte(c.telephone),
    date_naissance: c.dateNaissance || null,
    adresse: texte(c.adresse),
    notes_sante: texte(c.notesSante),
    preferences: texte(c.preferences),
    notes: texte(c.notes),
    consentement_marketing: c.consentementMarketing === true,
  };
}

export function mapSoin(r) {
  return {
    id: r.id,
    nom: r.nom || '',
    categorie: r.categorie || '',
    dureeMin: Number(r.duree_min) || 60,
    prix: r.prix === null || r.prix === undefined ? null : Number(r.prix),
    description: r.description || '',
    actif: r.actif !== false,
    // Proposé à la réservation en ligne (migration 20260928, vrai par défaut).
    enLigne: r.en_ligne !== false,
  };
}

export function soinVersDB(s) {
  const prix = s.prix === '' || s.prix === null || s.prix === undefined ? null : Number(s.prix);
  return {
    nom: String(s.nom || '').trim(),
    categorie: texte(s.categorie),
    duree_min: Math.round(Number(s.dureeMin) || 60),
    prix: Number.isFinite(prix) ? prix : null,
    description: texte(s.description),
    actif: s.actif !== false,
    en_ligne: s.enLigne !== false,
  };
}

export function mapReservation(r) {
  return {
    id: r.id,
    clientId: r.client_id,
    soinId: r.soin_id || null,
    soinLibelle: r.soin_libelle || '',
    dateRdv: r.date_rdv,
    heureDebut: r.heure_debut ? String(r.heure_debut).slice(0, 5) : '',
    dureeMin: Number(r.duree_min) || 60,
    praticien: r.praticien || '',
    cabine: r.cabine || '',
    statut: r.statut || 'prevue',
    notes: r.notes || '',
    // 'en_ligne' : demande venue du site du client (statut initial 'demande').
    origine: r.origine || 'equipe',
  };
}

export function reservationVersDB(r) {
  return {
    client_id: r.clientId,
    soin_id: r.soinId || null,
    soin_libelle: texte(r.soinLibelle),
    date_rdv: r.dateRdv,
    heure_debut: r.heureDebut,
    duree_min: Math.round(Number(r.dureeMin) || 60),
    praticien: texte(r.praticien),
    cabine: texte(r.cabine),
    notes: texte(r.notes),
  };
}

export function mapSeance(r) {
  return {
    id: r.id,
    clientId: r.client_id,
    reservationId: r.reservation_id || null,
    dateSeance: r.date_seance,
    soin: r.soin || '',
    praticien: r.praticien || '',
    observations: r.observations || '',
    produits: r.produits || '',
    ressenti: r.ressenti || '',
    recommandations: r.recommandations || '',
    prochaineSeance: r.prochaine_seance || '',
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  };
}

export function seanceVersDB(s) {
  return {
    client_id: s.clientId,
    reservation_id: s.reservationId || null,
    date_seance: s.dateSeance,
    soin: texte(s.soin),
    praticien: texte(s.praticien),
    observations: texte(s.observations),
    produits: texte(s.produits),
    ressenti: texte(s.ressenti),
    recommandations: texte(s.recommandations),
    prochaine_seance: s.prochaineSeance || null,
  };
}

export function mapBon(r) {
  return {
    id: r.id,
    clientId: r.client_id,
    code: r.code,
    motif: r.motif,
    valeur: r.valeur || '',
    message: r.message || '',
    valableJusqu: r.valable_jusqu || '',
    envoyeAt: r.envoye_at || null,
    utiliseAt: r.utilise_at || null,
    createdAt: r.created_at || null,
  };
}

export function mapParametres(r, etabId) {
  return {
    etablissementId: etabId,
    existe: Boolean(r),
    anniversaireActif: r?.anniversaire_actif === true,
    bonValeur: r?.bon_valeur || '20 % sur le soin de votre choix',
    bonValiditeJours: Number(r?.bon_validite_jours) || 60,
    anniversaireSujet: r?.anniversaire_sujet || '',
    anniversaireMessage: r?.anniversaire_message || '',
    nomExpediteur: r?.nom_expediteur || '',
    emailReponse: r?.email_reponse || '',
    signature: r?.signature || '',
    // Réservation en ligne (migration 20260928).
    enLigneActif: r?.en_ligne_actif === true,
    slug: r?.slug || '',
    horaires: r?.horaires && typeof r.horaires === 'object' ? r.horaires : {},
    praticiensEnLigne: Array.isArray(r?.praticiens_en_ligne) ? r.praticiens_en_ligne : [],
    delaiMinHeures: Number.isFinite(Number(r?.delai_min_heures)) ? Number(r.delai_min_heures) : 2,
    horizonJours: Number(r?.horizon_jours) || 60,
    pasMinutes: Number(r?.pas_minutes) || 30,
    messageEnLigne: r?.message_en_ligne || '',
  };
}

// Deux blocs de réglages indépendants : l'onglet E-mails et l'onglet En ligne
// n'envoient chacun que leurs colonnes, pour ne jamais s'écraser l'un l'autre.
export function parametresEnLigneVersDB(p) {
  const horaires = {};
  for (const [jour, plages] of Object.entries(p.horaires || {})) {
    const propres = (plages || []).filter((x) => x?.de && x?.a && x.de < x.a).map((x) => ({ de: x.de, a: x.a }));
    if (propres.length) horaires[jour] = propres;
  }
  return {
    en_ligne_actif: p.enLigneActif === true,
    slug: texte(p.slug)?.toLowerCase() || null,
    horaires,
    praticiens_en_ligne: [...new Set((p.praticiensEnLigne || []).map((x) => String(x).trim()).filter(Boolean))],
    delai_min_heures: Math.max(0, Math.min(168, Math.round(Number(p.delaiMinHeures) || 0))),
    horizon_jours: Math.max(1, Math.min(365, Math.round(Number(p.horizonJours) || 60))),
    pas_minutes: [10, 15, 20, 30, 45, 60].includes(Number(p.pasMinutes)) ? Number(p.pasMinutes) : 30,
    message_en_ligne: texte(p.messageEnLigne),
  };
}

export function parametresVersDB(p) {
  return {
    anniversaire_actif: p.anniversaireActif === true,
    bon_valeur: String(p.bonValeur || '').trim() || '20 % sur le soin de votre choix',
    bon_validite_jours: Math.max(1, Math.min(730, Math.round(Number(p.bonValiditeJours) || 60))),
    anniversaire_sujet: texte(p.anniversaireSujet),
    anniversaire_message: texte(p.anniversaireMessage),
    nom_expediteur: texte(p.nomExpediteur),
    email_reponse: texte(p.emailReponse),
    signature: texte(p.signature),
  };
}

// ── Hook générique ─────────────────────────────────────────────────────────
// `filtres` : [[colonne, opérateur, valeur]] appliqués après eq(etablissement).
// `cle` : chaîne qui résume les filtres (dépendance de l'effet).
export function useSpaTable(table, etabId, { map, filtres = [], cle = '', order = [], limit = 5000, actif = true } = {}) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(etabId && actif ? 'loading' : 'ready');
  const reloadRef = useRef(null);
  const mapRef = useRef(map);
  mapRef.current = map;
  const filtresRef = useRef(filtres);
  filtresRef.current = filtres;
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    if (!etabId || !actif) { setRows([]); setStatus('ready'); return undefined; }
    let mounted = true;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    let loadedOnce = false;

    const reload = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      let q = supabase.from(table).select('*').eq('etablissement_id', etabId);
      for (const [col, op, val] of filtresRef.current) q = q[op](col, val);
      for (const [col, asc] of orderRef.current) q = q.order(col, { ascending: asc !== false });
      const { data, error } = await q.limit(limit);
      if (!mounted) return;
      if (error) {
        if (RELATION_ABSENTE.has(error.code)) { setRows([]); setStatus('absent'); return; }
        console.error(`[spa] lecture ${table}`, error);
        if (!loadedOnce) setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        return;
      }
      loadedOnce = true;
      retryDelay = RETRY_MIN_MS;
      setRows((data || []).map((r) => mapRef.current(r)));
      setStatus('ready');
    };

    reloadRef.current = reload;
    setStatus('loading');
    reload();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload([table], () => { if (mounted) reload(); })
      : null;
    return () => {
      mounted = false;
      reloadRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsub) unsub();
    };
  }, [table, etabId, cle, limit, actif]);

  const reload = useCallback(() => reloadRef.current?.(), []);

  const actions = useMemo(() => {
    const remplacer = (row) => {
      const m = mapRef.current(row);
      setRows((liste) => [...liste.filter((x) => x.id !== m.id), m]);
      return m;
    };
    return {
      async inserer(valeurs) {
        const { data, error } = await supabase.from(table)
          .insert({ ...valeurs, etablissement_id: etabId }).select().single();
        if (error) return { data: null, error: messageErreur(error) };
        return { data: remplacer(data), error: null };
      },
      async modifier(id, valeurs) {
        const { data, error } = await supabase.from(table).update(valeurs).eq('id', id).select().single();
        if (error) return { data: null, error: messageErreur(error) };
        return { data: remplacer(data), error: null };
      },
      // Une suppression refusée par la RLS ne lève pas d'erreur : elle touche
      // zéro ligne. On relit ce qui a été supprimé avant de l'annoncer.
      async supprimer(id) {
        const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
        if (error) return { error: messageErreur(error) };
        if (!data || !data.length) return { error: "Suppression impossible : ton rôle ne le permet pas, ou l'élément n'existe plus." };
        setRows((liste) => liste.filter((x) => x.id !== id));
        return { error: null };
      },
    };
  }, [table, etabId]);

  return { rows, status, reload, ...actions };
}

// Réservations depuis `depuis` (90 jours en arrière par défaut) ; l'agenda
// abaisse le plancher quand on remonte plus loin.
export const plancherReservations = () => isoDate(addDays(parseLocalDate(zurichToday()), -90));

// ── Paramètres e-mail (une ligne par établissement, upsert) ───────────────
export function useSpaParametres(etabId) {
  const [parametres, setParametres] = useState(() => mapParametres(null, etabId));
  const [status, setStatus] = useState('loading');

  const charger = useCallback(async () => {
    if (!etabId) return;
    const { data, error } = await supabase.from('spa_parametres').select('*').eq('etablissement_id', etabId).maybeSingle();
    if (error) { setStatus(RELATION_ABSENTE.has(error.code) ? 'absent' : 'error'); return; }
    setParametres(mapParametres(data, etabId));
    setStatus('ready');
  }, [etabId]);

  useEffect(() => { setStatus('loading'); charger(); }, [charger]);

  // partie : 'emails' (onglet E-mails) ou 'en_ligne' (onglet En ligne).
  const enregistrer = useCallback(async (p, partie = 'emails') => {
    const valeurs = partie === 'en_ligne' ? parametresEnLigneVersDB(p) : parametresVersDB(p);
    const { data, error } = await supabase.from('spa_parametres')
      .upsert({ ...valeurs, etablissement_id: etabId }, { onConflict: 'etablissement_id' })
      .select().single();
    if (error) {
      if (error.code === '23505') return { error: 'Cette adresse de réservation est déjà prise par un autre spa.' };
      if (error.code === '23514') return { error: 'Adresse de réservation invalide : lettres minuscules, chiffres et tirets (3 à 40 caractères).' };
      return { error: messageErreur(error) };
    }
    setParametres(mapParametres(data, etabId));
    return { error: null };
  }, [etabId]);

  return { parametres, status, enregistrer, reload: charger };
}

// ── Appel de l'Edge Function spa-mailer ────────────────────────────────────
export async function appelerMailer(action, charge = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('spa-mailer', { body: { action, ...charge } });
    if (error) {
      // FunctionsHttpError : le message utile est dans le corps de la réponse.
      let message = null;
      try { message = (await error.context?.json?.())?.error || null; } catch { /* corps illisible */ }
      if (!message && /Failed to send|not found|404/i.test(String(error.message || ''))) {
        message = "Le service d'envoi d'e-mails n'est pas encore déployé.";
      }
      return { data: null, error: message || "Le service d'e-mails n'a pas répondu. Réessaie." };
    }
    if (data?.error) return { data: null, error: data.error };
    return { data, error: null };
  } catch (e) {
    console.error('[spa] appel spa-mailer', e);
    return { data: null, error: "Le service d'e-mails n'a pas répondu. Réessaie." };
  }
}
