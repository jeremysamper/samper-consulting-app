import { supabase } from '../../services/supabase.js';
import { brouillonPassation, prochainService } from './brouillonPassation.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lectures du brouillon de passation (lot C4) : seulement le jour en cours et
// le prochain service, jamais tout l'historique. Chaque lecture est
// indépendante : une table que la personne ne lit pas (RLS) ou une lecture en
// échec retire sa rubrique du brouillon, sans bloquer les autres.
// ─────────────────────────────────────────────────────────────────────────────

async function lire(requete) {
  try {
    const { data, error } = await requete;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function preparerPassation({ etabId, jour, minutes, tachesRestantes = [], avecReservations = true }) {
  // Sans le module Réservations, « aucune réservation » serait faux : la
  // rubrique ne s'écrit pas.
  const prochain = avecReservations ? prochainService(jour, minutes) : null;
  const [pertes, releves, zones, reservations] = await Promise.all([
    lire(supabase.from('pertes').select('produit, quantite, unite, motif').eq('etablissement_id', etabId).eq('date', jour).order('created_at').limit(50)),
    lire(supabase.from('haccp_releves').select('zone_id, valeur, heure').eq('etablissement_id', etabId).eq('date', jour).eq('conforme', false).order('heure').limit(20)),
    lire(supabase.from('haccp_zones').select('id, nom, unite').eq('etablissement_id', etabId)),
    prochain
      ? lire(supabase.from('reservations').select('nb_couverts, est_groupe, nom, statut').eq('etablissement_id', etabId)
        .eq('date_service', prochain.jour).eq('service', prochain.service).limit(300))
      : Promise.resolve([]),
  ]);
  const zoneParId = new Map(zones.map((z) => [z.id, z]));
  const relevesHors = releves.map((r) => ({ zoneNom: zoneParId.get(r.zone_id)?.nom, unite: zoneParId.get(r.zone_id)?.unite, valeur: r.valeur, heure: r.heure }));
  return brouillonPassation({ pertes, relevesHors, tachesRestantes, reservations, prochain, aujourdhui: jour });
}
