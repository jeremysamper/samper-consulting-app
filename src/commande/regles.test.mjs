// node --test : commande par QR (lot L3). Panier, bornes, horaires et adresse,
// mêmes règles que commande_qr_envoyer côté serveur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITES, ajouter, retirer, peutAjouter, nbArticles, lignesPanier, totalPanier, nettoyerPanier, chargeLignes,
  prenomPropre, tablePropre, verifierEnvoi, plageValide, plagesValides, ouvertMaintenant, libellePlage,
  slugValide, slugDepuisNom, aleaSlug, estAdresseDemo, articlesDe, cleArticle,
} from './regles.js';

const PRODUITS = [
  { id: 'b1', nom: 'Bière blonde', prix: 6.5 },
  { id: 'b2', nom: 'Fendant, le verre', prix: 7 },
  { id: 'b3', nom: 'Jus de pomme', prix: 0.1 },
];
const remplir = (n, prefixe = 'p') => {
  let panier = {};
  for (let i = 0; i < n; i += 1) panier = ajouter(panier, `${prefixe}${i}`);
  return panier;
};

test('ajouter puis retirer : la ligne disparaît à zéro', () => {
  let p = ajouter({}, 'b1');
  p = ajouter(p, 'b1');
  assert.deepEqual(p, { b1: 2 });
  p = retirer(p, 'b1');
  assert.deepEqual(p, { b1: 1 });
  p = retirer(p, 'b1');
  assert.deepEqual(p, {});
  assert.deepEqual(retirer({}, 'b1'), {});
});

test('au plus 10 par produit', () => {
  let p = {};
  for (let i = 0; i < 12; i += 1) p = ajouter(p, 'b1');
  assert.equal(p.b1, LIMITES.parProduit);
  assert.equal(peutAjouter(p, 'b1'), false);
  assert.equal(peutAjouter(p, 'b2'), true);
});

test('au plus 30 articles en tout', () => {
  let p = {};
  ['a', 'b', 'c'].forEach((id) => { for (let i = 0; i < 10; i += 1) p = ajouter(p, id); });
  assert.equal(nbArticles(p), LIMITES.articles);
  assert.equal(peutAjouter(p, 'd'), false);
  assert.equal(ajouter(p, 'd'), p);
});

test('au plus 20 lignes, une ligne déjà là grandit encore', () => {
  const p = remplir(20);
  assert.equal(Object.keys(p).length, LIMITES.lignes);
  assert.equal(peutAjouter(p, 'p20'), false);
  assert.equal(ajouter(p, 'p0').p0, 2);
});

test('total en centimes, sans flottant qui dérive', () => {
  const p = { b1: 3, b3: 3 };
  assert.equal(totalPanier(p, PRODUITS), 19.8);
  assert.equal(totalPanier({}, PRODUITS), 0);
});

test('lignes dans l\'ordre de la carte, produit disparu retiré', () => {
  const p = { b2: 1, b1: 2, zz: 4 };
  assert.deepEqual(lignesPanier(p, PRODUITS).map((l) => l.id), ['b1', 'b2']);
  assert.deepEqual(nettoyerPanier(p, PRODUITS), { b2: 1, b1: 2 });
  assert.deepEqual(nettoyerPanier({ b1: 40, b2: -1, b3: 2.7 }, PRODUITS), { b1: 10, b3: 2 });
});

test('la charge envoyée ne porte jamais de prix', () => {
  const charge = chargeLignes({ b1: 2, b2: 1 });
  assert.deepEqual(charge, [{ plat_id: 'b1', quantite: 2 }, { plat_id: 'b2', quantite: 1 }]);
  assert.ok(charge.every((l) => !('prix' in l) && !('prix_unitaire' in l)));
});

test('prénom et table nettoyés comme au serveur', () => {
  assert.equal(prenomPropre('  Léa\nMarie  '), 'Léa Marie');
  assert.equal(tablePropre(' 12\t'), '12');
});

test('vérification avant envoi : chaque manque a son code', () => {
  const base = { panier: { b1: 1 }, produits: PRODUITS, prenom: 'Léa', auBar: false, table: '12' };
  assert.equal(verifierEnvoi(base), null);
  assert.equal(verifierEnvoi({ ...base, panier: {} }), 'vide');
  assert.equal(verifierEnvoi({ ...base, table: '  ' }), 'table');
  assert.equal(verifierEnvoi({ ...base, table: '', auBar: true }), null);
  assert.equal(verifierEnvoi({ ...base, table: 'x'.repeat(21) }), 'table');
  assert.equal(verifierEnvoi({ ...base, prenom: ' ' }), 'prenom');
  assert.equal(verifierEnvoi({ ...base, prenom: 'a'.repeat(41) }), 'prenom');
  assert.equal(verifierEnvoi({ ...base, panier: { b1: 11 } }), 'panier');
});

test('plages : forme HH:MM, début différent de la fin, au plus 4', () => {
  assert.equal(plageValide({ de: '17:00', a: '23:30' }), true);
  assert.equal(plageValide({ de: '25:00', a: '02:00' }), false);
  assert.equal(plageValide({ de: '17:00', a: '17:00' }), false);
  assert.equal(plageValide({ de: '7:00', a: '9:00' }), false);
  assert.equal(plagesValides([]), true);
  assert.equal(plagesValides(Array.from({ length: 5 }, () => ({ de: '10:00', a: '11:00' }))), false);
});

test('ouvert : aucune plage = à toute heure', () => {
  assert.equal(ouvertMaintenant([], 3 * 60), true);
  assert.equal(ouvertMaintenant(null, 3 * 60), false);
});

test('ouvert : la fin est exclue', () => {
  const plages = [{ de: '17:00', a: '23:00' }];
  assert.equal(ouvertMaintenant(plages, 17 * 60), true);
  assert.equal(ouvertMaintenant(plages, 22 * 60 + 59), true);
  assert.equal(ouvertMaintenant(plages, 23 * 60), false);
  assert.equal(ouvertMaintenant(plages, 16 * 60 + 59), false);
});

test('ouvert : une plage qui passe minuit', () => {
  const plages = [{ de: '18:00', a: '01:30' }];
  assert.equal(ouvertMaintenant(plages, 23 * 60), true);
  assert.equal(ouvertMaintenant(plages, 60), true);
  assert.equal(ouvertMaintenant(plages, 90), false);
  assert.equal(ouvertMaintenant(plages, 12 * 60), false);
});

test('ouvert : plusieurs plages, une plage illisible ne compte pas', () => {
  const plages = [{ de: '11:30', a: '14:00' }, { de: 'xx', a: '23:00' }, { de: '18:00', a: '22:00' }];
  assert.equal(ouvertMaintenant(plages, 12 * 60), true);
  assert.equal(ouvertMaintenant(plages, 15 * 60), false);
  assert.equal(ouvertMaintenant(plages, 19 * 60), true);
});

test('libellé d\'une plage', () => {
  assert.equal(libellePlage({ de: '07:05', a: '23:30' }), 'de 7 h 05 à 23 h 30');
});

test('adresse : tirée du nom, suffixe au hasard, jamais « demo »', () => {
  assert.equal(slugDepuisNom('Woodland Village', 'k3m9q'), 'woodland-village-k3m9q');
  assert.equal(slugDepuisNom("Le Rucher d'Évolène", 'ab2cd'), 'le-rucher-d-evolene-ab2cd');
  assert.equal(slugDepuisNom('Démo', 'x7y8z'), 'qr-demo-x7y8z');
  assert.equal(slugDepuisNom('', 'x7y8z'), 'commande-x7y8z');
  assert.ok(slugValide(slugDepuisNom('Un nom de maison vraiment très long pour une adresse', 'abcde')));
  assert.equal(slugValide('demo'), false);
  assert.equal(slugValide('Woodland'), false);
  assert.equal(estAdresseDemo('demo'), true);
  assert.equal(estAdresseDemo('woodland-k3m9q'), false);
});

test('suffixe au hasard : cinq signes sans confusion (ni l, ni o, ni 0, ni 1)', () => {
  const alea = aleaSlug(() => 0.999);
  assert.equal(alea.length, 5);
  assert.match(aleaSlug(), /^[a-km-np-z2-9]{5}$/);
});

test('formats (Carte des boissons) : un article par format, nommé et payé au format', () => {
  const produits = [
    { id: 'fendant', nom: 'Fendant', prix: 17, formats: [{ id: 'f-1dl', libelle: '1 dl', prix: 3.5 }, { id: 'f-50cl', libelle: '50 cl', prix: 17 }] },
    { id: 'pinot', nom: 'Pinot blanc', prix: 49, formats: [{ id: 'f-75cl', libelle: '75 cl', prix: 49 }] },
    { id: 'eau', nom: 'Eau minérale', prix: 4, formats: [] },
  ];
  assert.deepEqual(articlesDe(produits).map((a) => a.id), ['fendant~f-1dl', 'fendant~f-50cl', 'pinot~f-75cl', 'eau']);
  let panier = {};
  panier = ajouter(panier, cleArticle('fendant', 'f-1dl'));
  panier = ajouter(panier, cleArticle('fendant', 'f-1dl'));
  panier = ajouter(panier, cleArticle('fendant', 'f-50cl'));
  panier = ajouter(panier, cleArticle('eau', null));
  assert.deepEqual(lignesPanier(panier, produits).map((l) => [l.nom, l.prix, l.quantite]),
    [['Fendant, 1 dl', 3.5, 2], ['Fendant, 50 cl', 17, 1], ['Eau minérale', 4, 1]]);
  assert.equal(totalPanier(panier, produits), 28);
  assert.deepEqual(chargeLignes(panier), [
    { plat_id: 'fendant', quantite: 2, format_id: 'f-1dl' },
    { plat_id: 'fendant', quantite: 1, format_id: 'f-50cl' },
    { plat_id: 'eau', quantite: 1 },
  ]);
  // Un format retiré de la carte sort du panier à la relecture.
  const relue = [{ ...produits[0], formats: [produits[0].formats[1]] }, produits[2]];
  assert.deepEqual(nettoyerPanier(panier, relue), { 'fendant~f-50cl': 1, eau: 1 });
});
