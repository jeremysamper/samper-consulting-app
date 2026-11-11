import test from 'node:test';
import assert from 'node:assert/strict';
import {
  choisirTerminal, detailCarte, detailCarteTexte, ecartBouclement, enRoute, estPrise, etapeDe, messageTpe,
  paiementDe, plafondDe, reprise, terminauxPour, titreFin,
} from './ecranTpe.js';

const sim = { id: 's', nom: 'Simulé', prestataire: 'simule', actif: true };
const reel = { id: 'r', nom: 'Bar', prestataire: 'payrexx', actif: true };
const retire = { id: 'x', nom: 'Ancien', prestataire: 'payrexx', actif: false };
const tx = (statut, plus = {}) => ({ id: `t-${statut}`, statut, montant: 42.5, pourboire: 2, terminal_id: 'r', ...plus });

test('terminaux utilisables : le simulé pour un ticket de test, un vrai pour un vrai ticket, jamais un retiré', () => {
  const tous = [sim, reel, retire];
  assert.deepEqual(terminauxPour(tous, { test: true }).map((t) => t.id), ['s']);
  assert.deepEqual(terminauxPour(tous, { test: false }).map((t) => t.id), ['r']);
  assert.deepEqual(terminauxPour([sim], { test: false }), []);
  assert.deepEqual(terminauxPour([], { test: false }), []);
  assert.deepEqual(terminauxPour(null, null), []);
});

test('terminal du poste : le retenu s\'il sert encore, sinon le premier', () => {
  const a = { id: 'a' }; const b = { id: 'b' };
  assert.equal(choisirTerminal([a, b], 'b'), b);
  assert.equal(choisirTerminal([a, b], 'disparu'), a);
  assert.equal(choisirTerminal([], 'b'), null);
});

test('étapes de la feuille', () => {
  assert.equal(etapeDe(null), 'envoi');
  assert.equal(etapeDe(tx('demande')), 'attente');
  assert.equal(etapeDe(tx('en_cours')), 'attente');
  assert.equal(etapeDe(tx('approuve')), 'accepte');
  assert.equal(etapeDe(tx('incertain')), 'incertain');
  ['refuse', 'annule', 'expire'].forEach((s) => assert.equal(etapeDe(tx(s)), 'refuse'));
  assert.equal(titreFin(tx('annule')), 'Paiement annulé');
  assert.equal(titreFin(tx('expire')), 'Délai dépassé sur le terminal');
  assert.equal(titreFin(tx('refuse')), 'Paiement refusé');
});

test('en route, et argent pris', () => {
  assert.deepEqual(['demande', 'en_cours', 'incertain', 'approuve', 'refuse'].map((s) => enRoute(tx(s))), [true, true, true, false, false]);
  assert.equal(estPrise(tx('approuve')), true);
  assert.equal(estPrise(tx('approuve', { rembourse_statut: 'echec' })), true);
  assert.equal(estPrise(tx('approuve', { rembourse_statut: 'fait' })), false);
  assert.equal(estPrise(tx('incertain')), false);
});

test('le paiement posé reprend le montant et le pourboire du terminal', () => {
  const p = paiementDe(tx('approuve', { marque: 'Visa', fin_carte: '1234', code_autorisation: 'A1' }), 'Carte');
  assert.deepEqual(p, { moyen: 'carte', libelle: 'Carte', montant: 42.5, pourboire: 2, tpe: 't-approuve', terminal_id: 'r', marque: 'Visa', fin_carte: '1234', code_autorisation: 'A1' });
});

test('reprise : un paiement accepté plus tôt se rattache, une transaction en route se reprend', () => {
  const acceptee = tx('approuve');
  const remboursee = tx('approuve', { id: 'rb', rembourse_statut: 'fait' });
  const douteuse = tx('incertain');
  const r = reprise([tx('refuse'), acceptee, remboursee, douteuse]);
  assert.deepEqual(r.aPoser.map((t) => t.id), ['t-approuve']);
  assert.equal(r.enRoute, douteuse);
  assert.deepEqual(reprise([acceptee], [{ tpe: 't-approuve' }]).aPoser, []);
  assert.deepEqual(reprise([], []), { aPoser: [], enRoute: null });
  assert.deepEqual(reprise(null), { aPoser: [], enRoute: null });
});

test('ligne de carte : seulement ce qui existe', () => {
  assert.deepEqual(detailCarte({ marque: 'Visa', fin_carte: '1234', code_autorisation: '123456' }), { marque: 'Visa', fin: '1234', autorisation: '123456' });
  assert.equal(detailCarteTexte({ marque: 'Visa', fin_carte: '1234', code_autorisation: '123456' }), 'Carte Visa, fin 1234, autorisation 123456');
  assert.equal(detailCarteTexte({ marque: 'TWINT' }), 'Carte TWINT');
  assert.equal(detailCarteTexte({}), 'Carte');
  assert.equal(detailCarte({ fin_carte: '4111111111111111' }).fin, null);
});

test('écart de bouclement', () => {
  assert.equal(ecartBouclement(120.5, 120.5), 0);
  assert.equal(ecartBouclement(120.5, 100), -20.5);
  assert.equal(ecartBouclement(120.5, '130.55'), 10.05);
  assert.equal(ecartBouclement(120.5, null), null);
  assert.equal(ecartBouclement(120.5, ''), null);
});

test('plafond réglé par la maison, borné comme dans la base', () => {
  assert.equal(plafondDe({}), 5000);
  assert.equal(plafondDe({ tpe_plafond: 800 }), 800);
  assert.equal(plafondDe({ tpe_plafond: 0 }), 5000);
  assert.equal(plafondDe({ tpe_plafond: 200000 }), 5000);
  assert.equal(plafondDe({ tpe_plafond: '800' }), 5000);
  assert.equal(plafondDe(null), 5000);
});

test('messages : les refus de la base sont dits en clair', () => {
  assert.equal(messageTpe('caisse: acces refuse'), "Vous n'avez pas les droits pour cette action.");
  assert.equal(messageTpe('caisse: montant superieur au reste a payer (50.01 pour 50.00)'), 'Ce montant dépasse le reste à payer.');
  assert.equal(messageTpe('caisse: montant au-dessus du plafond du terminal (60.00)'), 'Ce montant dépasse le plafond du terminal (Réglages de la caisse).');
  assert.equal(messageTpe('caisse: une phrase nouvelle'), 'Une phrase nouvelle');
  assert.equal(messageTpe('Code de jumelage refusé : six lettres majuscules ou chiffres.'), 'Code de jumelage refusé : six lettres majuscules ou chiffres.');
  assert.equal(messageTpe(''), 'Le terminal ne répond pas. Réessayez.');
  assert.equal(messageTpe('{"code":500}'), 'Le terminal ne répond pas. Réessayez.');
  assert.equal(messageTpe(null, 'Autre repli'), 'Autre repli');
});
