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

test('catalogue S2 : nombre de mesures par famille', () => {
  const compte = (id) => mesuresDe(id).length;
  assert.equal(compte('pertes'), 2);
  assert.equal(compte('planning'), 6);
  assert.equal(compte('haccp'), 4);
  assert.equal(compte('inventaire'), 4);
});
