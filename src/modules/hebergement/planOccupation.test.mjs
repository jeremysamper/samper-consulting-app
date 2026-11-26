import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NB_NUITS, PAS, libresParNuit, lignesDuPlan, nuitsDuPlan, sansChambre, sejourVisible } from './planOccupation.js';

const ch = (id, extra = {}) => ({ id, numero: id, actif: true, statutMenage: 'propre', ...extra });
const sj = (id, chambreId, arrivee, depart, statut = 'prevu', nomHote = `Hôte ${id}`) => ({ id, chambreId, arrivee, depart, statut, nomHote });
const somme = (ligne) => ligne.cellules.reduce((t, c) => t + (c.type === 'libre' ? 1 : c.largeur), 0);
const barres = (ligne) => ligne.cellules.filter((c) => c.type === 'sejour');
// Case de la nuit d'indice i.
const caseDe = (ligne, i) => {
  let k = 0;
  for (const c of ligne.cellules) {
    const l = c.type === 'libre' ? 1 : c.largeur;
    if (i < k + l) return c;
    k += l;
  }
  return null;
};

test('constantes', () => {
  assert.equal(NB_NUITS, 14);
  assert.equal(PAS, 7);
});

test('nuitsDuPlan passe l\'année sans trou', () => {
  const n = nuitsDuPlan('2026-12-28', 14);
  assert.equal(n.length, 14);
  assert.equal(n[0], '2026-12-28');
  assert.equal(n[3], '2026-12-31');
  assert.equal(n[4], '2027-01-01');
  assert.equal(n[13], '2027-01-10');
  assert.equal(nuitsDuPlan('2026-12-01').length, NB_NUITS);
});

test('sejourVisible', () => {
  assert.equal(sejourVisible(sj('a', 'c', '2026-12-01', '2026-12-03', 'prevu'), '2026-12-05'), true);
  assert.equal(sejourVisible(sj('a', 'c', '2026-12-01', '2026-12-03', 'en_maison'), '2026-12-05'), true);
  assert.equal(sejourVisible(sj('a', 'c', '2026-12-01', '2026-12-03', 'parti'), '2026-12-05'), true);
  assert.equal(sejourVisible(sj('a', 'c', '2026-12-05', '2026-12-07', 'parti'), '2026-12-05'), false);
  assert.equal(sejourVisible(sj('a', 'c', '2026-12-01', '2026-12-03', 'annule'), '2026-12-02'), false);
  assert.equal(sejourVisible(sj('a', 'c', '2026-12-01', '2026-12-03', 'no_show'), '2026-12-02'), false);
});

test('un séjour du 3 au 5 occupe deux colonnes, la nuit du 5 est libre', () => {
  const [l] = lignesDuPlan({ chambres: [ch('c1')], sejours: [sj('s', 'c1', '2026-12-03', '2026-12-05')], debut: '2026-12-01', n: 7, aujourdhui: '2026-12-01' });
  assert.equal(caseDe(l, 2).type, 'sejour');
  assert.equal(caseDe(l, 2).largeur, 2);
  assert.equal(caseDe(l, 4).type, 'libre');
  assert.equal(caseDe(l, 4).nuit, '2026-12-05');
  assert.equal(somme(l), 7);
});

test('départ le 5 et arrivée le 5 : deux barres qui se suivent', () => {
  const [l] = lignesDuPlan({
    chambres: [ch('c1')],
    sejours: [sj('a', 'c1', '2026-12-03', '2026-12-05'), sj('b', 'c1', '2026-12-05', '2026-12-07')],
    debut: '2026-12-01', n: 7, aujourdhui: '2026-12-01',
  });
  const types = l.cellules.map((c) => (c.type === 'libre' ? 'L' : `${c.sejour.id}${c.largeur}`));
  assert.deepEqual(types, ['L', 'L', 'a2', 'b2', 'L']);
  assert.equal(somme(l), 7);
});

test('coupeAvant, coupeApres et somme des largeurs', () => {
  const [l] = lignesDuPlan({
    chambres: [ch('c1')],
    sejours: [sj('avant', 'c1', '2026-11-28', '2026-12-03'), sj('apres', 'c1', '2026-12-10', '2026-12-30')],
    debut: '2026-12-01', n: 14, aujourdhui: '2026-12-01',
  });
  const [b1, b2] = barres(l);
  assert.equal(b1.coupeAvant, true);
  assert.equal(b1.coupeApres, false);
  assert.equal(b1.largeur, 2);
  assert.equal(b2.coupeAvant, false);
  assert.equal(b2.coupeApres, true);
  assert.equal(b2.largeur, 5);
  assert.equal(somme(l), 14);
  // Séjour qui finit pile à la fin de la fenêtre : pas coupé après.
  const [l2] = lignesDuPlan({ chambres: [ch('c1')], sejours: [sj('x', 'c1', '2026-12-10', '2026-12-15')], debut: '2026-12-01', n: 14, aujourdhui: '2026-12-01' });
  assert.equal(barres(l2)[0].coupeApres, false);
});

test('annulé et no-show sans barre ; parti borné à la veille d\'aujourd\'hui', () => {
  const sejours = [
    sj('an', 'c1', '2026-12-02', '2026-12-04', 'annule'),
    sj('ns', 'c2', '2026-12-02', '2026-12-04', 'no_show'),
    sj('pa', 'c3', '2026-12-02', '2026-12-08', 'parti'),
  ];
  const chambres = [ch('c1'), ch('c2'), ch('c3')];
  const lignes = lignesDuPlan({ chambres, sejours, debut: '2026-12-01', n: 7, aujourdhui: '2026-12-05' });
  assert.equal(barres(lignes[0]).length, 0);
  assert.equal(barres(lignes[1]).length, 0);
  const [b] = barres(lignes[2]);
  assert.equal(b.largeur, 3); // nuits du 2, 3 et 4
  assert.equal(caseDe(lignes[2], 4).type, 'libre'); // nuit du 5 = aujourd'hui
  // Fenêtre qui commence aujourd'hui : aucune barre pour le parti.
  const l = lignesDuPlan({ chambres, sejours, debut: '2026-12-05', n: 7, aujourdhui: '2026-12-05' });
  assert.equal(barres(l[2]).length, 0);
});

test('chambre inactive : ligne seulement si elle porte un séjour visible', () => {
  const chambres = [ch('c1'), ch('vide', { actif: false }), ch('pleine', { actif: false })];
  const sejours = [sj('s', 'pleine', '2026-12-02', '2026-12-03'), sj('x', 'vide', '2026-12-02', '2026-12-03', 'annule')];
  const lignes = lignesDuPlan({ chambres, sejours, debut: '2026-12-01', n: 7, aujourdhui: '2026-12-01' });
  assert.deepEqual(lignes.map((l) => l.chambre.id), ['c1', 'pleine']);
  // Et elle ne compte pas dans les libres.
  assert.deepEqual(libresParNuit({ chambres, sejours, debut: '2026-12-01', n: 2, aujourdhui: '2026-12-01' }), [1, 1]);
});

test('chambre hors service : horsService, barre gardée, jamais comptée libre', () => {
  const chambres = [ch('c1'), ch('hs', { statutMenage: 'hors_service' })];
  const sejours = [sj('s', 'hs', '2026-12-04', '2026-12-07')];
  const lignes = lignesDuPlan({ chambres, sejours, debut: '2026-12-01', n: 7, aujourdhui: '2026-12-01' });
  assert.equal(lignes[1].horsService, true);
  assert.equal(lignes[0].horsService, false);
  assert.equal(barres(lignes[1]).length, 1);
  assert.equal(barres(lignes[1])[0].largeur, 3);
  assert.deepEqual(libresParNuit({ chambres, sejours, debut: '2026-12-01', n: 7, aujourdhui: '2026-12-01' }), [1, 1, 1, 1, 1, 1, 1]);
});

test('libresParNuit : cas du brief et accord avec la grille', () => {
  const chambres = [ch('a'), ch('b'), ch('hs', { statutMenage: 'hors_service' })];
  const sejours = [sj('s', 'a', '2026-12-01', '2026-12-02')];
  assert.deepEqual(libresParNuit({ chambres, sejours, debut: '2026-12-01', n: 2, aujourdhui: '2026-12-01' }), [1, 2]);

  // Nuit passée : la chambre qui porte un parti n'est pas libre.
  const passe = [sj('p', 'a', '2026-11-28', '2026-12-03', 'parti')];
  const libres = libresParNuit({ chambres, sejours: passe, debut: '2026-11-29', n: 6, aujourdhui: '2026-12-02' });
  assert.deepEqual(libres, [1, 1, 1, 2, 2, 2]);

  // Pour toute nuit, le nombre égale les cases libres des lignes actives hors service exclues.
  const gros = [ch('1'), ch('2'), ch('3', { statutMenage: 'hors_service' }), ch('4', { actif: false })];
  const ss = [
    sj('x', '1', '2026-11-30', '2026-12-04', 'en_maison'), sj('y', '2', '2026-12-03', '2026-12-09'),
    sj('z', '4', '2026-12-02', '2026-12-05'), sj('w', '3', '2026-12-06', '2026-12-08'),
    sj('v', '2', '2026-11-25', '2026-12-02', 'parti'),
  ];
  const args = { chambres: gros, sejours: ss, debut: '2026-11-29', n: 14, aujourdhui: '2026-12-01' };
  const lignes = lignesDuPlan(args);
  const attendu = Array.from({ length: 14 }, (_, i) => lignes
    .filter((l) => l.chambre.actif && !l.horsService)
    .filter((l) => caseDe(l, i).type === 'libre').length);
  assert.deepEqual(libresParNuit(args), attendu);
});

test('en maison dont le départ est aujourd\'hui : pas de barre ce soir', () => {
  const [l] = lignesDuPlan({ chambres: [ch('c1')], sejours: [sj('s', 'c1', '2026-11-28', '2026-12-05', 'en_maison')], debut: '2026-12-05', n: 7, aujourdhui: '2026-12-05' });
  assert.equal(barres(l).length, 0);
  assert.equal(caseDe(l, 0).type, 'libre');
});

test('deux séjours qui se chevauchent : aucune exception, le premier arrivé garde la nuit', () => {
  const sejours = [sj('tard', 'c1', '2026-12-03', '2026-12-06'), sj('tot', 'c1', '2026-12-02', '2026-12-05'), sj('dedans', 'c1', '2026-12-03', '2026-12-04')];
  const [l] = lignesDuPlan({ chambres: [ch('c1')], sejours, debut: '2026-12-01', n: 7, aujourdhui: '2026-12-01' });
  assert.equal(somme(l), 7);
  const types = l.cellules.map((c) => (c.type === 'libre' ? 'L' : `${c.sejour.id}${c.largeur}`));
  assert.deepEqual(types, ['L', 'tot3', 'tard1', 'L', 'L']);
});

test('sansChambre : sans chambre ou chambre inconnue, dans la fenêtre, par arrivée', () => {
  const chambres = [ch('c1')];
  const sejours = [
    sj('b', null, '2026-12-05', '2026-12-06', 'prevu', 'Berger'),
    sj('a', null, '2026-12-05', '2026-12-07', 'prevu', 'Amsler'),
    sj('t', null, '2026-12-01', '2026-12-04', 'en_maison', 'Tôt'),
    sj('apres', null, '2026-12-20', '2026-12-22', 'prevu'),
    sj('inconnue', 'zz', '2026-12-03', '2026-12-04', 'prevu', 'Inconnue'),
    sj('annule', null, '2026-12-03', '2026-12-04', 'annule'),
    sj('rangee', 'c1', '2026-12-03', '2026-12-04', 'prevu'),
  ];
  const r = sansChambre({ chambres, sejours, debut: '2026-12-02', n: 7 });
  assert.deepEqual(r.map((s) => s.id), ['t', 'inconnue', 'a', 'b']);
});

test('une case d\'avant aujourd\'hui est passée', () => {
  const [l] = lignesDuPlan({ chambres: [ch('c1')], sejours: [], debut: '2026-12-01', n: 7, aujourdhui: '2026-12-03' });
  assert.deepEqual(l.cellules.map((c) => c.passee), [true, true, false, false, false, false, false]);
  assert.equal(l.cellules.length, 7);
});
