// ═══════════════════════════════════════════════════════════════════════════
// Fiche client (lot L8) : les calculs, sans écran ni réseau.
//
// Tout part des deux lectures que la fiche fait déjà : les réservations du
// client (avec leurs étiquettes datées et leurs tables) et ses tickets de
// caisse (avec leurs articles). Trois résultats :
//   - le fil d'activité, du plus récent au plus ancien : réservations, visites
//     avec leur montant, notes, allergies ajoutées ;
//   - les propriétés : visites, dépense moyenne, table préférée, allergies,
//     étiquettes, prochaine venue ;
//   - une suggestion calculée, jamais par l'IA (réservée au consultant) :
//     l'article qui revient le plus et le rythme des visites. Quand les
//     données ne suffisent pas, elle vaut null et rien ne s'affiche.
//
// Une visite est une réservation honorée (arrivée, partie, ou confirmée et
// passée, la règle de la vue resa_clients_stats) ou un ticket ouvert au nom du
// client sans réservation. Les tickets d'une réservation (addition partagée
// comprise) font une seule visite, dont le montant est leur somme.
// ═══════════════════════════════════════════════════════════════════════════

import { zurichDateHeure } from '../../utils/zurichTime.js';

// Habitué : trois visites ou plus (même seuil que l'onglet Clients).
export const HABITUE = 3;

// Suggestion d'article : présent dans au moins deux visites, et dans la
// moitié au moins des visites qui ont un ticket.
const ARTICLE_VISITES_MIN = 2;
const ARTICLE_PART_MIN = 0.5;
// Rythme : au moins trois visites, des jours différents.
const RYTHME_VISITES_MIN = 3;

// Libellé affiché d'une étiquette prédéfinie (même table que le sélecteur).
const LIBELLES_TAGS = { fruits_de_mer: 'fruits de mer', vegetarien: 'végétarien', menu_fixe: 'menu fixe' };
export const libelleTag = (v) => LIBELLES_TAGS[v] || String(v || '').replace(/_/g, ' ').trim();

// Clé de comparaison : sans accents, sans casse, espaces réduits.
export const cle = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

export const totalTicket = (t) => (t?.caisse_lignes || [])
  .reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0), 0);

const hhmm = (h) => String(h || '').slice(0, 5);
const moment = (e) => `${e.jour || ''} ${e.heure || '00:00'}`;

// Jour et heure de Zurich d'un horodatage, null s'il est illisible.
function quand(iso) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return null;
  const z = zurichDateHeure(iso);
  return { jour: z.jour, heure: z.heure };
}

// Ordre d'un même instant : la visite ou la réservation, puis sa note, puis
// l'allergie.
const RANG = { visite: 0, reservation: 0, note: 1, allergie: 2 };
const antichrono = (a, b) => moment(b).localeCompare(moment(a)) || (RANG[a.type] - RANG[b.type]);

// Dédoublonne en gardant le premier libellé rencontré.
function uniques(liste) {
  const vus = new Set();
  const out = [];
  for (const v of liste) {
    const k = cle(v);
    if (!k || vus.has(k)) continue;
    vus.add(k);
    out.push(String(v).trim());
  }
  return out;
}

// ─── Fil d'activité ────────────────────────────────────────────────────────

export function filActivite({ historique = [], tickets = [], aujourdhui }) {
  const resas = (historique || []).filter((r) => r && r.id);
  const idsResa = new Set(resas.map((r) => r.id));
  const ticketsParResa = new Map();
  const seuls = [];
  for (const t of tickets || []) {
    if (!t || !quand(t.created_at)) continue;
    if (t.reservation_id && idsResa.has(t.reservation_id)) {
      const l = ticketsParResa.get(t.reservation_id) || [];
      l.push(t);
      ticketsParResa.set(t.reservation_id, l);
    } else {
      seuls.push(t);
    }
  }

  const evts = [];
  for (const r of resas) {
    const jour = String(r.date_service || '').slice(0, 10);
    const heure = hhmm(r.heure_arrivee);
    const lies = ticketsParResa.get(r.id) || [];
    const occasions = uniques((r.reservation_tags || [])
      .filter((t) => t.type_tag === 'occasion').map((t) => libelleTag(t.valeur)));
    const tablesTickets = uniques(lies.map((t) => t.salle_tables?.nom).filter(Boolean));
    const base = {
      jour, heure, service: r.service || null,
      couverts: Number(r.nb_couverts) || 0,
      tables: (r.tables && r.tables.length) ? r.tables : tablesTickets,
      origine: r.origine || null, occasions,
    };
    // Un ticket prouve la visite, quel que soit le statut noté.
    const venue = lies.length > 0
      || r.statut === 'arrive' || r.statut === 'parti'
      || (r.statut === 'confirme' && jour < aujourdhui);
    if (venue) {
      evts.push({
        ...base, id: `v-${r.id}`, type: 'visite',
        montant: lies.length ? lies.reduce((s, t) => s + totalTicket(t), 0) : null,
        tickets: lies, enCours: lies.some((t) => t.statut === 'ouvert'),
      });
    } else {
      const passee = jour < aujourdhui;
      const etat = r.statut === 'annule' ? 'annulee'
        : r.statut === 'no_show' ? 'no_show'
          : r.statut === 'demande' ? (passee ? 'non_confirmee' : 'a_confirmer')
            : 'a_venir';
      evts.push({ ...base, id: `r-${r.id}`, type: 'reservation', statut: r.statut, etat, passee });
    }
    const note = String(r.notes_libres || '').trim();
    if (note) evts.push({ id: `n-${r.id}`, type: 'note', jour, heure, texte: note });
  }

  for (const t of seuls) {
    const q = quand(t.created_at);
    evts.push({
      id: `t-${t.id}`, type: 'visite', jour: q.jour, heure: q.heure, service: null,
      couverts: Number(t.couverts) || 0,
      tables: t.salle_tables?.nom ? [t.salle_tables.nom] : [],
      origine: null, occasions: [],
      montant: totalTicket(t), tickets: [t], enCours: t.statut === 'ouvert',
    });
  }

  // Allergies : la première fois qu'un allergène est noté sur une réservation,
  // datée par l'étiquette (le moment où l'équipe l'a saisie), sinon par la
  // réservation.
  const candidates = [];
  for (const r of resas) {
    for (const t of r.reservation_tags || []) {
      if (t.type_tag !== 'allergene' || !cle(t.valeur)) continue;
      const q = quand(t.created_at) || { jour: String(r.date_service || '').slice(0, 10), heure: hhmm(r.heure_arrivee) };
      candidates.push({ libelle: libelleTag(t.valeur), ...q });
    }
  }
  candidates.sort((a, b) => moment(a).localeCompare(moment(b)));
  const vues = new Set();
  for (const c of candidates) {
    const k = cle(c.libelle);
    if (vues.has(k)) continue;
    vues.add(k);
    evts.push({ id: `a-${k}`, type: 'allergie', jour: c.jour, heure: c.heure, libelle: c.libelle });
  }

  return evts.sort(antichrono);
}

// ─── Propriétés ────────────────────────────────────────────────────────────

// Allergies saisies sur la fiche (texte libre : « Gluten, végétarien »).
export function allergiesTexte(texte) {
  return uniques(String(texte || '').split(/[,;/\n]+/).map((s) => s.trim()));
}

export function proprietes({ client, historique = [], fil = [], aujourdhui }) {
  const visites = fil.filter((e) => e.type === 'visite');
  const avecMontant = visites.filter((v) => v.montant > 0);
  const depenseMoyenne = avecMontant.length
    ? avecMontant.reduce((s, v) => s + v.montant, 0) / avecMontant.length
    : null;

  // Table préférée : la plus fréquente, sur deux visites au moins ; à
  // égalité, la plus récente.
  const parTable = new Map();
  for (const v of visites) {
    for (const nom of uniques(v.tables || [])) {
      const k = cle(nom);
      const e = parTable.get(k) || { nom, fois: 0, dernier: '' };
      e.fois += 1;
      if (moment(v) > e.dernier) e.dernier = moment(v);
      parTable.set(k, e);
    }
  }
  const meilleure = [...parTable.values()]
    .sort((a, b) => (b.fois - a.fois) || b.dernier.localeCompare(a.dernier))[0];
  const tablePreferee = meilleure && meilleure.fois >= 2
    ? { nom: meilleure.nom, fois: meilleure.fois, sur: visites.filter((v) => (v.tables || []).length).length }
    : null;

  // Allergies : la fiche d'abord, puis celles notées sur les réservations.
  const allergies = uniques([
    ...allergiesTexte(client?.allergies),
    ...fil.filter((e) => e.type === 'allergie').map((e) => e.libelle),
  ]);

  // Étiquettes : habitué, puis régimes et étiquettes libres des réservations,
  // les plus fréquentes d'abord. Les occasions restent sur leur réservation.
  const parEtiquette = new Map();
  for (const r of historique || []) {
    for (const t of r.reservation_tags || []) {
      if (t.type_tag !== 'regime' && t.type_tag !== 'autre') continue;
      const libelle = libelleTag(t.valeur);
      const k = cle(libelle);
      if (!k) continue;
      const e = parEtiquette.get(k) || { libelle, type: t.type_tag, fois: 0 };
      e.fois += 1;
      parEtiquette.set(k, e);
    }
  }
  const etiquettes = [
    ...(visites.length >= HABITUE ? [{ libelle: 'Habitué', type: 'habitue' }] : []),
    ...[...parEtiquette.values()]
      .sort((a, b) => (b.fois - a.fois) || a.libelle.localeCompare(b.libelle, 'fr'))
      .map(({ libelle, type }) => ({ libelle, type })),
  ];

  const prochaine = fil
    .filter((e) => e.type === 'reservation' && (e.etat === 'a_venir' || e.etat === 'a_confirmer'))
    .sort((a, b) => moment(a).localeCompare(moment(b)))[0] || null;

  const passees = visites.filter((v) => v.jour <= aujourdhui).map((v) => v.jour).sort();

  return {
    visites: visites.length,
    premiere: passees[0] || null,
    derniere: passees[passees.length - 1] || null,
    depenseMoyenne,
    tablePreferee,
    allergies,
    etiquettes,
    prochaine: prochaine
      ? { jour: prochaine.jour, heure: prochaine.heure, couverts: prochaine.couverts, etat: prochaine.etat }
      : null,
    noShows: fil.filter((e) => e.type === 'reservation' && e.etat === 'no_show').length,
  };
}

// ─── Suggestion ────────────────────────────────────────────────────────────

const joursEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// Rythme des visites : l'écart médian entre deux jours de visite, en
// semaines jusqu'à sept, en mois ensuite, rien au-delà d'un an.
export function rythmeVisites(jours) {
  const liste = [...new Set((jours || []).filter(Boolean))].sort();
  if (liste.length < RYTHME_VISITES_MIN) return null;
  const ecarts = liste.slice(1).map((j, i) => joursEntre(liste[i], j)).sort((a, b) => a - b);
  const m = ecarts.length % 2
    ? ecarts[(ecarts.length - 1) / 2]
    : (ecarts[ecarts.length / 2 - 1] + ecarts[ecarts.length / 2]) / 2;
  if (!(m > 0) || m > 400) return null;
  if (m <= 10) return { unite: 'semaine', n: 1 };
  if (m < 49) return { unite: 'semaine', n: Math.round(m / 7) };
  const n = Math.max(1, Math.round(m / 30.44));
  return { unite: 'mois', n: Math.min(n, 12) };
}

// Article à proposer : parmi les articles présents dans assez de visites, celui
// où le client a le plus dépensé. Le plus fréquent seul serait presque
// toujours l'eau ou le café ; pondéré par la dépense, c'est le vin ou le plat
// qu'il reprend.
export function articleFavori(visites) {
  const avecTickets = (visites || []).filter((v) => (v.tickets || []).length);
  if (avecTickets.length < ARTICLE_VISITES_MIN) return null;
  const parArticle = new Map();
  for (const v of avecTickets) {
    const vus = new Set();
    for (const t of v.tickets) {
      for (const l of t.caisse_lignes || []) {
        const k = cle(l.libelle);
        if (!k) continue;
        const e = parArticle.get(k) || { libelle: String(l.libelle).trim(), visites: 0, quantite: 0, depense: 0 };
        e.quantite += Number(l.quantite) || 0;
        e.depense += (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0);
        if (!vus.has(k)) { e.visites += 1; vus.add(k); }
        parArticle.set(k, e);
      }
    }
  }
  const seuil = Math.max(ARTICLE_VISITES_MIN, Math.ceil(avecTickets.length * ARTICLE_PART_MIN));
  const meilleur = [...parArticle.values()]
    .filter((e) => e.visites >= seuil && e.quantite > 0)
    .sort((a, b) => (b.depense - a.depense) || (b.visites - a.visites) || a.libelle.localeCompare(b.libelle, 'fr'))[0];
  return meilleur ? { libelle: meilleur.libelle, visites: meilleur.visites, sur: avecTickets.length } : null;
}

export function suggestion({ fil = [], aujourdhui }) {
  const visites = fil.filter((e) => e.type === 'visite' && e.jour <= aujourdhui);
  const article = articleFavori(visites);
  const rythme = rythmeVisites(visites.map((v) => v.jour));
  return article || rythme ? { article, rythme } : null;
}

// ─── Tout, d'un appel ──────────────────────────────────────────────────────

export function ficheClient({ client, historique = [], tickets = [], aujourdhui }) {
  const fil = filActivite({ historique, tickets, aujourdhui });
  return {
    fil,
    proprietes: proprietes({ client, historique, fil, aujourdhui }),
    suggestion: suggestion({ fil, aujourdhui }),
  };
}

// Jour dit par rapport à aujourd'hui : un mot pour la veille, le jour et le
// lendemain, sinon la date suisse.
export function jourRelatif(jour, aujourdhui) {
  if (!jour) return { mot: null, date: '' };
  const [y, m, d] = String(jour).slice(0, 10).split('-');
  const date = `${d}.${m}.${y}`;
  const ecart = aujourdhui ? joursEntre(aujourdhui, jour) : NaN;
  const mot = ecart === 0 ? 'aujourdhui' : ecart === 1 ? 'demain' : ecart === -1 ? 'hier' : null;
  return { mot, date };
}
