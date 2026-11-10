// ─────────────────────────────────────────────────────────────────────────────
// Caisse v5 : qui est à la table. Fonctions pures, partagées par la feuille
// d'ouverture, le bandeau du ticket, le plan des tables et la liste des
// réservations sans ticket. Aucune écriture ici : les réservations ne
// s'écrivent que par les RPC caisse_ouvrir_ticket et caisse_corriger_reservation.
//
// Une réservation, telle que lue par caisseService.listReservations :
//   { id, nom, nb_couverts, heure_arrivee, date_service, statut, origine,
//     client_id, groupe_evenement_id, reservation_tables: [{ table_id }],
//     reservation_tags: [{ type_tag, valeur }], resa_clients: { allergies } }
// ─────────────────────────────────────────────────────────────────────────────

export const COUVERTS_RAPIDES = [1, 2, 3, 4, 5, 6, 7, 8];
export const COUVERTS_MAX = 99;

export const heureCourte = (h) => String(h || '').slice(0, 5);

// « 19:30 » -> 1170. NaN si l'heure est illisible.
export function minutesDe(heure) {
  const [h, m] = String(heure || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

// Ce que la salle doit savoir avant de prendre la commande : les allergies de
// la fiche client, puis les allergènes et régimes notés sur la réservation.
export function allergiesDe(resa) {
  const vus = [];
  const ajouter = (texte) => {
    const t = String(texte || '').trim();
    if (t && !vus.some((v) => v.toLowerCase() === t.toLowerCase())) vus.push(t);
  };
  ajouter(resa?.resa_clients?.allergies);
  (resa?.reservation_tags || [])
    .filter((t) => t.type_tag === 'allergene' || t.type_tag === 'regime')
    .forEach((t) => ajouter(t.valeur));
  return vus;
}

export const estSurTable = (resa, tableId) =>
  (resa?.reservation_tables || []).some((l) => l.table_id === tableId);

const cleHeure = (r) => `${r.date_service || ''} ${r.heure_arrivee || ''}`;

// Les réservations qu'on peut asseoir : du jour, attendues ou déjà notées
// arrivées à l'accueil, et sans ticket ouvert (une réservation n'ouvre pas
// deux tables par erreur). Celles posées sur la table d'abord, puis par heure.
export function reservationsAttachables(reservations, { jour, tableId = null, tickets = [], garder = null } = {}) {
  const prises = new Set((tickets || []).map((t) => t.reservation_id).filter(Boolean));
  return (reservations || [])
    .filter((r) => r.date_service === jour
      && (r.statut === 'confirme' || r.statut === 'arrive')
      && (!prises.has(r.id) || r.id === garder))
    .sort((a, b) => {
      const ta = tableId && estSurTable(a, tableId) ? 0 : 1;
      const tb = tableId && estSurTable(b, tableId) ? 0 : 1;
      return (ta - tb) || cleHeure(a).localeCompare(cleHeure(b));
    });
}

// Réservations confirmées du jour dont l'heure est passée du délai réglé, et
// qu'aucun ticket ouvert ne porte. La caisse les PROPOSE ; rien n'est posé
// sans un tap (no-show, ou arrivé sans ticket).
export function reservationsSansTicket(reservations, { jour, maintenantMinutes, delaiMinutes = 30, tickets = [] } = {}) {
  const prises = new Set((tickets || []).map((t) => t.reservation_id).filter(Boolean));
  return (reservations || [])
    .filter((r) => {
      if (r.date_service !== jour || r.statut !== 'confirme' || prises.has(r.id)) return false;
      const m = minutesDe(r.heure_arrivee);
      return Number.isFinite(m) && maintenantMinutes - m >= delaiMinutes;
    })
    .sort((a, b) => cleHeure(a).localeCompare(cleHeure(b)));
}

// Nom à écrire sous une table du plan : la réservation du ticket ouvert, sinon
// la prochaine réservation attendue posée sur cette table aujourd'hui.
export function nomsParTable(reservations, { jour, tickets = [] } = {}) {
  const parId = new Map((reservations || []).map((r) => [r.id, r]));
  const noms = {};
  (tickets || []).forEach((t) => {
    const r = t.table_id && t.reservation_id ? parId.get(t.reservation_id) : null;
    if (r && !noms[t.table_id]) noms[t.table_id] = { nom: r.nom, attendu: false };
  });
  (reservations || [])
    .filter((r) => r.date_service === jour && r.statut === 'confirme')
    .sort((a, b) => cleHeure(a).localeCompare(cleHeure(b)))
    .forEach((r) => (r.reservation_tables || []).forEach((l) => {
      if (!noms[l.table_id]) noms[l.table_id] = { nom: r.nom, attendu: true, heure: heureCourte(r.heure_arrivee) };
    }));
  return noms;
}
