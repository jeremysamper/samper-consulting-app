// ─────────────────────────────────────────────────────────────────────────────
// Tournée des étages (plan 15, lot 6b) : règles pures, sans React.
//   - nature du ménage d'une chambre aujourd'hui (départ, recouche, arrivée) ;
//   - ordre de la tournée : les chambres qui attendent une arrivée, puis les
//     départs, puis les recouches, les « à faire » avant les « en cours » ;
//   - l'étape suivante d'une chambre, en un toucher.
// ─────────────────────────────────────────────────────────────────────────────

// Une chambre à nettoyer aujourd'hui : « à faire » ou « en cours ».
export const aNettoyer = (c) => c.statutMenage === 'a_faire' || c.statutMenage === 'en_cours';

// sejoursDuJour : les séjours de la maison ; jour : 'YYYY-MM-DD' (Zurich).
// 'arrivee' : un hôte arrive aujourd'hui dans la chambre ;
// 'depart'  : un hôte part aujourd'hui, ou la chambre est libre (ménage complet) ;
// 'recouche': un hôte y dort ce soir encore.
export function natureMenage(chambre, sejours, jour) {
  const siens = (sejours || []).filter((s) => s.chambreId === chambre.id && s.statut !== 'annule' && s.statut !== 'no_show');
  if (siens.some((s) => s.statut === 'prevu' && s.arrivee === jour)) return 'arrivee';
  if (siens.some((s) => s.depart === jour && (s.statut === 'en_maison' || s.statut === 'parti'))) return 'depart';
  if (siens.some((s) => s.statut === 'en_maison' && s.arrivee <= jour && s.depart > jour)) return 'recouche';
  return 'depart';
}

const RANG_NATURE = { arrivee: 0, depart: 1, recouche: 2 };
const RANG_STATUT = { a_faire: 0, en_cours: 1 };

// Les chambres de la tournée, dans l'ordre où les faire.
export function ordreTournee(chambres, sejours, jour) {
  return chambres
    .filter(aNettoyer)
    .map((c) => ({ c, nature: natureMenage(c, sejours, jour) }))
    .sort((a, b) => (RANG_NATURE[a.nature] - RANG_NATURE[b.nature])
      || ((RANG_STATUT[a.c.statutMenage] ?? 9) - (RANG_STATUT[b.c.statutMenage] ?? 9))
      || String(a.c.numero).localeCompare(String(b.c.numero), 'fr', { numeric: true }))
    .map((x) => x.c);
}

// L'étape suivante d'une chambre : { statut, label } ou null.
export function etapeSuivante(statut, peutInspecter) {
  if (statut === 'a_faire') return { statut: 'en_cours', label: 'Commencer' };
  if (statut === 'en_cours') return { statut: 'propre', label: 'Terminer' };
  if (statut === 'propre' && peutInspecter) return { statut: 'inspectee', label: 'Inspecter' };
  return null;
}

// « 45 min », « 1 h 30 ».
export function dureeLisible(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const reste = m % 60;
  return reste ? `${h} h ${String(reste).padStart(2, '0')}` : `${h} h`;
}
