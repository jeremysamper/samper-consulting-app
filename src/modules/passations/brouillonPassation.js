// ─────────────────────────────────────────────────────────────────────────────
// Brouillon de passation de fin de service (lot C4, 18.11.2026). Fichier pur,
// testé par brouillonPassation.test.mjs.
//
// L'app rédige à partir de ce qu'elle sait déjà du service ; la personne
// relit, corrige et enregistre. Phrases courtes et complètes, une idée par
// ligne. Rien n'est inventé : une section sans donnée ne s'écrit pas.
// ─────────────────────────────────────────────────────────────────────────────

const STATUTS_ANNULES = new Set(['annule', 'annulee', 'annulée', 'refuse', 'refusee', 'no_show', 'demande']);
const NOMS_SERVICE = { midi: 'midi', soir: 'soir', brunch: 'brunch' };

const ajouter = (jour, n) => {
  const [y, m, d] = jour.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const nombre = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const texteNombre = (v) => String(v).replace('.', ',');
// Minuscule initiale, sauf un sigle (DLC) : « Surproduction » devient « surproduction ».
const minusculeInitiale = (t) => (/^[A-ZÉ]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
const liste = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`);

// Service de passation selon l'heure de Zurich (minutes depuis minuit) : on
// passe la main à la fin d'un service.
export function serviceDeLHeure(minutes) {
  if (minutes >= 5 * 60 && minutes < 15 * 60) return 'matin';
  if (minutes >= 15 * 60 && minutes < 18 * 60) return 'apres_midi';
  if (minutes >= 18 * 60 && minutes < 23 * 60 + 30) return 'soir';
  return 'nuit';
}

// Prochain service de réservation selon l'heure : le midi même avant 11 h
// (passation de la nuit ou du matin), le soir même avant 18 h, sinon le
// lendemain midi (passation du soir).
export function prochainService(jour, minutes) {
  if (minutes < 11 * 60) return { jour, service: 'midi' };
  if (minutes < 18 * 60) return { jour, service: 'soir' };
  return { jour: ajouter(jour, 1), service: 'midi' };
}

// pertes       : [{ produit, quantite, unite, motif }] du jour
// relevesHors  : [{ zoneNom, valeur, unite, heure }] non conformes du jour
// tachesRestantes : [titre] des tâches récurrentes du jour non cochées
// reservations : [{ nb_couverts, est_groupe, nom, statut }] du prochain service
// prochain     : { jour, service } ; aujourdhui : jour ISO
// pole         : pôle de la passation (lot 6b) ; il choisit les rubriques.
//                Sans pôle : les rubriques du restaurant, comme avant.
// hotel        : { arriveesDemain, departsDemain, demandes: [{ titre, priorite }],
//                  aFaire, horsService: ['304'], ordres: [{ titre, priorite }] }
// → { texte, sections } (sections : nombre de rubriques écrites)
export const RUBRIQUES_PAR_POLE = {
  cuisine: ['pertes', 'releves', 'taches', 'reservations'],
  restaurant: ['reservations', 'taches'],
  reception: ['arrivees', 'demandes', 'taches'],
  etages: ['chambres', 'arrivees', 'taches'],
  technique: ['ordres', 'chambres', 'taches'],
  spa: ['taches'],
  direction: ['arrivees', 'demandes', 'ordres', 'pertes', 'releves', 'taches', 'reservations'],
};
const RUBRIQUES_SANS_POLE = ['pertes', 'releves', 'taches', 'reservations'];
const URGENTES = new Set(['urgente', 'haute']);

export function brouillonPassation({ pertes = [], relevesHors = [], tachesRestantes = [], reservations = [], prochain = null, aujourdhui = null, pole = null, hotel = null }) {
  const lignes = [];
  const rubriques = RUBRIQUES_PAR_POLE[pole] || RUBRIQUES_SANS_POLE;
  const ecrire = (rubrique, fn) => { if (rubriques.includes(rubrique)) fn(); };
  const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

  // Branche Hôtel (lot 6b) : arrivées et départs du lendemain, demandes
  // ouvertes, chambres, ordres de travail. Une rubrique sans donnée lue
  // (module absent, table refusée) ne s'écrit pas.
  ecrire('arrivees', () => {
    if (!hotel || hotel.arriveesDemain == null) return;
    const a = hotel.arriveesDemain;
    const d = hotel.departsDemain || 0;
    if (!a && !d) { lignes.push('Demain : aucune arrivée ni aucun départ.'); return; }
    lignes.push(`Demain : ${a ? pluriel(a, 'arrivée', 'arrivées') : 'aucune arrivée'} et ${d ? pluriel(d, 'départ', 'départs') : 'aucun départ'}.`);
  });
  ecrire('demandes', () => {
    const ds = (hotel?.demandes || []).filter((x) => x && x.titre);
    if (!ds.length) return;
    const urgentes = ds.filter((x) => URGENTES.has(x.priorite)).map((x) => x.titre);
    lignes.push(`${pluriel(ds.length, 'demande ouverte', 'demandes ouvertes')}${urgentes.length ? `, dont ${liste(urgentes.slice(0, 3))}` : ''}.`);
  });
  ecrire('chambres', () => {
    if (!hotel) return;
    if (hotel.aFaire) lignes.push(`${pluriel(hotel.aFaire, 'chambre reste', 'chambres restent')} à faire.`);
    const hs = (hotel.horsService || []).filter(Boolean);
    if (hs.length) lignes.push(`Hors service : ${hs.length > 1 ? 'chambres' : 'chambre'} ${liste(hs.slice(0, 6))}.`);
  });
  ecrire('ordres', () => {
    const os = (hotel?.ordres || []).filter((x) => x && x.titre);
    if (!os.length) return;
    const urgents = os.filter((x) => URGENTES.has(x.priorite)).map((x) => x.titre);
    lignes.push(`${pluriel(os.length, 'ordre de travail ouvert', 'ordres de travail ouverts')}${urgents.length ? `, dont ${liste(urgents.slice(0, 3))}` : ''}.`);
  });

  const p = rubriques.includes('pertes') ? pertes.filter((x) => x && x.produit) : [];
  if (p.length) {
    const items = p.slice(0, 6).map((x) => {
      const q = nombre(x.quantite);
      const quantite = q != null ? `${texteNombre(q)}${x.unite ? ` ${x.unite}` : ''} de ` : '';
      return `${quantite}${x.produit}${x.motif ? ` (${minusculeInitiale(String(x.motif))})` : ''}`;
    });
    const reste = p.length > 6 ? `, et ${p.length - 6} autres` : '';
    lignes.push(`Pertes du jour : ${liste(items)}${reste}.`);
  }

  (rubriques.includes('releves') ? relevesHors : []).slice(0, 4).forEach((r) => {
    const v = nombre(r.valeur);
    const valeur = v != null ? ` était à ${texteNombre(v)}${r.unite ? ` ${r.unite}` : ' °C'}` : ' était hors norme';
    const heure = r.heure ? ` à ${String(r.heure).slice(0, 5).replace(':', ' h ')}` : '';
    lignes.push(`${r.zoneNom || 'Un frigo'}${valeur}${heure}. Vérifiez-le au prochain relevé.`);
  });

  const t = rubriques.includes('taches') ? tachesRestantes.filter(Boolean) : [];
  if (t.length) lignes.push(`Tâches non faites : ${liste(t.slice(0, 6))}${t.length > 6 ? `, et ${t.length - 6} autres` : ''}.`);

  if (prochain && rubriques.includes('reservations')) {
    const resas = reservations.filter((r) => r && !STATUTS_ANNULES.has(String(r.statut || '').toLowerCase()));
    const quand = `${prochain.jour === aujourdhui ? 'Ce' : 'Demain'} ${NOMS_SERVICE[prochain.service] || prochain.service}`;
    if (resas.length) {
      const couverts = resas.reduce((s, r) => s + (nombre(r.nb_couverts) || 0), 0);
      const groupes = resas.filter((r) => r.est_groupe);
      const detailGroupes = groupes.length
        ? `, dont ${groupes.length > 1 ? `${groupes.length} groupes` : `le groupe ${groupes[0].nom || ''}`.trim()}`
        : '';
      lignes.push(`${quand} : ${couverts} couverts réservés en ${resas.length} réservation${resas.length > 1 ? 's' : ''}${detailGroupes}.`);
    } else {
      lignes.push(`${quand} : aucune réservation pour l'instant.`);
    }
  }

  const sections = lignes.length;
  if (!sections) lignes.push('Rien de particulier à signaler pour ce service.');
  return { texte: lignes.join('\n'), sections };
}
