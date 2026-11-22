import { supabase } from '../../services/supabase.js';
import { RUBRIQUES_PAR_POLE, brouillonPassation, prochainService } from './brouillonPassation.js';

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

const lendemain = (jour) => {
  const [y, m, d] = jour.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

// Lot 6b : le pôle choisit les rubriques, et donc les lectures. Les lectures
// de l'hôtel ne partent que si le pôle les écrit.
async function lireHotel(etabId, jour, rubriques) {
  const veut = (r) => rubriques.includes(r);
  const demain = lendemain(jour);
  const [sejours, demandes, chambres, ordres] = await Promise.all([
    veut('arrivees')
      ? lire(supabase.from('sejours').select('arrivee, depart, statut').eq('etablissement_id', etabId).or(`arrivee.eq.${demain},depart.eq.${demain}`).limit(500))
      : Promise.resolve(null),
    veut('demandes')
      ? lire(supabase.from('demandes').select('titre, priorite, statut').eq('etablissement_id', etabId).in('statut', ['ouverte', 'en_cours']).limit(200))
      : Promise.resolve(null),
    veut('chambres')
      ? lire(supabase.from('chambres').select('numero, statut_menage, actif').eq('etablissement_id', etabId).limit(500))
      : Promise.resolve(null),
    veut('ordres')
      ? lire(supabase.from('ordres_travail').select('titre, priorite, statut').eq('etablissement_id', etabId).in('statut', ['ouvert', 'planifie', 'en_cours']).limit(200))
      : Promise.resolve(null),
  ]);
  const occupe = (s) => s.statut !== 'annule' && s.statut !== 'no_show';
  const actives = (chambres || []).filter((c) => c.actif !== false);
  return {
    arriveesDemain: sejours ? sejours.filter((s) => occupe(s) && s.arrivee === demain).length : null,
    departsDemain: sejours ? sejours.filter((s) => occupe(s) && s.depart === demain).length : null,
    demandes: demandes || [],
    aFaire: chambres ? actives.filter((c) => c.statut_menage === 'a_faire' || c.statut_menage === 'en_cours').length : 0,
    horsService: chambres ? actives.filter((c) => c.statut_menage === 'hors_service').map((c) => c.numero) : [],
    ordres: ordres || [],
  };
}

export async function preparerPassation({ etabId, jour, minutes, tachesRestantes = [], avecReservations = true, pole = null }) {
  const rubriques = RUBRIQUES_PAR_POLE[pole] || [];
  const avecHotel = ['arrivees', 'demandes', 'chambres', 'ordres'].some((r) => rubriques.includes(r));
  // Sans le module Réservations, « aucune réservation » serait faux : la
  // rubrique ne s'écrit pas.
  const prochain = avecReservations ? prochainService(jour, minutes) : null;
  const [pertes, releves, zones, reservations, hotel] = await Promise.all([
    lire(supabase.from('pertes').select('produit, quantite, unite, motif').eq('etablissement_id', etabId).eq('date', jour).order('created_at').limit(50)),
    lire(supabase.from('haccp_releves').select('zone_id, valeur, heure').eq('etablissement_id', etabId).eq('date', jour).eq('conforme', false).order('heure').limit(20)),
    lire(supabase.from('haccp_zones').select('id, nom, unite').eq('etablissement_id', etabId)),
    prochain
      ? lire(supabase.from('reservations').select('nb_couverts, est_groupe, nom, statut').eq('etablissement_id', etabId)
        .eq('date_service', prochain.jour).eq('service', prochain.service).limit(300))
      : Promise.resolve([]),
    avecHotel ? lireHotel(etabId, jour, rubriques) : Promise.resolve(null),
  ]);
  const zoneParId = new Map(zones.map((z) => [z.id, z]));
  const relevesHors = releves.map((r) => ({ zoneNom: zoneParId.get(r.zone_id)?.nom, unite: zoneParId.get(r.zone_id)?.unite, valeur: r.valeur, heure: r.heure }));
  return brouillonPassation({ pertes, relevesHors, tachesRestantes, reservations, prochain, aujourdhui: jour, pole, hotel });
}
