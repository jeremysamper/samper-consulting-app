// ─────────────────────────────────────────────────────────────────────────────
// Chiffres de l'accueil des Réservations (direction Galet), fonction pure
// testée par accueilReservations.test.mjs. Elle ne lit que les réservations du
// jour déjà chargées par l'accueil (useReservationsJour).
//
// Mêmes règles que la vue jour (VueJour.jsx) : un no-show n'est pas un
// couvert ; le brunch se compte avec le midi (serviceAffiche). Par service :
//   couverts     tous les couverts sauf les no-shows
//   arrives      couverts arrivés (à table, puis partis) : la part faite
//   attables     couverts à table
//   reservations nombre de réservations comptées
// Pour le jour : les mêmes totaux, et le nombre de réservations de groupe.
// ─────────────────────────────────────────────────────────────────────────────
import { SERVICES_AFFICHES, serviceAffiche } from './statutsReservation.js';

const vide = () => ({ couverts: 0, arrives: 0, attables: 0, reservations: 0 });

export function chiffresDuJour(resas) {
  const services = Object.fromEntries(SERVICES_AFFICHES.map((s) => [s, vide()]));
  const jour = { ...vide(), groupes: 0 };
  for (const r of resas || []) {
    if (r.statut === 'no_show' || r.statut === 'annule') continue;
    const n = r.nb_couverts || 0;
    const ajouter = (c) => {
      c.couverts += n;
      c.reservations += 1;
      if (r.statut === 'arrive' || r.statut === 'parti') c.arrives += n;
      if (r.statut === 'arrive') c.attables += n;
    };
    ajouter(jour);
    if (r.est_groupe) jour.groupes += 1;
    const s = services[serviceAffiche(r.service)];
    if (s) ajouter(s);
  }
  return { jour, services };
}
