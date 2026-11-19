import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliserCode, formaterSaisie, telephoneValide, montantValide, ajouterMois, validiteDepuis,
  etatBon, montantUtilisable, enCirculation, bilanDuMois, lienSms, texteSms, ALPHABET,
} from './codeBon.js';

test('alphabet : 31 signes, sans 0 O 1 I L', () => {
  assert.equal(ALPHABET.length, 31);
  for (const c of '0O1IL') assert.equal(ALPHABET.includes(c), false);
});

test('normaliserCode : tolère minuscules, espaces, tiret absent ; refuse le reste', () => {
  assert.equal(normaliserCode('abcd-efgh'), 'ABCD-EFGH');
  assert.equal(normaliserCode('ABCDEFGH'), 'ABCD-EFGH');
  assert.equal(normaliserCode(' abcd efgh '), 'ABCD-EFGH');
  assert.equal(normaliserCode('Bon : K7M2-Q9TX merci'), 'K7M2-Q9TX');
  assert.equal(normaliserCode('ABCD-EFG0'), null);
  assert.equal(normaliserCode('ABC'), null);
  assert.equal(normaliserCode(null), null);
});

test('formaterSaisie : tiret après quatre signes, signes ambigus retirés', () => {
  assert.equal(formaterSaisie('abcd'), 'ABCD');
  assert.equal(formaterSaisie('abcde'), 'ABCD-E');
  assert.equal(formaterSaisie('ab0cdefghijk'), 'ABCD-EFGH');
});

test('telephoneValide', () => {
  assert.equal(telephoneValide('+41 79 123 45 67'), true);
  assert.equal(telephoneValide('0791234567'), true);
  assert.equal(telephoneValide('079-123'), false);
  assert.equal(telephoneValide('12345'), false);
  assert.equal(telephoneValide(''), false);
});

test('montantValide : multiple de 5 centimes, 5000 au plus', () => {
  assert.equal(montantValide('50'), 50);
  assert.equal(montantValide('47,35'), 47.35);
  assert.equal(montantValide('47.33'), null);
  assert.equal(montantValide('0'), null);
  assert.equal(montantValide('5000.05'), null);
  assert.equal(montantValide('abc'), null);
});

test('ajouterMois et validiteDepuis', () => {
  assert.equal(ajouterMois('2026-11-19', 24), '2028-11-19');
  assert.equal(ajouterMois('2027-01-31', 1), '2027-02-28');
  assert.equal(ajouterMois('2028-02-29', 12), '2029-02-28');
  assert.equal(validiteDepuis('2026-11-19', '12'), '2027-11-19');
  assert.equal(validiteDepuis('2026-11-19', 'sans'), null);
});

test('etatBon', () => {
  const b = { statut: 'actif', solde: 20, valable_jusqu_au: '2026-11-18' };
  assert.equal(etatBon(b, '2026-11-19'), 'echu');
  assert.equal(etatBon({ ...b, valable_jusqu_au: null }, '2026-11-19'), 'actif');
  assert.equal(etatBon({ ...b, statut: 'epuise', solde: 0 }, '2026-11-19'), 'epuise');
  assert.equal(etatBon({ ...b, statut: 'annule' }, '2026-11-19'), 'annule');
});

test('montantUtilisable : le solde sans dépasser le reste', () => {
  assert.equal(montantUtilisable({ solde: 50 }, 32.4), 32.4);
  assert.equal(montantUtilisable({ solde: 20 }, 32.4), 20);
  assert.equal(montantUtilisable({ solde: 0.1 }, 0.3), 0.1);
});

test('enCirculation et bilanDuMois', () => {
  const bons = [
    { statut: 'actif', solde: 20 }, { statut: 'actif', solde: 50.05 },
    { statut: 'epuise', solde: 0 }, { statut: 'annule', solde: 0 },
  ];
  assert.deepEqual(enCirculation(bons), { nombre: 2, montant: 70.05 });
  const mvts = [
    { genre: 'emission', montant: 50, created_at: '2026-11-02T10:00:00Z' },
    { genre: 'emission', montant: 100, created_at: '2026-10-30T10:00:00Z' },
    { genre: 'utilisation', montant: 30, created_at: '2026-11-03T10:00:00Z' },
    { genre: 'recredit', montant: 10, created_at: '2026-11-04T10:00:00Z' },
  ];
  const b = bilanDuMois(mvts, '2026-11');
  assert.deepEqual(b.vendus, { nombre: 1, montant: 50 });
  assert.equal(b.depenses.montant, 20);
});

test('lienSms et texteSms', () => {
  const bon = { nom: 'Marie', montant_initial: 50, code: 'ABCD-EFGH', valable_jusqu_au: '2028-11-19' };
  const t = texteSms({ bon, maison: 'Woodland' });
  assert.match(t, /CHF 50\.00 chez Woodland/);
  assert.match(t, /ABCD-EFGH/);
  assert.match(t, /19\.11\.2028/);
  assert.equal(lienSms('+41 79 123 45 67', 'a b'), 'sms:+41791234567?&body=a%20b');
});
