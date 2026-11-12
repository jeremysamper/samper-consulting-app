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

test('catalogue S2 : nombre de mesures par famille', () => {
  const compte = (id) => mesuresDe(id).length;
  assert.equal(compte('pertes'), 2);
  assert.equal(compte('planning'), 6);
});
