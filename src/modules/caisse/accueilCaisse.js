// ─────────────────────────────────────────────────────────────────────────────
// Accueil de la caisse (26.11.2026) : ce que le plan, le bandeau du service et
// la liste « À faire maintenant » disent, en fonctions pures. Aucune lecture
// ni écriture ici : Caisse.jsx et PlanTables.jsx passent ce qu'ils ont lu.
//
// États d'une tablée, un seul à la fois, du plus pressant au plus calme :
//   pret       la cuisine a marqué un plat fait, la salle ne l'a pas servi
//   commander  un ticket est ouvert et rien n'est parti en cuisine
//   cuisine    des plats sont partis et la cuisine ne les a pas encore faits
//   suite      tout ce qui est parti est servi, une suite attend d'être réclamée
//   servi      tout ce qui est parti est servi, rien n'attend
//   reservee   une réservation du service est attendue sur la table
//   libre      ni ticket, ni réservation dans les 45 minutes
// ─────────────────────────────────────────────────────────────────────────────
import { serviceAffiche } from '../previsions/statutsReservation.js';
import { ATTENTE_COMMANDE_MIN, FENETRE_ARRIVEE_MIN } from './planService.js';

export const ETATS_TABLE = ['pret', 'commander', 'cuisine', 'suite', 'servi', 'reservee', 'libre'];

// Libellés des filtres du plan, au singulier et au pluriel (le nombre vit
// dans son propre nœud, à côté).
export const LIBELLES_ETAT = {
  pret: ['prête à servir', 'prêtes à servir'],
  commander: ['à commander', 'à commander'],
  cuisine: ['en cuisine', 'en cuisine'],
  suite: ['à suivre', 'à suivre'],
  servi: ['servie', 'servies'],
  reservee: ['réservée', 'réservées'],
  libre: ['libre', 'libres'],
};

const minutesDe = (heure) => {
  const [h, m] = String(heure || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
};
const heureCourte = (h) => String(h || '').slice(0, 5);

// Une ligne est « prête » tant que la cuisine l'a marquée faite et que la
// salle ne l'a pas encore servie.
export function estPret(ligne) {
  return Boolean(ligne?.pret_at) && ligne.statut !== 'servi';
}

// L'état d'un ticket, calculé une fois pour le plan et pour les listes.
// `boissons` : ids des plats vendus depuis une carte de boissons. Une boisson
// partie ne tient pas la table « en cuisine » : le bar la sert sans toujours
// la marquer faite au KDS.
export function etatTicket(ticket, maintenant = Date.now(), { boissons = null } = {}) {
  const lignes = ticket?.lignes || [];
  const envois = lignes.map((l) => (l.envoye_at ? new Date(l.envoye_at).getTime() : 0)).filter(Boolean);
  const dernier = envois.length ? Math.max(...envois) : null;
  const enAttente = lignes.filter((l) => l.statut === 'en_attente');
  const ouvert = ticket?.created_at ? new Date(ticket.created_at).getTime() : null;
  return {
    articles: lignes.reduce((s, l) => s + Number(l.quantite || 0), 0),
    montant: lignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_unitaire), 0),
    minutes: dernier == null ? null : Math.max(0, Math.floor((maintenant - dernier) / 60000)),
    // Minutes depuis l'ouverture du ticket, tant que rien n'est parti en cuisine.
    sansEnvoi: dernier == null && ouvert != null ? Math.max(0, Math.floor((maintenant - ouvert) / 60000)) : null,
    aEnvoyer: enAttente.filter((l) => l.suite === 1).length,
    aSuivre: enAttente.filter((l) => l.suite > 1).length,
    // Plats partis que la cuisine n'a pas encore marqués faits.
    enCuisine: lignes.filter((l) => l.statut === 'envoye' && !l.pret_at && !boissons?.has(l.plat_id)).length,
    // v6 : plats que la cuisine a marqués faits au KDS et que la salle n'a
    // pas encore notés servis. Posé par la base (caisse_lignes.pret_at).
    prets: lignes.filter(estPret).length,
  };
}

// État d'une tablée qui porte un ticket. `e` : etatTicket du ticket.
export function etatOccupee(e) {
  if (!e) return 'commander';
  if (e.prets > 0) return 'pret';
  if (e.minutes == null) return 'commander';
  if (e.enCuisine > 0) return 'cuisine';
  if (e.aSuivre > 0) return 'suite';
  return 'servi';
}

// Un ticket ouvert depuis ATTENTE_COMMANDE_MIN sans rien d'envoyé se signale.
export const commandeEnRetard = (e) => Boolean(e && e.sansEnvoi != null && e.sansEnvoi >= ATTENTE_COMMANDE_MIN);

// État d'une tablée sans ticket. `attendue` : la réservation du service posée
// dessus ({ heure, minutes, statut }), ou rien. Une réservation encore loin
// laisse la table libre « jusqu'à » son heure : on peut y asseoir un passage.
export function etatLibre(attendue, maintenantMinutes) {
  if (!attendue) return { etat: 'libre' };
  if (attendue.statut === 'arrive') return { etat: 'reservee', arrivee: true, retard: 0 };
  const m = Number.isFinite(attendue.minutes) ? attendue.minutes : minutesDe(attendue.heure);
  if (!Number.isFinite(m)) return { etat: 'reservee', retard: 0 };
  const ecart = m - maintenantMinutes;
  if (ecart > FENETRE_ARRIVEE_MIN) return { etat: 'libre', jusqua: heureCourte(attendue.heure) };
  return { etat: 'reservee', retard: ecart < 0 ? -ecart : 0 };
}

// Compte des tablées par état, une tablée une fois.
export function compterEtats(etats) {
  const compte = Object.fromEntries(ETATS_TABLE.map((k) => [k, 0]));
  (etats || []).forEach((k) => { if (k in compte) compte[k] += 1; });
  return compte;
}

const couvertsDe = (liste) => liste.reduce((s, r) => s + Number(r.nb_couverts || 0), 0);
const parHeure = (a, b) => String(a.heure_arrivee || '').localeCompare(String(b.heure_arrivee || ''));

// Les réservations du service, rangées pour le bandeau : arrivées (assises,
// cochées à l'accueil ou déjà parties), prévues (heure à venir), en retard
// (heure passée, personne assis) et no-show. Les demandes en ligne pas encore
// confirmées et les annulées n'y entrent pas : elles ne sont pas attendues.
// Une réservation en retard depuis `delaiMinutes` peut être marquée no-show :
// la caisse le propose, elle ne le pose jamais seule.
export function reservationsDuService(reservations, { jour, service, tickets = [], maintenantMinutes, delaiMinutes = 30 }) {
  const prises = new Set((tickets || []).map((t) => t.reservation_id).filter(Boolean));
  const arrivees = [];
  const prevues = [];
  const retard = [];
  const noShow = [];
  (reservations || [])
    .filter((r) => r.date_service === jour && serviceAffiche(r.service) === service)
    .sort(parHeure)
    .forEach((r) => {
      if (r.statut === 'arrive' || r.statut === 'parti' || (r.statut === 'confirme' && prises.has(r.id))) { arrivees.push(r); return; }
      if (r.statut === 'no_show') { noShow.push(r); return; }
      if (r.statut !== 'confirme') return;
      const m = minutesDe(r.heure_arrivee);
      if (Number.isFinite(m) && maintenantMinutes > m) {
        const minutes = maintenantMinutes - m;
        retard.push({ ...r, retard: minutes, peutNoShow: minutes >= delaiMinutes });
      } else {
        prevues.push(r);
      }
    });
  return {
    arrivees, prevues, retard, noShow,
    couverts: {
      arrivees: couvertsDe(arrivees), prevues: couvertsDe(prevues), retard: couvertsDe(retard), noShow: couvertsDe(noShow),
    },
    prochaine: prevues.length ? heureCourte(prevues[0].heure_arrivee) : null,
  };
}

// « À faire maintenant », du plus pressant au moins pressant :
//   1. tablées dont des plats sont prêts (le plus de plats d'abord)
//   2. réservations en retard qu'on peut marquer arrivées ou no-show
//   3. tablées ouvertes depuis 10 minutes sans rien d'envoyé (la plus longue d'abord)
//   4. tablées dont la suite attend d'être réclamée (le plus long silence d'abord)
// `tablees` : [{ table, ticket, e, etat }], une entrée par tablée.
// `retards` : reservationsDuService(...).retard.
export function aFaireMaintenant({ tablees = [], retards = [] } = {}) {
  const prets = tablees.filter((x) => x.etat === 'pret')
    .sort((a, b) => b.e.prets - a.e.prets || parNom(a, b))
    .map((x) => ({ type: 'pret', cle: 'p-' + x.ticket.id, ...x }));
  const resas = retards.filter((r) => r.peutNoShow)
    .map((r) => ({ type: 'retard', cle: 'r-' + r.id, resa: r }));
  const commander = tablees.filter((x) => x.etat === 'commander' && commandeEnRetard(x.e))
    .sort((a, b) => b.e.sansEnvoi - a.e.sansEnvoi || parNom(a, b))
    .map((x) => ({ type: 'commander', cle: 'c-' + x.ticket.id, ...x }));
  const suites = tablees.filter((x) => x.etat === 'suite')
    .sort((a, b) => (b.e.minutes ?? 0) - (a.e.minutes ?? 0) || parNom(a, b))
    .map((x) => ({ type: 'suite', cle: 's-' + x.ticket.id, ...x }));
  return [...prets, ...resas, ...commander, ...suites];
}

function parNom(a, b) {
  return String(a.table?.nom || '').localeCompare(String(b.table?.nom || ''), undefined, { numeric: true });
}
