// node --test : hausses de prix fournisseur (analysesAchats.js, haussesPrix).
// Lancer : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { haussesPrix } from './analysesAchats.js';

const doc = (o) => ({ typeDocument: 'facture', exclu: false, fournisseurNom: 'Walker AG', lignes: [], ...o });
// 6 x 850 g de purée de tomates à 30.60 : 6.00 CHF le kilo.
const tomates = (montant, o = {}) => ({ libelle: 'PARMADORO PUREE TOMATES', conditionnement: '6 x 850 g', quantite: 1, quantiteTotale: 5100, uniteTotale: 'g', montantLigne: montant, ...o });

test('vraie hausse : 6.00 puis 6.60 CHF/kg, +10 %, écart et surcoût en CHF', () => {
  const h = haussesPrix([
    doc({ id: 'a', dateDocument: '2026-10-01', lignes: [tomates(30.6)] }),
    doc({ id: 'b', dateDocument: '2026-11-01', lignes: [tomates(33.66)] }),
  ]);
  assert.equal(h.length, 1);
  assert.equal(h[0].docId, 'b');
  assert.equal(h[0].unite, 'kg');
  assert.equal(h[0].fournisseur, 'Walker AG');
  assert.equal(h[0].dateAvant, '2026-10-01');
  assert.ok(Math.abs(h[0].prixAvant - 6) < 1e-9);
  assert.ok(Math.abs(h[0].prix - 6.6) < 1e-9);
  assert.ok(Math.abs(h[0].ecartPct - 10) < 1e-9);
  assert.ok(Math.abs(h[0].ecartUnite - 0.6) < 1e-9);
  assert.equal(h[0].surcout, 3.06); // 5,1 kg x 0.60
});

test('changement de colisage au même prix du kilo : aucune hausse', () => {
  const h = haussesPrix([
    doc({ id: 'a', dateDocument: '2026-10-01', lignes: [tomates(30.6)] }),
    // Deux cartons cette fois : le montant double, le prix du kilo ne bouge pas.
    doc({ id: 'b', dateDocument: '2026-11-01', lignes: [tomates(61.2, { quantite: 2, quantiteTotale: 10200 })] }),
  ]);
  assert.equal(h.length, 0);
});

test('autre contenant sans numéro d\'article (1 L puis 5 L) : séries séparées, aucune hausse', () => {
  const creme = (cond, ml, montant) => ({ libelle: 'Crème entière 35 %', conditionnement: cond, quantite: 1, quantiteTotale: ml, uniteTotale: 'ml', montantLigne: montant });
  const h = haussesPrix([
    doc({ id: 'a', dateDocument: '2026-10-01', lignes: [creme('5 L', 5000, 15)] }), // 3.00 / L
    doc({ id: 'b', dateDocument: '2026-11-01', lignes: [creme('1 L', 1000, 3.8)] }), // 3.80 / L
  ]);
  assert.equal(h.length, 0);
});

test('même numéro d\'article, conditionnement lu autrement : même série', () => {
  const h = haussesPrix([
    doc({ id: 'a', dateDocument: '2026-10-01', lignes: [tomates(30.6, { referenceFourn: '16682' })] }),
    doc({ id: 'b', dateDocument: '2026-11-01', lignes: [tomates(33.66, { referenceFourn: '16682', conditionnement: '6x850g', libelle: '16682 Parmadoro purée' })] }),
  ]);
  assert.equal(h.length, 1);
});

test('unité différente (pièce puis kilo) : jamais comparée', () => {
  const h = haussesPrix([
    doc({ id: 'a', dateDocument: '2026-10-01', lignes: [{ libelle: 'Citrons', conditionnement: '', quantite: 1, quantiteTotale: 20, uniteTotale: 'pcs', montantLigne: 8 }] }),
    doc({ id: 'b', dateDocument: '2026-11-01', lignes: [{ libelle: 'Citrons', conditionnement: '', quantite: 1, quantiteTotale: 2000, uniteTotale: 'g', montantLigne: 9 }] }),
  ]);
  assert.equal(h.length, 0);
});

test('prix par colis seul (sans quantité totale) : hors calcul', () => {
  const h = haussesPrix([
    doc({ id: 'a', dateDocument: '2026-10-01', lignes: [{ libelle: 'Carton serviettes', quantite: 1, montantLigne: 20 }] }),
    doc({ id: 'b', dateDocument: '2026-11-01', lignes: [{ libelle: 'Carton serviettes', quantite: 1, montantLigne: 30 }] }),
  ]);
  assert.equal(h.length, 0);
});

test('autre fournisseur : pas de comparaison ; forme juridique ignorée', () => {
  const h = haussesPrix([
    doc({ id: 'a', dateDocument: '2026-10-01', fournisseurNom: 'Prodega', lignes: [tomates(30.6)] }),
    doc({ id: 'b', dateDocument: '2026-11-01', fournisseurNom: 'Walker AG', lignes: [tomates(33.66)] }),
    doc({ id: 'c', dateDocument: '2026-11-08', fournisseurNom: 'A. Walker', lignes: [tomates(37.03)] }),
  ]);
  assert.equal(h.length, 1);
  assert.equal(h[0].docId, 'c');
});

test('sous le seuil, baisse, seuil réglé', () => {
  const docs = [
    doc({ id: 'a', dateDocument: '2026-10-01', lignes: [tomates(30.6)] }),
    doc({ id: 'b', dateDocument: '2026-10-15', lignes: [tomates(31.83)] }), // +4,0 %
    doc({ id: 'c', dateDocument: '2026-11-01', lignes: [tomates(28)] }), // baisse
  ];
  assert.equal(haussesPrix(docs).length, 0);
  assert.equal(haussesPrix(docs, { seuilPct: 3 }).length, 1);
});

test('bons de commande et pièces exclues : hors calcul ; bon de livraison compté', () => {
  const base = doc({ id: 'a', dateDocument: '2026-10-01', lignes: [tomates(30.6)] });
  assert.equal(haussesPrix([base, doc({ id: 'b', typeDocument: 'bon_commande', dateDocument: '2026-11-01', lignes: [tomates(40)] })]).length, 0);
  assert.equal(haussesPrix([base, doc({ id: 'b', exclu: true, dateDocument: '2026-11-01', lignes: [tomates(40)] })]).length, 0);
  assert.equal(haussesPrix([base, doc({ id: 'b', typeDocument: 'bon_livraison', dateDocument: '2026-11-01', lignes: [tomates(40)] })]).length, 1);
});

test('fenêtre : la pièce d\'avant peut être plus ancienne que « depuis »', () => {
  const docs = [
    doc({ id: 'a', dateDocument: '2026-03-01', lignes: [tomates(30.6)] }),
    doc({ id: 'b', dateDocument: '2026-11-01', lignes: [tomates(33.66)] }),
  ];
  assert.equal(haussesPrix(docs, { depuis: '2026-08-20' }).length, 1);
  assert.equal(haussesPrix(docs, { depuis: '2026-11-02' }).length, 0);
});

test('lignes du même article sur une pièce : prix moyen pondéré ; lecture douteuse signalée', () => {
  const h = haussesPrix([
    doc({ id: 'a', dateDocument: '2026-10-01', lignes: [tomates(30.6)] }),
    doc({ id: 'b', dateDocument: '2026-11-01', lignes: [tomates(30.6), tomates(36.72, { issues: ['montant non retrouve sur la ligne'] })] }),
  ]);
  assert.equal(h.length, 1);
  assert.ok(Math.abs(h[0].ecartPct - 10) < 1e-9); // (30.60 + 36.72) / 10,2 kg = 6.60
  assert.equal(h[0].doute, true);
});
