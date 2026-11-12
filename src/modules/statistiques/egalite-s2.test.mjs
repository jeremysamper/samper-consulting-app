// node --test : égalité des familles de S2 avec leurs écrans d'origine (D4).
// Même règle qu'egalite.test.mjs : le total de la période est la valeur de la
// fonction d'origine sur la période entière ; pour un flux, la somme des
// points fait ce total, au centime ou à l'unité, sauf écart d'arrondi annoncé
// et borné (calcul d'origine qui somme sans arrondir).
// Lancer : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { FAMILLES, MESURES } from './catalogueMesures.js';
import { sommeFlux, trancheEntiere, tranchesDe } from './agregation.js';
import { jeuPertes } from '../pertes/jeuPertes.mjs';
import { jeuHoraires } from '../planning/jeuHoraires.mjs';
import { calcHeures, heuresFaites, retardsDe, soldeMois } from '../planning/soldesHeures.js';
import { jeuReleves, ZONES } from '../haccp/jeuReleves.mjs';
import { composer } from './composition.js';
import { jeuInventaires } from '../inventaire/jeuInventaires.mjs';
import { valeurStockConsolidee } from '../../utils/inventairePerimetres.js';
import { totauxFactures } from '../inventaire/facturesLogic.js';
import { jeuGroupes } from '../groupes/jeuGroupes.mjs';
import { J1, J2, jeuEssai } from '../caisse/rapports/jeuEssai.mjs';
import { rapportCaisse } from '../caisse/rapports/calculRapports.js';
import { computeReservationStats } from '../previsions/rapport/computeReservationStats.js';

const famille = (id) => FAMILLES.find((f) => f.id === id);
const mesuresDe = (id) => MESURES.filter((m) => m.famille === id);
const mesure = (id) => MESURES.find((m) => m.id === id);
const AUJ = '2026-11-11';

function lire(id, donnees, debut, fin, pas, ctx = {}) {
  const f = famille(id);
  const tranches = tranchesDe(debut, fin, pas);
  return {
    tranches,
    points: f.calculer(donnees, tranches, { aujourdhui: AUJ, ...ctx }),
    total: f.calculer(donnees, [trancheEntiere(debut, fin)], { aujourdhui: AUJ, ...ctx })[0],
  };
}

// Somme des points contre total, pour chaque flux de la famille ; tolérance
// en centièmes d'unité, par mesure.
function verifierFlux(id, lu, tolerance = {}) {
  mesuresDe(id).filter((m) => m.nature === 'flux').forEach((m) => {
    const valeurs = lu.points.map((p) => m.valeur(p));
    const total = m.valeur(lu.total);
    const somme = sommeFlux(valeurs);
    if (total == null) { assert.equal(somme, null, `${m.id} : total n/a, des points ont une valeur`); return; }
    const ecart = Math.abs(Math.round(((somme ?? 0) - total) * 100));
    assert.ok(ecart <= (tolerance[m.id] || 0), `${m.id} : somme ${somme}, total ${total}, écart ${ecart}`);
  });
}

// ── Pertes ──
test('pertes : la valeur et les déclarations font le total de l\'écran Pertes', () => {
  const pertes = jeuPertes();
  const ecran = pertes.reduce((s, p) => s + p.quantite * p.valeurUnit, 0);
  ['jour', 'semaine', 'mois'].forEach((pas) => {
    const lu = lire('pertes', { pertes }, '2026-01-01', '2026-12-31', pas);
    // L'écran somme sans arrondir : un point arrondi au centime s'écarte d'un
    // demi-centime au plus, la somme de n points de n/2 centimes au plus.
    verifierFlux('pertes', lu, { 'pertes.valeur': Math.ceil(lu.points.length / 2) });
    assert.equal(mesure('pertes.valeur').valeur(lu.total).toFixed(2), ecran.toFixed(2));
    assert.equal(mesure('pertes.declarations').valeur(lu.total), pertes.length);
  });
  const lu = lire('pertes', { pertes }, '2026-01-01', '2026-12-31', 'mois');
  ['categorie', 'motif'].forEach((v) => {
    const parts = mesure('pertes.valeur').ventilations.find((x) => x.id === v).parts(lu.total);
    assert.equal(parts.reduce((s, x) => s + x.valeur, 0).toFixed(2), ecran.toFixed(2), v);
  });
  const [vide] = lire('pertes', { pertes }, '2025-01-01', '2025-01-01', 'jour').points;
  assert.equal(mesure('pertes.valeur').valeur(vide), null);
});

// ── Planning et pointage ──
test('planning : chaque flux fait le total, égal à la grille, au relevé et au solde du mois', () => {
  const { shifts, contrats, absences } = jeuHoraires();
  const noms = { u1: 'Ana', u2: 'Bea', u3: 'Cid', u4: 'Dan' };
  const donnees = { shifts, contrats, absences, noms };
  // Heures décimales sans arrondi d'origine (un tiers d'heure, 4,8 h dues par
  // jour) : chaque point affiché au centième s'écarte d'un demi-centième au plus.
  ['jour', 'semaine', 'mois'].forEach((pas) => {
    const lu = lire('planning', donnees, '2026-10-01', '2026-10-31', pas);
    const borne = Math.ceil(lu.points.length / 2);
    verifierFlux('planning', lu, { 'planning.heures_prevues': borne, 'planning.heures_pointees': borne, 'planning.solde': borne });
  });
  const lu = lire('planning', donnees, '2026-10-01', '2026-10-31', 'semaine');
  const oct = shifts.filter((s) => s.date >= '2026-10-01' && s.date <= '2026-10-31');
  const v = (id) => mesure(id).valeur(lu.total);
  const proche = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m} : ${a} au lieu de ${b}`);
  proche(v('planning.heures_prevues'), oct.reduce((t, s) => t + parseFloat(calcHeures(s.debut, s.fin, s.pause)), 0), 'prévues');
  proche(v('planning.heures_pointees'), heuresFaites(oct), 'pointées');
  assert.equal(v('planning.retards'), retardsDe(oct).nombre);
  assert.equal(v('planning.minutes_retard'), retardsDe(oct).minutes);
  const soldes = ['u1', 'u2'].map((u) => soldeMois({ mois: '2026-10', userId: u, contrats, shifts, absences }).solde);
  proche(v('planning.solde'), soldes[0] + soldes[1], 'solde');
  const parts = mesure('planning.heures_prevues').ventilations[0].parts(lu.total);
  assert.deepEqual(parts.map((x) => x.libelle).sort(), ['Ana', 'Bea', 'Cid', 'Dan']);
  proche(parts.reduce((t, x) => t + x.valeur, 0), v('planning.heures_prevues'), 'ventilation');
  const juil = lire('planning', donnees, '2026-07-01', '2026-07-31', 'mois');
  assert.equal(mesure('planning.absences').valeur(juil.total), 14);
  const [vide] = lire('planning', donnees, '2025-01-01', '2025-01-01', 'jour').points;
  assert.equal(mesure('planning.heures_prevues').valeur(vide), null);
});

// ── HACCP ──
test('haccp : relevés et anomalies font le total du registre, le taux est le sien, la température suit la zone choisie', () => {
  const releves = jeuReleves();
  const donnees = { releves, zones: ZONES };
  ['jour', 'semaine', 'mois'].forEach((pas) => verifierFlux('haccp', lire('haccp', donnees, '2026-10-01', '2026-10-31', pas)));
  const oct = releves.filter((r) => r.date.startsWith('2026-10'));
  const lu = lire('haccp', donnees, '2026-10-01', '2026-10-31', 'semaine');
  const anomalies = oct.filter((r) => !r.conforme).length;
  assert.equal(mesure('haccp.releves').valeur(lu.total), oct.length);
  assert.equal(mesure('haccp.anomalies').valeur(lu.total), anomalies);
  assert.equal(Math.round(mesure('haccp.conformite').valeur(lu.total) * 100), Math.round((oct.length - anomalies) / oct.length * 100));
  // Température : la zone choisie, sinon la première par nom ; la période
  // vaut le dernier relevé, jamais une somme.
  const temp = mesure('haccp.temperature');
  const sources = { points: { haccp: lu.points }, totaux: { haccp: lu.total } };
  const c1 = composer({ graphique: { mesures: [temp.id], choix: {} }, mesures: [temp], tranches: lu.tranches, sources, etats: { haccp: 'ready' }, familles: FAMILLES });
  assert.equal(c1.series[0].libelle, 'Chambre froide');
  assert.equal(c1.series[0].donnee, true);
  assert.deepEqual(c1.choix[0].options.map((o) => o.cle), ['z1', 'z2']);
  const dernier = oct.filter((r) => r.zoneId === 'z2').sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure)).pop();
  const c2 = composer({ graphique: { mesures: [temp.id], choix: { [temp.id]: 'z2' } }, mesures: [temp], tranches: lu.tranches, sources, etats: { haccp: 'ready' }, familles: FAMILLES });
  assert.equal(c2.series[0].libelle, 'Congélateur');
  assert.equal(c2.series[0].total, dernier.valeur);
  const c3 = composer({ graphique: { mesures: [temp.id], choix: { [temp.id]: 'zone-disparue' } }, mesures: [temp], tranches: lu.tranches, sources, etats: { haccp: 'ready' }, familles: FAMILLES });
  assert.equal(c3.choix[0].valeur, 'z1');
  const [vide] = lire('haccp', donnees, '2025-01-01', '2025-01-01', 'jour').points;
  assert.equal(mesure('haccp.releves').valeur(vide), null);
  assert.equal(mesure('haccp.conformite').valeur(vide), null);
});

// ── Inventaire ──
test("inventaire : stock de la Comptabilité, manques et surplus de l'écran des écarts, en cours exclu", () => {
  const inventaires = jeuInventaires();
  const valides = inventaires.filter((i) => i.statut === 'validé');
  ['jour', 'semaine', 'mois'].forEach((pas) => verifierFlux('inventaire', lire('inventaire', { inventaires }, '2026-01-01', '2026-11-30', pas), {
    'inventaire.manques': 1, 'inventaire.surplus': 1,
  }));
  const lu = lire('inventaire', { inventaires }, '2026-01-01', '2026-11-30', 'mois');
  const sommeLignes = (f) => valides.reduce((t, i) => t + i.lignes.reduce((u, l) => u + f(Number(l.ecartValeur) || 0), 0), 0);
  assert.equal(mesure('inventaire.manques').valeur(lu.total).toFixed(2), sommeLignes((v) => Math.min(0, v)).toFixed(2));
  assert.equal(mesure('inventaire.surplus').valeur(lu.total).toFixed(2), sommeLignes((v) => Math.max(0, v)).toFixed(2));
  assert.equal(mesure('inventaire.comptages').valeur(lu.total), valides.length);
  // Stock : la période vaut son dernier relevé, celui de la Comptabilité à la fin.
  const c = composer({ graphique: { mesures: ['inventaire.stock'] }, mesures: [mesure('inventaire.stock')], tranches: lu.tranches, sources: { points: { inventaire: lu.points }, totaux: { inventaire: lu.total } }, etats: { inventaire: 'ready' }, familles: FAMILLES });
  assert.equal(c.series[0].total, valeurStockConsolidee(valides.filter((i) => i.date <= '2026-11-30')));
});

// ── Achats : règlements ──
test("achats : factures réglées et délai de paiement, règle de l'écran des factures", () => {
  const docs = [];
  for (let i = 0; i < 1100; i += 1) {
    const d = new Date(Date.UTC(2026, 0, 1 + (i % 280))).toISOString().slice(0, 10);
    const r = i % 4 === 0 ? null : new Date(Date.UTC(2026, 0, 6 + (i % 280) + (i % 30))).toISOString().slice(0, 10);
    docs.push({ id: `a${i}`, typeDocument: 'facture', dateDocument: d, regleLe: r, totalTTC: i % 19 === 0 ? null : 80 + (i % 13) * 7.15, totalHT: 70, exclu: false, lignes: [] });
  }
  const donnees = { docs, catalogue: [] };
  ['jour', 'semaine', 'mois'].forEach((pas) => verifierFlux('achats', lire('achats', donnees, '2026-01-01', '2026-12-31', pas)));
  const lu = lire('achats', donnees, '2026-01-01', '2026-12-31', 'mois');
  const reglees = docs.filter((x) => x.regleLe && x.regleLe <= '2026-12-31');
  assert.equal(mesure('achats.reglees').valeur(lu.total).toFixed(2), totauxFactures(reglees, '2026-12-31').reglees.montant.toFixed(2));
  const jours = reglees.reduce((t, x) => t + Math.round((Date.parse(x.regleLe) - Date.parse(x.dateDocument)) / 86400000), 0);
  assert.equal(mesure('achats.delai').valeur(lu.total), jours / reglees.length);
});

// ── Groupes ──
test('groupes : groupes, convives et annulés font la liste du mois du calendrier', () => {
  const groupes = jeuGroupes();
  ['jour', 'semaine', 'mois'].forEach((pas) => verifierFlux('groupes', lire('groupes', { groupes }, '2026-01-01', '2026-12-31', pas)));
  const lu = lire('groupes', { groupes }, '2026-10-01', '2026-10-31', 'semaine');
  const duMois = groupes.filter((g) => g.dateEvenement.startsWith('2026-10-'));
  const actifs = duMois.filter((g) => !g.annule);
  assert.equal(mesure('groupes.groupes').valeur(lu.total), actifs.length);
  assert.equal(mesure('groupes.convives').valeur(lu.total), actifs.reduce((s, g) => s + g.nbPax, 0));
  assert.equal(mesure('groupes.annules').valeur(lu.total), duMois.length - actifs.length);
});

// ── Caisse : sorties de S1 ──
test('caisse : ventes, annulations, abandons, par personne et par produit, ceux des Rapports', () => {
  const donnees = jeuEssai();
  const lu = lire('caisse', donnees, J1, J2, 'jour');
  verifierFlux('caisse', lu);
  const r = rapportCaisse(donnees, { type: 'libre', debut: J1, fin: J2 });
  const v = (id) => mesure(id).valeur(lu.total);
  assert.equal(v('caisse.ventes'), r.synthese.ventesTtc);
  assert.equal(v('caisse.annulations_ttc'), r.synthese.annulationsTtc);
  assert.equal(v('caisse.abandons'), r.journal.abandons.nombre);
  assert.equal(v('caisse.abandons_ttc'), r.journal.abandons.montant);
  const somme = (parts) => parts.reduce((t, x) => t + Math.round(x.valeur * 100), 0) / 100;
  const ventilation = (id, vid) => mesure(id).ventilations.find((x) => x.id === vid).parts(lu.total);
  assert.equal(somme(ventilation('caisse.ventes', 'personne')), r.synthese.ventesTtc);
  assert.equal(somme(ventilation('caisse.remises', 'personne')), r.journal.remises.montant);
  assert.equal(somme(ventilation('caisse.offerts', 'personne')), r.journal.offerts.montant);
  assert.equal(somme(ventilation('caisse.plats_ttc', 'produit')), r.plats.ttc);
  // Les moins vendus : l'ordre de la ventilation, du plus petit au plus grand.
  const plats = mesure('caisse.plats_qte');
  const c = composer({ graphique: { mesures: [plats.id], ventilation: 'produit_moins' }, mesures: [plats], tranches: lu.tranches, sources: { points: { caisse: lu.points }, totaux: { caisse: lu.total } }, etats: { caisse: 'ready' }, familles: FAMILLES });
  const totaux = c.series.filter((x) => x.libelle !== 'Autres').map((x) => x.total);
  assert.deepEqual(totaux, [...totaux].sort((a, b) => a - b));
  assert.equal(c.series[0].libelle, r.plats.lignes.filter((l) => l.qte > 0).slice(-1)[0].libelle);
});

// ── Réservations : blocs ajoutés en S2 ──
function jeuResas() {
  const out = [];
  for (let i = 0; i < 1300; i += 1) {
    const d = new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString().slice(0, 10);
    out.push({
      id: `r${i}`, date_service: d, service: i % 3 ? 'soir' : 'midi', heure_arrivee: `${11 + (i % 10)}:${i % 2 ? '00' : '30'}`, nb_couverts: 1 + (i % 9),
      statut: ['parti', 'parti', 'no_show', 'annule', 'confirme', 'demande'][i % 6], origine: ['equipe', 'en_ligne', 'passage'][i % 3],
      client_id: i % 4 ? `c${i % 70}` : null, est_groupe: i % 13 === 0, passeport_gourmand: i % 17 === 0, nom: 'x',
      created_at: new Date(Date.UTC(2026, 0, 1 + (i % 300) - (i % 20))).toISOString(),
      reservation_tables: i % 5 ? [{ table_id: i % 2 ? 't1' : 't2' }] : [],
      reservation_tags: i % 7 === 0 ? [{ type_tag: 'occasion', valeur: 'anniversaire' }] : [],
    });
  }
  return out;
}

test('réservations : demandes, délais, groupes, placement, clientèle, tags et ventilations, ceux du rapport', () => {
  const lignes = jeuResas();
  const tables = [{ id: 't1', nom: 'T1', zone: 'Salle', nb_places: 4 }, { id: 't2', nom: 'T2', zone: 'Terrasse', nb_places: 6 }];
  const donnees = { lignes, parametres: null, tables };
  ['jour', 'semaine', 'mois'].forEach((pas) => verifierFlux('reservations', lire('reservations', donnees, '2026-01-01', '2026-10-31', pas)));
  const lu = lire('reservations', donnees, '2026-01-01', '2026-10-31', 'mois');
  const periode = { debut: '2026-01-01', fin: '2026-10-31' };
  const r = computeReservationStats({ lignes, periode, comparaison: periode, aujourdhui: AUJ, reference: AUJ, tables });
  const v = (id, cle) => mesure(id).valeur(lu.total, cle);
  assert.equal(v('reservations.demandes_recues'), r.canaux.demandes.recues);
  assert.equal(v('reservations.demandes_acceptees'), r.canaux.demandes.acceptees);
  assert.equal(v('reservations.demandes_annulees'), r.canaux.demandes.annulees);
  assert.equal(v('reservations.anticipees'), r.anticipation.global.tables);
  assert.equal(v('reservations.delai_moyen'), r.anticipation.global.moyenne);
  assert.equal(v('reservations.delai_median'), r.anticipation.global.mediane);
  assert.equal(v('reservations.groupes'), r.composition.groupes.tables);
  assert.equal(v('reservations.placement'), r.composition.placement.taux);
  assert.equal(v('reservations.avec_fiche'), r.clientele.partAvecFiche);
  assert.equal(v('reservations.clients_uniques'), r.clientele.clientsUniques);
  assert.equal(v('reservations.clients_revenus'), r.clientele.clientsRevenus);
  assert.equal(v('reservations.taux_retour'), r.clientele.tauxRetour);
  assert.equal(v('reservations.passeport'), r.clientele.passeport.tables);
  assert.equal(v('reservations.taguees', 'occasion'), r.clientele.tags.find((t) => t.id === 'occasion').tables);
  // Chaque ventilation des couverts refait les couverts ; le délai refait les réservations au délai connu.
  const somme = (parts) => parts.reduce((t, x) => t + (x.valeur || 0), 0);
  const couverts = mesure('reservations.couverts');
  couverts.ventilations.forEach((x) => assert.ok(Math.abs(somme(x.parts(lu.total)) - r.chiffres.couverts) < 1e-9, x.id));
  assert.ok(couverts.ventilations.every((x) => x.parts(lu.total).length), 'salle à zones et tables : chaque ventilation a ses catégories');
  assert.equal(somme(mesure('reservations.anticipees').ventilations[0].parts(lu.total)), r.anticipation.global.tables);
  // Par jour de la semaine : la moyenne du rapport, en courbes, sans « Autres ».
  const jo = mesure('reservations.couverts_jour_ouverture');
  const sources = { points: { reservations: lu.points }, totaux: { reservations: lu.total } };
  const c = composer({ graphique: { mesures: [jo.id], ventilation: 'semaine_debut' }, mesures: [jo], tranches: lu.tranches, sources, etats: { reservations: 'ready' }, familles: FAMILLES });
  assert.deepEqual(c.types, ['courbe', 'barres']);
  assert.deepEqual(c.series.map((x) => x.libelle), ['Lundi', 'Mardi', 'Mercredi', 'Jeudi']);
  assert.equal(c.nonTracees, 0);
  assert.equal(c.series[0].total, r.temporalite.parJourSemaine[0].couverts);
  const f = composer({ graphique: { mesures: [jo.id], ventilation: 'semaine_fin' }, mesures: [jo], tranches: lu.tranches, sources, etats: { reservations: 'ready' }, familles: FAMILLES });
  assert.deepEqual(f.series.map((x) => x.libelle), ['Vendredi', 'Samedi', 'Dimanche']);
  assert.equal(f.series[2].total, r.temporalite.parJourSemaine[6].couverts);
  // Un taux ventilé sur plus de six catégories : six tracées, aucune « Autres ».
  const sept = { ...jo, ventilations: [{ id: 'tous', libelle: 'x', parts: (p) => (p.parJourSemaine || []).map((j) => ({ cle: String(j.iso), libelle: String(j.iso), valeur: j.couverts, poids: j.nbJours })) }] };
  const t = composer({ graphique: { mesures: [jo.id], ventilation: 'tous' }, mesures: [sept], tranches: lu.tranches, sources, etats: { reservations: 'ready' }, familles: FAMILLES });
  assert.equal(t.series.length, 6);
  assert.equal(t.nonTracees, 1);
  assert.ok(!t.series.some((x) => x.libelle === 'Autres'));
});

// ── Journal, SOP, écran de cuisine, mise en place ──
test('journal, sop, cuisine et mise en place : chaque flux fait son total, les taux se recalculent', () => {
  const jours = (n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString().slice(0, 10));
  const lignes = jours(1500).map((d, i) => ({ id: `j${i}`, created_at: `${d}T10:00:00Z`, module: ['recettes', 'pertes', 'caisse'][i % 3], operation: ['INSERT', 'UPDATE'][i % 2] }));
  const executions = jours(1200).map((d, i) => ({ dateExecution: d, statut: ['terminee', 'abandonnee', 'en_cours'][i % 3], totalEtapes: 6, etapesCochees: i % 7 }));
  const orders = jours(1100).map((d, i) => ({ openedAt: `${d}T11:00:00Z`, completedAt: i % 9 ? `${d}T11:${String(10 + (i % 40)).padStart(2, '0')}:00Z` : null }));
  const listes = jours(1100).map((d, i) => ({ dateService: d, items: [{ fait: true }, { fait: i % 2 === 0 }, { fait: false }] }));
  const cas = [['journal', { lignes }], ['sop', { executions }], ['kds', { orders }], ['mep', { listes }]];
  cas.forEach(([id, donnees]) => ['jour', 'semaine', 'mois'].forEach((pas) => verifierFlux(id, lire(id, donnees, '2026-01-01', '2026-12-31', pas))));
  const t = (id, donnees) => lire(id, donnees, '2026-01-01', '2026-12-31', 'mois').total;
  assert.equal(mesure('journal.entrees').valeur(t('journal', { lignes })), 1500);
  assert.equal(mesure('sop.terminees').valeur(t('sop', { executions })), executions.filter((e) => e.statut === 'terminee').length);
  const etapes = executions.reduce((x, e) => x + e.etapesCochees, 0) / executions.reduce((x, e) => x + e.totalEtapes, 0);
  assert.equal(mesure('sop.etapes').valeur(t('sop', { executions })), etapes);
  assert.equal(mesure('kds.terminees').valeur(t('kds', { orders })), orders.filter((o) => o.completedAt).length);
  const finies = orders.filter((o) => o.completedAt);
  const duree = finies.reduce((x, o) => x + (Date.parse(o.completedAt) - Date.parse(o.openedAt)) / 60000, 0) / finies.length;
  assert.ok(Math.abs(mesure('kds.duree').valeur(t('kds', { orders })) - duree) < 1e-9);
  const items = listes.flatMap((l) => l.items);
  assert.equal(mesure('mep.taux').valeur(t('mep', { listes })), items.filter((i) => i.fait).length / items.length);
});

// ── Spa ──
test("spa : soins, minutes, annulés et bons font l'agenda, par praticien", () => {
  const reservations = Array.from({ length: 1200 }, (_, i) => ({ dateRdv: new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString().slice(0, 10), dureeMin: [30, 60, 90][i % 3], praticien: i % 4 ? 'Léa' : '', statut: ['prevue', 'annulee', 'terminee', 'absent'][i % 4] }));
  const bons = Array.from({ length: 200 }, (_, i) => ({ createdAt: new Date(Date.UTC(2026, 0, 1 + i, 10)).toISOString() }));
  ['jour', 'semaine', 'mois'].forEach((pas) => verifierFlux('spa', lire('spa', { reservations, bons }, '2026-01-01', '2026-12-31', pas)));
  const lu = lire('spa', { reservations, bons }, '2026-01-01', '2026-12-31', 'mois');
  const actifs = reservations.filter((r) => !['annulee', 'absent'].includes(r.statut));
  assert.equal(mesure('spa.soins').valeur(lu.total), actifs.length);
  assert.equal(mesure('spa.minutes').valeur(lu.total), actifs.reduce((x, r) => x + r.dureeMin, 0));
  assert.equal(mesure('spa.bons').valeur(lu.total), 200);
  const parts = mesure('spa.soins').ventilations[0].parts(lu.total);
  assert.equal(parts.reduce((x, y) => x + y.valeur, 0), actifs.length);
  assert.equal(parts.find((x) => x.cle === 'À attribuer').donnee, false);
});

test('catalogue S2 : nombre de mesures par famille', () => {
  const compte = (id) => mesuresDe(id).length;
  assert.equal(compte('pertes'), 2);
  assert.equal(compte('planning'), 6);
  assert.equal(compte('haccp'), 4);
  assert.equal(compte('inventaire'), 4);
  assert.equal(compte('groupes'), 3);
  assert.equal(compte('journal'), 1);
  assert.equal(compte('sop'), 4);
  assert.equal(compte('kds'), 2);
  assert.equal(compte('mep'), 3);
  assert.equal(compte('spa'), 4);
});
