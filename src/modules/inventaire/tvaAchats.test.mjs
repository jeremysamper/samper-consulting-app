// node --test : calcul de la TVA d'une pièce d'achat (tvaAchats.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  montantTvaDepuisTotaux, montantTvaAEnregistrer, tauxCoherent, tvaIncoherente, tvaAVerifier,
  choixPourTaux, libelleTaux,
} from './tvaAchats.js';

test('HT, TTC et taux 2,6 cohérents : montant = TTC moins HT, rien d\'estimé', () => {
  const r = montantTvaDepuisTotaux({ totalHT: 443, totalTTC: 454.5, tvaTaux: 2.6 });
  assert.deepEqual(r, { montantTva: 11.5, totalHT: 443, totalTTC: 454.5, estime: false, coherent: true });
});

test('HT, TTC et taux 8,1 sur une facture à 2,6 : incohérent, valeurs lues gardées', () => {
  const r = montantTvaDepuisTotaux({ totalHT: 443, totalTTC: 454.5, tvaTaux: 8.1 });
  assert.equal(r.montantTva, 11.5);
  assert.equal(r.coherent, false);
  assert.equal(r.estime, false);
  assert.equal(tvaIncoherente({ totalHT: 443, totalTTC: 454.5, tvaTaux: 8.1 }), true);
  assert.equal(tvaIncoherente({ totalHT: 443, totalTTC: 454.5, tvaTaux: 2.6 }), false);
});

test('taux 8,1 cohérent sur un fournisseur non alimentaire', () => {
  assert.equal(tauxCoherent({ totalHT: 1000, totalTTC: 1081, tvaTaux: 8.1 }), true);
  assert.equal(montantTvaDepuisTotaux({ totalHT: 1000, totalTTC: 1081, tvaTaux: 8.1 }).montantTva, 81);
});

test('taux 3,8 (hébergement) et taux 0 (exonéré) cohérents', () => {
  assert.equal(tauxCoherent({ totalHT: 200, totalTTC: 207.6, tvaTaux: 3.8 }), true);
  assert.equal(tauxCoherent({ totalHT: 120, totalTTC: 120, tvaTaux: 0 }), true);
  assert.equal(montantTvaDepuisTotaux({ totalHT: 120, totalTTC: 120, tvaTaux: 0 }).montantTva, 0);
});

test('taux étranger (19) accepté et jugé comme les autres', () => {
  assert.equal(tauxCoherent({ totalHT: 100, totalTTC: 119, tvaTaux: 19 }), true);
  assert.equal(choixPourTaux(19), 'autre');
  assert.equal(libelleTaux(19), '19 %');
});

test('tolérance : 5 centimes plus un pour mille du TTC', () => {
  // 443 x 1.026 = 454.518 ; 454.5 lu : écart 0.018, dans la tolérance.
  assert.equal(tauxCoherent({ totalHT: 443, totalTTC: 454.5, tvaTaux: 2.6 }), true);
  // 1000 x 1.026 = 1026 ; 1027.10 lu : écart 1.10 > 0.05 + 1.03.
  assert.equal(tauxCoherent({ totalHT: 1000, totalTTC: 1027.1, tvaTaux: 2.6 }), false);
  // 1027.05 lu : écart 1.05 <= 1.077.
  assert.equal(tauxCoherent({ totalHT: 1000, totalTTC: 1027.05, tvaTaux: 2.6 }), true);
});

test('taux seul avec HT : TTC et TVA estimés', () => {
  const r = montantTvaDepuisTotaux({ totalHT: 443, totalTTC: null, tvaTaux: 2.6 });
  assert.deepEqual(r, { montantTva: 11.52, totalHT: 443, totalTTC: 454.52, estime: true, coherent: true });
  assert.equal(montantTvaAEnregistrer({ totalHT: 443, totalTTC: null }), null);
});

test('taux seul avec TTC : HT et TVA estimés', () => {
  const r = montantTvaDepuisTotaux({ totalHT: '', totalTTC: 1081, tvaTaux: 8.1 });
  assert.deepEqual(r, { montantTva: 81, totalHT: 1000, totalTTC: 1081, estime: true, coherent: true });
});

test('rien de lu : null partout, pas de taux : montant quand même, cohérence indécidable', () => {
  assert.deepEqual(montantTvaDepuisTotaux({ totalHT: null, totalTTC: null, tvaTaux: null }),
    { montantTva: null, totalHT: null, totalTTC: null, estime: false, coherent: null });
  assert.deepEqual(montantTvaDepuisTotaux({ totalHT: null, totalTTC: 50, tvaTaux: null }),
    { montantTva: null, totalHT: null, totalTTC: 50, estime: false, coherent: null });
  const sansTaux = montantTvaDepuisTotaux({ totalHT: 100, totalTTC: 102.6, tvaTaux: null });
  assert.equal(sansTaux.montantTva, 2.6);
  assert.equal(sansTaux.coherent, null);
  assert.equal(montantTvaAEnregistrer({ totalHT: 100, totalTTC: 102.6 }), 2.6);
});

test('à vérifier : HT, TTC ou taux manquant, ou incohérence ; complet et cohérent : non', () => {
  assert.equal(tvaAVerifier({ totalHT: 443, totalTTC: 454.5, tvaTaux: 2.6 }), false);
  assert.equal(tvaAVerifier({ totalHT: null, totalTTC: 454.5, tvaTaux: 2.6 }), true);
  assert.equal(tvaAVerifier({ totalHT: 443, totalTTC: null, tvaTaux: 2.6 }), true);
  assert.equal(tvaAVerifier({ totalHT: 443, totalTTC: 454.5, tvaTaux: null }), true);
  assert.equal(tvaAVerifier({ totalHT: 443, totalTTC: 454.5, tvaTaux: 8.1 }), true);
});

test('choix à l\'écran : id du taux connu, autre sinon, vide sans taux ; libellés à la virgule', () => {
  assert.equal(choixPourTaux(2.6), '2.6');
  assert.equal(choixPourTaux('8.1'), '8.1');
  assert.equal(choixPourTaux(0), '0');
  assert.equal(choixPourTaux(null), '');
  assert.equal(choixPourTaux(7.7), 'autre');
  assert.equal(libelleTaux(2.6), '2,6 %');
  assert.equal(libelleTaux(0), '0 %');
  assert.equal(libelleTaux(null), '');
});
