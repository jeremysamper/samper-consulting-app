import test from 'node:test';
import assert from 'node:assert/strict';
import { lireReglePourboires, refusReglePourboires, repartirPourboires, versConfigPourboires } from './pourboires.js';

const SALLE = 'g-salle';
const CUISINE = 'g-cuisine';
const SPA = 'g-spa';
const GROUPES = [{ id: SALLE, nom: 'Salle' }, { id: CUISINE, nom: 'Cuisine' }, { id: SPA, nom: 'Spa' }];
const somme = (lignes) => Math.round(lignes.reduce((s, l) => s + l.montant * 100, 0)) / 100;
const exact = (p) => assert.equal(Math.round((p.reparti + p.nonReparti) * 100), Math.round(p.total * 100));

test('1. sans règle : sans_regle, aucune ligne', () => {
  const p = repartirPourboires({ total: 50, regle: null, personnes: [{ id: 'a', nom: 'A', groupeId: SALLE, heures: 8 }], groupes: GROUPES });
  assert.equal(p.etat, 'sans_regle');
  assert.deepEqual(p.lignes, []);
  assert.equal(p.reparti, 0);
  exact(p);
});

test('2. parts égales : 100.00 entre trois personnes, 33.34 33.33 33.33', () => {
  const regle = lireReglePourboires({ mode: 'egales', groupes: [{ id: SALLE }] });
  const p = repartirPourboires({
    total: 100,
    regle,
    personnes: [
      { id: 'c', nom: 'Chloé', groupeId: SALLE, heures: 2 },
      { id: 'a', nom: 'Alice', groupeId: SALLE, heures: 9 },
      { id: 'b', nom: 'Bruno', groupeId: SALLE, heures: 4 },
    ],
    groupes: GROUPES,
  });
  assert.equal(p.etat, 'ok');
  assert.deepEqual(p.lignes.map((l) => l.montant), [33.34, 33.33, 33.33]);
  // Le centime de reste va au plus grand nombre d'heures.
  assert.equal(p.lignes[0].id, 'a');
  assert.equal(somme(p.lignes), 100);
  exact(p);
});

test('3. selon les heures : 250.05 pour 12 h, 8 h et 5 h 30', () => {
  // 25005 centimes, poids 720, 480 et 330 minutes (1530) :
  //   720 : 11767,05 -> 11767, reste 90
  //   480 :  7844,70 ->  7844, reste 1080 -> +1 = 7845
  //   330 :  5393,23 ->  5393, reste 360
  const regle = lireReglePourboires({ mode: 'heures', groupes: [{ id: SALLE }, { id: CUISINE }] });
  const p = repartirPourboires({
    total: 250.05,
    regle,
    personnes: [
      { id: 'a', nom: 'Alice', groupeId: SALLE, heures: 12 },
      { id: 'b', nom: 'Bruno', groupeId: CUISINE, heures: 8 },
      { id: 'c', nom: 'Chloé', groupeId: SALLE, heures: 5.5 },
    ],
    groupes: GROUPES,
  });
  assert.deepEqual(p.lignes.map((l) => [l.id, l.montant]), [['a', 117.67], ['b', 78.45], ['c', 53.93]]);
  assert.equal(somme(p.lignes), 250.05);
  assert.equal(p.nonReparti, 0);
  exact(p);
});

test('4. par groupe 70 et 30 : deux personnes en Salle, une en Cuisine', () => {
  const regle = lireReglePourboires({ mode: 'cle', groupes: [{ id: SALLE, part: 70 }, { id: CUISINE, part: 30 }] });
  const p = repartirPourboires({
    total: 100,
    regle,
    personnes: [
      { id: 'a', nom: 'Alice', groupeId: SALLE, heures: 6 },
      { id: 'b', nom: 'Bruno', groupeId: SALLE, heures: 4 },
      { id: 'c', nom: 'Chloé', groupeId: CUISINE, heures: 5 },
    ],
    groupes: GROUPES,
  });
  assert.deepEqual(p.groupes.map((g) => [g.id, g.part, g.montant]), [[SALLE, 70, 70], [CUISINE, 30, 30]]);
  assert.deepEqual(p.lignes.map((l) => [l.id, l.montant]), [['a', 42], ['c', 30], ['b', 28]]);
  assert.equal(somme(p.lignes), 100);
  exact(p);
});

test('5. par groupe, un groupe sans heure : sa part reste non répartie', () => {
  const regle = lireReglePourboires({ mode: 'cle', groupes: [{ id: SALLE, part: 70 }, { id: CUISINE, part: 30 }] });
  const p = repartirPourboires({
    total: 80.15,
    regle,
    personnes: [{ id: 'a', nom: 'Alice', groupeId: SALLE, heures: 6 }],
    groupes: GROUPES,
  });
  assert.equal(p.etat, 'ok');
  // 8015 centimes : 70 % = 5610,5 -> 5610, 30 % = 2404,5 -> 2404, le centime
  // restant au groupe qui a des heures (égalité de restes).
  assert.equal(p.reparti, 56.11);
  assert.equal(p.nonReparti, 24.04);
  exact(p);
});

test('6. par groupe dont un groupe a disparu (parts restantes à 70) : regle_a_revoir', () => {
  const regle = lireReglePourboires({ mode: 'cle', groupes: [{ id: SALLE, part: 70 }, { id: 'g-supprime', part: 30 }] });
  const p = repartirPourboires({
    total: 100, regle, personnes: [{ id: 'a', nom: 'Alice', groupeId: SALLE, heures: 6 }], groupes: GROUPES,
  });
  assert.equal(p.etat, 'regle_a_revoir');
  assert.deepEqual(p.lignes, []);
  // Une règle d'une autre maison, dont aucun groupe n'existe ici.
  const etrangere = lireReglePourboires({ mode: 'heures', groupes: [{ id: 'autre-1' }, { id: 'autre-2' }] });
  assert.equal(repartirPourboires({ total: 10, regle: etrangere, personnes: [], groupes: GROUPES }).etat, 'regle_a_revoir');
});

test('7. personne sans groupe : hors partage, sans montant', () => {
  const regle = lireReglePourboires({ mode: 'heures', groupes: [{ id: SALLE }] });
  const p = repartirPourboires({
    total: 40,
    regle,
    personnes: [
      { id: 'a', nom: 'Alice', groupeId: SALLE, heures: 6 },
      { id: 'z', nom: 'Zoé', groupeId: null, heures: 3 },
      { id: 's', nom: 'Maya', groupeId: SPA, heures: 7 },
    ],
    groupes: GROUPES,
  });
  assert.deepEqual(p.horsPartage, [{ id: 's', nom: 'Maya', heures: 7 }, { id: 'z', nom: 'Zoé', heures: 3 }]);
  assert.ok(p.horsPartage.every((h) => !('montant' in h)));
  assert.deepEqual(p.lignes.map((l) => l.id), ['a']);
  assert.equal(p.lignes[0].montant, 40);
});

test('8. total à 0 : ok, tous les montants à 0', () => {
  const regle = lireReglePourboires({ mode: 'cle', groupes: [{ id: SALLE, part: 50 }, { id: CUISINE, part: 50 }] });
  const p = repartirPourboires({
    total: 0,
    regle,
    personnes: [{ id: 'a', nom: 'Alice', groupeId: SALLE, heures: 6 }, { id: 'c', nom: 'Chloé', groupeId: CUISINE, heures: 5 }],
    groupes: GROUPES,
  });
  assert.equal(p.etat, 'ok');
  assert.ok(p.lignes.every((l) => l.montant === 0 && Number.isFinite(l.montant)));
  assert.equal(p.reparti, 0);
  assert.equal(p.nonReparti, 0);
});

test('9. égalité de restes : heures, puis nom, puis identifiant ; même résultat à chaque appel', () => {
  const regle = lireReglePourboires({ mode: 'egales', groupes: [{ id: SALLE }] });
  const args = {
    total: 0.02,
    regle,
    personnes: [
      { id: 'p3', nom: 'Bruno', groupeId: SALLE, heures: 5 },
      { id: 'p2', nom: 'Alice', groupeId: SALLE, heures: 5 },
      { id: 'p1', nom: 'Chloé', groupeId: SALLE, heures: 5 },
    ],
    groupes: GROUPES,
  };
  const p = repartirPourboires(args);
  assert.deepEqual(p.lignes.map((l) => [l.nom, l.montant]), [['Alice', 0.01], ['Bruno', 0.01], ['Chloé', 0]]);
  assert.deepEqual(repartirPourboires({ ...args, personnes: [...args.personnes].reverse() }), p);
  // À heures différentes, le centime va au plus grand nombre d'heures.
  const q = repartirPourboires({ ...args, total: 0.01, personnes: [...args.personnes.slice(0, 2), { ...args.personnes[2], heures: 6 }] });
  assert.equal(q.lignes[0].nom, 'Chloé');
  assert.equal(q.lignes[0].montant, 0.01);
  // Même nom, même heures : l'identifiant tranche.
  const r = repartirPourboires({ ...args, total: 0.01, personnes: [{ id: 'b', nom: 'Sam', groupeId: SALLE, heures: 2 }, { id: 'a', nom: 'Sam', groupeId: SALLE, heures: 2 }] });
  assert.equal(r.lignes[0].id, 'a');
});

test('10. un identifiant en double ne reçoit qu\'une part, heures sommées', () => {
  const regle = lireReglePourboires({ mode: 'egales', groupes: [{ id: SALLE }] });
  const p = repartirPourboires({
    total: 30,
    regle,
    personnes: [
      { id: 'a', nom: 'Alice', groupeId: SALLE, heures: 4 },
      { id: 'a', nom: 'Alice', groupeId: SALLE, heures: 3 },
      { id: 'b', nom: 'Bruno', groupeId: SALLE, heures: 2 },
    ],
    groupes: GROUPES,
  });
  assert.equal(p.lignes.length, 2);
  assert.deepEqual(p.lignes.map((l) => [l.id, l.heures, l.montant]), [['a', 7, 15], ['b', 2, 15]]);
});

test('11. lireReglePourboires : jamais une exception, jamais une règle inventée', () => {
  assert.equal(lireReglePourboires(undefined), null);
  assert.equal(lireReglePourboires(null), null);
  assert.equal(lireReglePourboires([]), null);
  assert.equal(lireReglePourboires('cle'), null);
  assert.equal(lireReglePourboires({ mode: 'inconnu', groupes: [{ id: SALLE }] }), null);
  assert.equal(lireReglePourboires({ mode: 'heures' }), null);
  assert.equal(lireReglePourboires({ mode: 'heures', groupes: [] }), null);
  assert.equal(lireReglePourboires({ mode: 'heures', groupes: [null, 3, { id: '' }] }), null);
  assert.deepEqual(
    lireReglePourboires({ mode: 'cle', groupes: [{ id: SALLE, part: 150 }, { id: CUISINE, part: -4 }, { id: SPA, part: 'x' }, { id: SALLE, part: 10 }] }),
    { mode: 'cle', groupes: [{ id: SALLE, part: 100 }, { id: CUISINE, part: 0 }, { id: SPA, part: 0 }] },
  );
  assert.deepEqual(lireReglePourboires({ mode: 'egales', groupes: [{ id: SALLE, part: 40 }] }), { mode: 'egales', groupes: [{ id: SALLE, part: null }] });
});

test('aucune heure pointée : sans_heures, personne en montant', () => {
  const regle = lireReglePourboires({ mode: 'heures', groupes: [{ id: SALLE }] });
  const p = repartirPourboires({ total: 20, regle, personnes: [], groupes: GROUPES });
  assert.equal(p.etat, 'sans_heures');
  assert.deepEqual(p.lignes, []);
  exact(p);
});

test('refus et forme écrite d\'une règle', () => {
  assert.equal(refusReglePourboires({ mode: 'heures', groupes: [] }), 'Cochez au moins un groupe.');
  assert.equal(refusReglePourboires({ mode: 'cle', groupes: [{ id: SALLE, part: 60 }, { id: CUISINE, part: 30 }] }), 'Les parts des groupes doivent faire 100 %.');
  assert.equal(refusReglePourboires({ mode: 'cle', groupes: [{ id: SALLE, part: 70 }, { id: CUISINE, part: 30 }] }), null);
  assert.deepEqual(versConfigPourboires({ mode: 'heures', groupes: [{ id: SALLE, part: 70 }] }), { mode: 'heures', groupes: [{ id: SALLE }] });
  assert.equal(versConfigPourboires({ mode: 'x' }), null);
});
