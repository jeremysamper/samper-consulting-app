// node --test : formules à prix fixe de la caisse (lot 09 du panel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocsQuittance, choixInitiaux, corpsFormule, erreurFormule, formulesProposees, lireFormule, repartirFormule } from './formules.js';

test('répartition au prorata des prix de carte', () => {
  assert.deepEqual(repartirFormule(2400, [900, 2200, 450]), [608, 1488, 304]);
});

test('bases toutes nulles : parts égales', () => {
  assert.deepEqual(repartirFormule(1900, [0, 0, 0]), [633, 634, 633]);
});

test('une seule base, et un centime sur des bases inégales', () => {
  assert.deepEqual(repartirFormule(1250, [800]), [1250]);
  const parts = repartirFormule(1, [100, 100, 0]);
  assert.equal(parts.reduce((s, p) => s + p, 0), 1);
  assert.ok(parts.every((p) => p >= 0));
});

test('200 tirages semés : la somme fait le prix, aucune part négative', () => {
  let graine = 42;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  for (let k = 0; k < 200; k += 1) {
    const n = 1 + Math.floor(hasard() * 6);
    const bases = Array.from({ length: n }, () => (hasard() < 0.15 ? 0 : Math.floor(hasard() * 5000)));
    const prix = 1 + Math.floor(hasard() * 99999);
    const parts = repartirFormule(prix, bases);
    assert.equal(parts.length, n);
    assert.equal(parts.reduce((s, p) => s + p, 0), prix);
    assert.ok(parts.every((p) => p >= 0 && Number.isInteger(p)));
  }
});

test('même centime que round() de Postgres au demi', () => {
  // 50 x 1 / 4 = 12,5 : arrondi au demi supérieur, 13 puis 12 + 13 + 12.
  assert.deepEqual(repartirFormule(50, [1, 1, 1, 1]), [13, 12, 13, 12]);
});

const brut = (extra = {}) => ({
  id: 'f1', nom: 'Formule midi', prix: '24.00', actif: true, archivee: false,
  etapes: [
    { nom: 'Entrée', suite: 1, plat_ids: ['a', 'b'] },
    { nom: 'Plat', suite: 2, plat_ids: ['c'] },
    { nom: 'Café', suite: 3, plat_ids: ['d'] },
  ],
  ...extra,
});

test('lireFormule : normalise, écarte une étape sans produit, borne les longueurs', () => {
  const f = lireFormule(brut({
    nom: 'x'.repeat(60),
    etapes: [
      { nom: 'Vide', suite: 1, plat_ids: [] },
      { nom: 'y'.repeat(50), suite: 2, plat_ids: ['c', 'c', 'e'] },
    ],
  }));
  assert.equal(f.nom.length, 40);
  assert.equal(f.prix, 24);
  assert.equal(f.etapes.length, 1);
  assert.equal(f.etapes[0].nom.length, 30);
  assert.deepEqual(f.etapes[0].platIds, ['c', 'e']);
});

test('lireFormule : un mode hors de 1 à 9 est ignoré', () => {
  const f = lireFormule(brut({ etapes: [{ nom: 'A', suite: 12, plat_ids: ['a'] }, { nom: 'B', suite: 0, plat_ids: ['b'] }] }));
  assert.deepEqual(f.etapes.map((e) => e.suite), [1, 1]);
});

test('lireFormule : rejette nom vide, prix hors bornes, aucune étape', () => {
  assert.equal(lireFormule(brut({ nom: '  ' })), null);
  assert.equal(lireFormule(brut({ prix: 0 })), null);
  assert.equal(lireFormule(brut({ prix: 10000 })), null);
  assert.equal(lireFormule(brut({ etapes: [{ nom: 'A', suite: 1, plat_ids: [] }] })), null);
  assert.equal(lireFormule(null), null);
});

const articles = ['a', 'b', 'c', 'd'].map((id) => ({ id, nom: id.toUpperCase(), prixVente: 10 }));
const JOUR = '2026-11-25';

test('formulesProposees : écarte archivée et inactive, garde l\'ordre', () => {
  const liste = formulesProposees({
    formules: [brut({ id: 'f1' }), brut({ id: 'f2', archivee: true }), brut({ id: 'f3', actif: false }), brut({ id: 'f4' })],
    articles, boutons: {}, jourZurich: JOUR,
  });
  assert.deepEqual(liste.map((f) => f.id), ['f1', 'f4']);
  assert.equal(liste[0].indisponible, false);
});

test('formulesProposees : produits hors vente retirés, rupture marquée, étape vide = indisponible', () => {
  const [f] = formulesProposees({
    formules: [brut({ etapes: [{ nom: 'Entrée', suite: 1, plat_ids: ['a', 'zz'] }, { nom: 'Plat', suite: 2, plat_ids: ['c'] }] })],
    articles, boutons: { a: { rupture_le: JOUR } }, jourZurich: JOUR,
  });
  assert.deepEqual(f.etapes[0].produits.map((p) => [p.article.id, p.rupture]), [['a', true]]);
  assert.equal(f.indisponible, true);
  const [g] = formulesProposees({ formules: [brut()], articles, boutons: { a: { rupture_le: JOUR } }, jourZurich: JOUR });
  assert.equal(g.indisponible, false);
  assert.deepEqual(choixInitiaux(g), ['b', 'c', 'd']);
});

test('blocsQuittance : deux formules identiques font deux blocs', () => {
  const l = (id, g, prix) => ({ id, formule_groupe: g, formule_nom: g ? 'Formule midi' : null, quantite: 1, prix_unitaire: prix });
  const blocs = blocsQuittance([l(1, 'g1', 6.08), l(2, 'g1', 14.88), l(3, 'g2', 6.08), l(4, 'g2', 14.88)]);
  assert.equal(blocs.length, 2);
  assert.equal(blocs[0].total, 20.96);
  assert.deepEqual(blocs[1].lignes.map((x) => x.id), [3, 4]);
});

test('blocsQuittance : une ligne ordinaire entre deux lignes d\'un groupe n\'éclate pas le bloc', () => {
  const blocs = blocsQuittance([
    { id: 1, formule_groupe: 'g', formule_nom: 'F', quantite: 1, prix_unitaire: 5 },
    { id: 2, quantite: 2, prix_unitaire: 3 },
    { id: 3, formule_groupe: 'g', formule_nom: 'F', quantite: 1, prix_unitaire: 7 },
  ]);
  assert.equal(blocs.length, 2);
  assert.equal(blocs[0].formule, true);
  assert.deepEqual(blocs[0].lignes.map((x) => x.id), [1, 3]);
  assert.equal(blocs[0].total, 12);
  assert.equal(blocs[1].ligne.id, 2);
});

test('corpsFormule et erreurFormule', () => {
  const corps = corpsFormule({ nom: ' Midi ', prix: '24.5', etapes: [{ nom: 'A', suite: 2, platIds: ['a', 'a'] }] });
  assert.deepEqual(corps, { nom: 'Midi', prix: 24.5, etapes: [{ nom: 'A', suite: 2, plat_ids: ['a'] }], actif: true, archivee: false });
  assert.equal(erreurFormule({ nom: 'Midi', prix: '24', etapes: [{ nom: 'A', platIds: ['a'] }] }), null);
  assert.ok(erreurFormule({ nom: '', prix: '24', etapes: [] }));
  assert.ok(erreurFormule({ nom: 'Midi', prix: '24', etapes: [{ nom: 'A', platIds: [] }] }));
});
