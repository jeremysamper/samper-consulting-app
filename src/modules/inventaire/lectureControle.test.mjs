// node --test : contrôles de la lecture IA des factures et bons (lectureControle.js)
// et nettoyage des noms et rapprochement par numéro d'article (achatsLogic.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombresDuTexte, montantRetrouve, ecartSignificatif } from './lectureControle.js';
import {
  nomDepuisLibelle, cleFournisseurArticle, construireContexteRapprochement, rapprocherLigneDoc,
} from './achatsLogic.js';

test('nombres d\'une ligne imprimée : apostrophes de milliers et virgule décimale', () => {
  assert.deepEqual(nombresDuTexte("100389 Purée 6 x 850 g 1 KRT 38,80 1'234.50"), [100389, 6, 850, 1, 38.8, 1234.5]);
  assert.deepEqual(nombresDuTexte('ROSTI 2.20/kg 3.00 kg 6.60'), [2.2, 3, 6.6]);
});

test('montant retrouvé sur la ligne imprimée', () => {
  assert.equal(montantRetrouve(38.8, '100389 Parmadoro Purée 6 x 850 g 1 38.80'), true);
  assert.equal(montantRetrouve(1234.5, "Filet 12 kg 102.875 1'234.50"), true);
});

test('montant absent de la ligne : calculé ou pris ailleurs', () => {
  // 3 x 2.20 = 6.60 calculé par le modèle, alors que la ligne imprime 36.00.
  assert.equal(montantRetrouve(6.6, 'ROSTI pro fort REST. 2.20/kg 3 36.00'), false);
});

test('pas de ligne recopiée : rien à contrôler (fonction plus ancienne)', () => {
  assert.equal(montantRetrouve(38.8, ''), null);
  assert.equal(montantRetrouve(null, 'texte 38.80'), null);
});

test('écart au total : tolérance de 10 centimes ou un demi pour cent', () => {
  assert.equal(ecartSignificatif(0.05, 83.7), false);
  assert.equal(ecartSignificatif(-38.2, 83.7), true);
  assert.equal(ecartSignificatif(2, 1000), false);
  assert.equal(ecartSignificatif(null, 100), false);
});

test('nom depuis un libellé : numéro d\'article en tête et prix au kilo retirés', () => {
  assert.equal(nomDepuisLibelle('16682 Fingerfood Mischung, teig. 18 g', '18 g'), 'Fingerfood Mischung, teig.');
  assert.equal(nomDepuisLibelle('ROSTI pro fort REST. 2.20/kg', ''), 'ROSTI pro fort REST.');
  assert.equal(nomDepuisLibelle('PARMADORO PUREE TOMATES, 6 x 850 g', '6 x 850 g'), 'Parmadoro puree tomates');
  // Un nombre court en tête fait partie du nom.
  assert.equal(nomDepuisLibelle('7 épices mélange 250g', '250g'), '7 épices mélange');
});

test('clé fournisseur sans forme juridique', () => {
  assert.equal(cleFournisseurArticle('A. Walker AG'), 'walker');
  assert.equal(cleFournisseurArticle('Walker AG'), 'walker');
  assert.equal(cleFournisseurArticle('Luisier SA'), 'luisier');
});

const produits = [
  { cle: 'asperges vertes', nom: 'Asperges vertes', unite: 'kg', prixUnit: 12 },
  { cle: 'rosti', nom: 'Rösti', unite: 'kg', prixUnit: 3 },
];

test('numéro d\'article rattaché à la main : reconnu sur un libellé lu autrement, même fournisseur', () => {
  const ancien = { id: 'a', fournisseurNom: 'A. Walker AG', lignes: [
    { libelle: '16777 Asparagus Green extra fine, boite 1 kg', referenceFourn: '16777', lien: 'manuel', produitNom: 'Asperges vertes' },
  ] };
  const nouveau = { id: 'b', fournisseurNom: 'Walker AG', lignes: [
    { libelle: 'Asparagus green extra fine 1kg', referenceFourn: '16777' },
  ] };
  const autre = { id: 'c', fournisseurNom: 'Luisier SA', lignes: [
    { libelle: 'Article inconnu', referenceFourn: '16777' },
  ] };
  const ctx = construireContexteRapprochement({ produits, documents: [ancien, nouveau, autre], aliasCatalogue: [], catalogue: [] });
  const r = rapprocherLigneDoc(nouveau.lignes[0], ctx);
  assert.equal(r.mode, 'appris');
  assert.equal(r.produit.cle, 'asperges vertes');
  // Même numéro chez un autre fournisseur : aucune décision reprise.
  assert.notEqual(rapprocherLigneDoc(autre.lignes[0], ctx).mode, 'appris');
});

test('numéro rattaché à deux produits différents : ne décide plus rien', () => {
  const d1 = { id: 'a', fournisseurNom: 'Walker AG', lignes: [{ libelle: 'X1', referenceFourn: '555', lien: 'manuel', produitNom: 'Rösti' }] };
  const d2 = { id: 'b', fournisseurNom: 'Walker AG', lignes: [{ libelle: 'X2', referenceFourn: '555', lien: 'manuel', produitNom: 'Asperges vertes' }] };
  const d3 = { id: 'c', fournisseurNom: 'Walker AG', lignes: [{ libelle: 'X3', referenceFourn: '555' }] };
  const ctx = construireContexteRapprochement({ produits, documents: [d1, d2, d3], aliasCatalogue: [], catalogue: [] });
  assert.notEqual(rapprocherLigneDoc(d3.lignes[0], ctx).mode, 'appris');
});

test('un libellé ignoré garde sa décision, même si son numéro est rattaché ailleurs', () => {
  const d1 = { id: 'a', fournisseurNom: 'Walker AG', lignes: [{ libelle: 'Rosti 2kg', referenceFourn: '777', lien: 'manuel', produitNom: 'Rösti' }] };
  const d2 = { id: 'b', fournisseurNom: 'Walker AG', lignes: [{ libelle: 'PORT', referenceFourn: '777', lien: 'ignore' }] };
  const d3 = { id: 'c', fournisseurNom: 'Walker AG', lignes: [{ libelle: 'PORT', referenceFourn: '777' }] };
  const ctx = construireContexteRapprochement({ produits, documents: [d1, d2, d3], aliasCatalogue: [], catalogue: [] });
  assert.equal(rapprocherLigneDoc(d3.lignes[0], ctx).mode, 'ignore');
});
