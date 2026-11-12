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

test('catalogue S2 : nombre de mesures par famille', () => {
  const compte = (id) => mesuresDe(id).length;
  assert.equal(compte('pertes'), 2);
});
