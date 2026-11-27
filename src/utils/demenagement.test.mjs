import test from 'node:test';
import assert from 'node:assert/strict';
import { estAncienneAdresse, compterBrouillons, resumerAttente, ADRESSE_JOUANET } from './demenagement.js';

test("estAncienneAdresse : l'ancienne adresse seulement, l'essai hors production seulement", () => {
  assert.equal(estAncienneAdresse({ hostname: 'samperconsulting-app.com', search: '' }), true);
  assert.equal(estAncienneAdresse({ hostname: 'www.samperconsulting-app.com', search: '' }), true);
  assert.equal(estAncienneAdresse({ hostname: 'jouanet.com', search: '' }), false);
  assert.equal(estAncienneAdresse({ hostname: 'jouanet.com', search: '?essai-demenagement' }), false);
  assert.equal(estAncienneAdresse({ hostname: 'sc-abc-samper-consulting.vercel.app', search: '?essai-demenagement' }), true);
  assert.equal(estAncienneAdresse({ hostname: 'sc-abc-samper-consulting.vercel.app', search: '' }), false);
  assert.equal(estAncienneAdresse({ hostname: '127.0.0.1', search: '?page=x&essai-demenagement=1' }), true);
  assert.equal(estAncienneAdresse(null), false);
  assert.equal(ADRESSE_JOUANET, 'https://jouanet.com/');
});

test('compterBrouillons : les clés au préfixe, null si le stockage se refuse', () => {
  const cles = ['sc_recipe_draft_a', 'sc_theme', 'sc_recipe_draft_b'];
  const stockage = { length: cles.length, key: (i) => cles[i] };
  assert.equal(compterBrouillons(stockage, 'sc_recipe_draft_'), 2);
  const ferme = { get length() { throw new Error('refus'); }, key: () => null };
  assert.equal(compterBrouillons(ferme, 'sc_recipe_draft_'), null);
});

test("resumerAttente : prêt seulement si toutes les files sont lues et vides", () => {
  const vide = { pointages: 0, borne: 0, inventaire: 0, haccp: 0, etages: 0, ventes: 0, brouillons: 0 };
  assert.deepEqual(resumerAttente(vide), { enAttente: [], illisible: false, brouillons: null, pret: true });
  const plein = { ...vide, pointages: 2, haccp: 1, ventes: 3, brouillons: 1 };
  const r = resumerAttente(plein);
  assert.deepEqual(r.enAttente, ['2 pointages', '1 relevé HACCP', '3 ventes en espèces']);
  assert.equal(r.brouillons, '1 fiche recette pas encore enregistrée');
  assert.equal(r.pret, false);
  const illisible = resumerAttente({ ...vide, inventaire: null });
  assert.equal(illisible.illisible, true);
  assert.equal(illisible.pret, false);
  // Les brouillons avertissent sans bloquer : ils ne partent jamais seuls.
  assert.equal(resumerAttente({ ...vide, brouillons: 4 }).pret, true);
});
