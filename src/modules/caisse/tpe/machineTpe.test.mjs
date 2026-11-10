import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELAI_REPONSE_MS, FINAUX, STATUTS, bloqueTerminal, bloqueTicket, estFinal, peutPasser, suivant,
} from '../../../../supabase/functions/caisse-tpe/machine.js';

// Jeu d'essai de la machine à états d'une transaction de terminal (caisse v9).
// Écrit avant le code. Une transaction : 42.50 de part de ticket, 2.00 de
// pourboire, demandée à t0.
const t0 = Date.parse('2026-11-11T12:00:00Z');
const tx = (statut, plus = {}) => ({
  id: 'tx-1', statut, montant: 42.5, pourboire: 2, devise: 'CHF', created_at: new Date(t0).toISOString(), ...plus,
});
const ok = (plus = {}) => ({
  statut: 'approuve', montantCentimes: 4250, pourboireCentimes: 200, devise: 'CHF', idPrestataire: 'p-1', ...plus,
});

test('les sept statuts, quatre finaux', () => {
  assert.deepEqual(STATUTS, ['demande', 'en_cours', 'approuve', 'refuse', 'annule', 'expire', 'incertain']);
  assert.deepEqual(FINAUX, ['approuve', 'refuse', 'annule', 'expire']);
  FINAUX.forEach((s) => assert.equal(estFinal(s), true));
  ['demande', 'en_cours', 'incertain'].forEach((s) => assert.equal(estFinal(s), false));
});

test('un état final ne bouge plus', () => {
  FINAUX.forEach((de) => STATUTS.forEach((vers) => assert.equal(peutPasser(de, vers), false, `${de} vers ${vers}`)));
});

test('transitions permises', () => {
  ['en_cours', 'approuve', 'refuse', 'annule', 'expire', 'incertain'].forEach((v) => assert.equal(peutPasser('demande', v), true));
  ['approuve', 'refuse', 'annule', 'expire', 'incertain'].forEach((v) => assert.equal(peutPasser('en_cours', v), true));
  ['approuve', 'refuse', 'annule', 'expire'].forEach((v) => assert.equal(peutPasser('incertain', v), true));
  assert.equal(peutPasser('en_cours', 'demande'), false);
  assert.equal(peutPasser('incertain', 'en_cours'), false);
  assert.equal(peutPasser('incertain', 'demande'), false);
  assert.equal(peutPasser('demande', 'demande'), false);
  assert.equal(peutPasser('inconnu', 'approuve'), false);
  assert.equal(peutPasser('demande', 'inconnu'), false);
});

test('ce qui bloque un ticket et un terminal', () => {
  assert.deepEqual(STATUTS.filter(bloqueTicket), ['demande', 'en_cours', 'incertain']);
  assert.deepEqual(STATUTS.filter(bloqueTerminal), ['demande', 'en_cours']);
});

test('accepté : la transaction passe à approuvé avec les champs de la liste blanche', () => {
  const s = suivant(tx('en_cours'), ok({ marque: 'Visa', finCarte: '1234', codeAutorisation: 'A1B2C3' }), t0 + 5000);
  assert.equal(s.statut, 'approuve');
  assert.deepEqual(s.champs, {
    prestataire_id: 'p-1', marque: 'Visa', fin_carte: '1234', code_autorisation: 'A1B2C3', pourboire: 2, message: null,
  });
});

test('accepté depuis demande (le terminal a répondu tout de suite)', () => {
  assert.equal(suivant(tx('demande'), ok(), t0 + 100).statut, 'approuve');
});

test('accepté pour un autre montant : jamais approuvé, incertain', () => {
  const s = suivant(tx('en_cours'), ok({ montantCentimes: 4200 }), t0 + 5000);
  assert.equal(s.statut, 'incertain');
  assert.match(s.champs.message, /montant/i);
});

test('accepté sans montant rendu : incertain', () => {
  assert.equal(suivant(tx('en_cours'), ok({ montantCentimes: null }), t0 + 5000).statut, 'incertain');
});

test('accepté dans une autre devise : incertain', () => {
  assert.equal(suivant(tx('en_cours'), ok({ devise: 'EUR' }), t0 + 5000).statut, 'incertain');
});

test('pourboire saisi sur le terminal : il va dans le pourboire, pas dans le montant', () => {
  const s = suivant(tx('en_cours', { pourboire: 0 }), ok({ pourboireCentimes: 350 }), t0 + 5000);
  assert.equal(s.statut, 'approuve');
  assert.equal(s.champs.pourboire, 3.5);
});

test('pourboire non rendu par le terminal : celui de la demande est gardé', () => {
  const s = suivant(tx('en_cours'), ok({ pourboireCentimes: null }), t0 + 5000);
  assert.equal(s.champs.pourboire, 2);
});

test('refusé : message du prestataire en clair', () => {
  const s = suivant(tx('en_cours'), { statut: 'refuse', message: 'Carte refusée', idPrestataire: 'p-1' }, t0 + 5000);
  assert.equal(s.statut, 'refuse');
  assert.equal(s.champs.message, 'Carte refusée');
});

test('annulé sur le terminal et délai du terminal dépassé', () => {
  assert.equal(suivant(tx('en_cours'), { statut: 'annule' }, t0 + 5000).statut, 'annule');
  assert.equal(suivant(tx('en_cours'), { statut: 'expire' }, t0 + 5000).statut, 'expire');
});

test('en cours : demande passe à en_cours, en_cours ne change pas', () => {
  const s = suivant(tx('demande'), { statut: 'en_cours', idPrestataire: 'p-1' }, t0 + 500);
  assert.equal(s.statut, 'en_cours');
  assert.equal(s.champs.prestataire_id, 'p-1');
  assert.equal(suivant(tx('en_cours', { prestataire_id: 'p-1' }), { statut: 'en_cours', idPrestataire: 'p-1' }, t0 + 5000), null);
});

test('délai dépassé sans réponse : incertain, rien de posé', () => {
  const tard = t0 + DELAI_REPONSE_MS + 1;
  assert.equal(suivant(tx('en_cours'), { statut: 'en_cours' }, tard).statut, 'incertain');
  assert.equal(suivant(tx('en_cours'), { statut: 'injoignable' }, tard).statut, 'incertain');
  assert.equal(suivant(tx('demande'), { statut: 'en_cours' }, tard).statut, 'incertain');
});

test('prestataire injoignable pendant le suivi : rien ne change avant le délai', () => {
  assert.equal(suivant(tx('en_cours'), { statut: 'injoignable' }, t0 + 5000), null);
});

test('erreur réseau au démarrage : incertain tout de suite (le terminal a peut-être reçu la demande)', () => {
  const s = suivant(tx('demande'), { statut: 'injoignable' }, t0 + 300);
  assert.equal(s.statut, 'incertain');
});

test('statut inconnu ou résultat absent : incertain, jamais approuvé', () => {
  assert.equal(suivant(tx('en_cours'), { statut: 'n_importe_quoi' }, t0 + 5000).statut, 'incertain');
  assert.equal(suivant(tx('en_cours'), { statut: 'incertain' }, t0 + 5000).statut, 'incertain');
  assert.equal(suivant(tx('en_cours'), null, t0 + 5000), null);
});

test('incertain puis retrouvé accepté : se rattache, sans nouvelle demande', () => {
  const s = suivant(tx('incertain', { prestataire_id: 'p-1' }), ok(), t0 + DELAI_REPONSE_MS + 60000);
  assert.equal(s.statut, 'approuve');
});

test('incertain : un « en cours » ou un silence du prestataire ne le fait pas revenir en arrière', () => {
  assert.equal(suivant(tx('incertain'), { statut: 'en_cours' }, t0 + 200000), null);
  assert.equal(suivant(tx('incertain'), { statut: 'injoignable' }, t0 + 200000), null);
  assert.equal(suivant(tx('incertain'), { statut: 'incertain' }, t0 + 200000), null);
});

test('incertain puis retrouvé refusé ou annulé', () => {
  assert.equal(suivant(tx('incertain'), { statut: 'refuse', message: 'Refusée' }, t0 + 200000).statut, 'refuse');
  assert.equal(suivant(tx('incertain'), { statut: 'annule' }, t0 + 200000).statut, 'annule');
});

test('une transaction finale ignore tout résultat tardif', () => {
  FINAUX.forEach((f) => {
    assert.equal(suivant(tx(f), ok(), t0 + 5000), null);
    assert.equal(suivant(tx(f), { statut: 'refuse' }, t0 + 5000), null);
  });
});

test('toute transition rendue par suivant est permise par la table', () => {
  const resultats = [ok(), ok({ montantCentimes: 1 }), { statut: 'refuse' }, { statut: 'annule' }, { statut: 'expire' },
    { statut: 'en_cours' }, { statut: 'injoignable' }, { statut: 'incertain' }, { statut: 'x' }];
  STATUTS.forEach((de) => resultats.forEach((r) => [t0 + 100, t0 + DELAI_REPONSE_MS + 1].forEach((quand) => {
    const s = suivant(tx(de), r, quand);
    if (s && s.statut !== de) assert.equal(peutPasser(de, s.statut), true, `${de} vers ${s.statut}`);
  })));
});
