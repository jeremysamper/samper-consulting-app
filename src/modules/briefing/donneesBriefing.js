import { supabase } from '../../services/supabase.js';
import { getDemoData } from '../../data/demoData.js';
import { userDisplayName } from '../../utils/userDisplay.js';
import { briefingService } from './briefingLogique.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lectures du briefing d'avant-service (lot C3) : le jour et le service
// choisis seulement. Chaque lecture est indépendante : une table que la
// personne ne lit pas, ou un module que l'établissement n'a pas, retire sa
// rubrique sans bloquer les autres.
// ─────────────────────────────────────────────────────────────────────────────

async function lire(requete) {
  try {
    const { data, error } = await requete;
    return error ? [] : (data || []);
  } catch {
    return [];
  }
}

export async function preparerBriefing({ etabId, jour, service, avecReservations = true, avecPlanning = true, avecHaccp = true, avecPassations = true }) {
  const vide = Promise.resolve([]);
  const [reservations, shifts, absences, releves, zones, passations] = await Promise.all([
    avecReservations
      ? lire(supabase.from('reservations').select('nb_couverts, nom, est_groupe, heure_arrivee, notes_libres, statut')
        .eq('etablissement_id', etabId).eq('date_service', jour).eq('service', service).limit(400))
      : vide,
    avecPlanning ? lire(supabase.from('shifts').select('user_id, debut, fin').eq('etablissement_id', etabId).eq('date', jour).limit(400)) : vide,
    avecPlanning ? lire(supabase.from('absences').select('user_id, motif').eq('etablissement_id', etabId).lte('date_debut', jour).gte('date_fin', jour).limit(200)) : vide,
    avecHaccp ? lire(supabase.from('haccp_releves').select('zone_id, valeur, heure').eq('etablissement_id', etabId).eq('date', jour).eq('conforme', false).limit(20)) : vide,
    avecHaccp ? lire(supabase.from('haccp_zones').select('id, nom, unite').eq('etablissement_id', etabId)) : vide,
    avecPassations ? lire(supabase.from('passations').select('contenu').eq('etablissement_id', etabId).eq('jour', jour).eq('important', true).limit(10)) : vide,
  ]);
  const users = getDemoData()?.utilisateurs || [];
  const nom = (id) => userDisplayName(id, { users, fallback: 'Une personne' });
  const zoneParId = new Map(zones.map((z) => [z.id, z]));
  const absentsIds = new Set(absences.map((a) => a.user_id));
  return briefingService({
    service,
    reservations,
    equipe: shifts.filter((s) => !absentsIds.has(s.user_id)).map((s) => ({ nom: nom(s.user_id), debut: s.debut, fin: s.fin })),
    absents: absences.map((a) => ({ nom: nom(a.user_id), motif: a.motif })),
    relevesHors: releves.map((r) => ({ zoneNom: zoneParId.get(r.zone_id)?.nom, unite: zoneParId.get(r.zone_id)?.unite, valeur: r.valeur, heure: r.heure })),
    importantes: passations.map((p) => p.contenu),
  });
}
