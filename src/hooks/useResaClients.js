import { useMemo } from 'react';
import { supabase } from '../services/supabase.js';

// ═══════════════════════════════════════════════════════════════════════════
// Fichier clients des restaurants (table resa_clients, migration 20261001).
//
// Les fiches se remplissent seules : chaque réservation qui porte un e-mail ou
// un téléphone est rattachée à la fiche correspondante par un déclencheur en
// base (resa_rattacher_client). Ce hook lit les fiches, leurs chiffres (vue
// resa_clients_stats) et l'historique d'une fiche, et enregistre les
// corrections faites à la main.
// ═══════════════════════════════════════════════════════════════════════════

const TABLE = 'resa_clients';

const MESSAGES = {
  '23505': 'Une autre fiche porte déjà cet e-mail.',
  '23514': 'Vérifie le nom et l\'e-mail de la fiche.',
  '42501': "Tu n'as pas les droits pour modifier les fiches clients.",
};

function mapError(error) {
  if (!error) return null;
  console.error('[useResaClients] erreur Supabase', error);
  return MESSAGES[String(error.code || '')] || 'Erreur technique. Réessaie ou contacte le support.';
}

// Base (snake_case) → écran (camelCase).
export function mapClient(r) {
  if (!r) return null;
  return {
    id: r.id,
    etablissementId: r.etablissement_id,
    prenom: r.prenom || '',
    nom: r.nom || '',
    email: r.email || '',
    telephone: r.telephone || '',
    dateNaissance: r.date_naissance || '',
    allergies: r.allergies || '',
    preferences: r.preferences || '',
    notes: r.notes || '',
    consentementMarketing: !!r.consentement_marketing,
    consentementAt: r.consentement_at || null,
    consentementSource: r.consentement_source || null,
    desinscritAt: r.desinscrit_at || null,
    archive: !!r.archive,
    createdAt: r.created_at,
  };
}

const vide = (v) => {
  const t = String(v ?? '').trim();
  return t === '' ? null : t;
};

// Écran → base. Seuls les champs saisissables à la main.
function versBase(c) {
  return {
    prenom: vide(c.prenom),
    nom: vide(c.nom),
    email: vide(c.email)?.toLowerCase() ?? null,
    telephone: vide(c.telephone),
    date_naissance: vide(c.dateNaissance),
    allergies: vide(c.allergies),
    preferences: vide(c.preferences),
    notes: vide(c.notes),
  };
}

export const nomClient = (c) => [c?.prenom, c?.nom].filter(Boolean).join(' ').trim() || 'Client';

export function useResaClients(etablissementId) {
  return useMemo(() => {
    // Fiches + chiffres, fusionnés. Lève en cas d'échec : l'écran garde sa
    // dernière liste au lieu d'annoncer un fichier vide.
    async function list() {
      const [fiches, chiffres] = await Promise.all([
        supabase.from(TABLE).select('*').eq('etablissement_id', etablissementId).order('nom'),
        supabase.from('resa_clients_stats').select('*').eq('etablissement_id', etablissementId),
      ]);
      if (fiches.error) return { data: null, error: mapError(fiches.error) };
      const parId = new Map((chiffres.data || []).map((s) => [s.client_id, s]));
      const data = (fiches.data || []).map((r) => {
        const s = parId.get(r.id) || {};
        return {
          ...mapClient(r),
          nbReservations: Number(s.nb_reservations) || 0,
          nbVenues: Number(s.nb_venues) || 0,
          nbNoShow: Number(s.nb_no_show) || 0,
          derniereVenue: s.derniere_venue || null,
          prochaine: s.prochaine || null,
          couvertsTotal: Number(s.couverts_total) || 0,
        };
      });
      return { data, error: null };
    }

    async function get(id) {
      const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
      if (error) return { data: null, error: mapError(error) };
      return { data: mapClient(data), error: null };
    }

    // Historique : toutes les réservations de la fiche, les plus récentes
    // d'abord, avec les tables occupées (placement du plan de salle).
    async function historique(id) {
      const { data, error } = await supabase
        .from('reservations')
        .select('*, reservation_tags(*), reservation_tables(table_id, salle_tables(nom))')
        .eq('client_id', id)
        .order('date_service', { ascending: false })
        .order('heure_arrivee', { ascending: false });
      if (error) return { data: null, error: mapError(error) };
      return {
        data: (data || []).map((r) => ({
          ...r,
          tables: (r.reservation_tables || []).map((l) => l.salle_tables?.nom).filter(Boolean)
            .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
        })),
        error: null,
      };
    }

    async function create(client) {
      const { data, error } = await supabase
        .from(TABLE)
        .insert({ ...versBase(client), etablissement_id: etablissementId })
        .select()
        .single();
      if (error) return { data: null, error: mapError(error) };
      return { data: mapClient(data), error: null };
    }

    async function update(id, client) {
      const { data, error } = await supabase
        .from(TABLE)
        .update({ ...versBase(client), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) return { data: null, error: mapError(error) };
      return { data: mapClient(data), error: null };
    }

    // Accord pour les actualités et bons cadeaux. Donné : daté et sourcé
    // (« equipe » quand il est recueilli au téléphone ou sur place). Retiré :
    // daté comme une désinscription, pour la traçabilité.
    async function setConsentement(id, accord, source = 'equipe') {
      const maintenant = new Date().toISOString();
      const patch = accord
        ? { consentement_marketing: true, consentement_at: maintenant, consentement_source: source, desinscrit_at: null }
        : { consentement_marketing: false, desinscrit_at: maintenant };
      const { data, error } = await supabase
        .from(TABLE)
        .update({ ...patch, updated_at: maintenant })
        .eq('id', id)
        .select()
        .single();
      if (error) return { data: null, error: mapError(error) };
      return { data: mapClient(data), error: null };
    }

    async function setArchive(id, archive) {
      const { data, error } = await supabase
        .from(TABLE)
        .update({ archive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) return { data: null, error: mapError(error) };
      return { data: mapClient(data), error: null };
    }

    return { list, get, historique, create, update, setConsentement, setArchive };
  }, [etablissementId]);
}
