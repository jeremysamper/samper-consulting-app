// node --test : règlements des factures d'achat par tranche (facturesLogic.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { reglementsParTranche, totauxFactures } from './facturesLogic.js';

// 1 100 documents : factures réglées 5 à 40 jours après leur date, quelques
// factures sans TTC, des bons de livraison qui ne comptent pas.
function jeuFactures() {
  const out = [];
  for (let i = 0; i < 1100; i += 1) {
    const date = new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString().slice(0, 10);
    const regle = i % 5 === 0 ? null : new Date(Date.UTC(2026, 0, 1 + (i % 300) + 5 + (i % 36))).toISOString().slice(0, 10);
    out.push({ id: `d${i}`, typeDocument: i % 11 === 0 ? 'bon_livraison' : 'facture', dateDocument: date, regleLe: i % 11 === 0 ? null : regle, totalTTC: i % 17 === 0 ? null : 50 + (i % 23) * 12.35 });
  }
  return out;
}

const mois = (m) => ({ debut: `2026-${String(m).padStart(2, '0')}-01`, fin: new Date(Date.UTC(2026, m, 0)).toISOString().slice(0, 10) });

test('règlements : montant réglé par date de règlement, règle de totauxFactures, les mois font l\'année', () => {
  const docs = jeuFactures();
  const parMois = reglementsParTranche(docs, Array.from({ length: 12 }, (_, i) => mois(i + 1)));
  const [annee] = reglementsParTranche(docs, [{ debut: '2026-01-01', fin: '2026-12-31' }]);
  const reglees2026 = docs.filter((d) => d.typeDocument === 'facture' && d.regleLe && d.regleLe <= '2026-12-31');
  assert.equal(annee.montant.toFixed(2), totauxFactures(reglees2026, '2026-12-31').reglees.montant.toFixed(2));
  assert.equal(parMois.reduce((s, p) => s + p.montant, 0).toFixed(2), annee.montant.toFixed(2));
  assert.equal(parMois.reduce((s, p) => s + p.n, 0), annee.n);
  assert.equal(parMois.reduce((s, p) => s + p.joursTotal, 0), annee.joursTotal);
  assert.ok(annee.n > 700);
});

test('délai de paiement : jours de la facture au règlement, sans date de facture pas de délai', () => {
  const [p] = reglementsParTranche([
    { typeDocument: 'facture', dateDocument: '2026-03-01', regleLe: '2026-03-31', totalTTC: 100 },
    { typeDocument: 'facture', dateDocument: null, regleLe: '2026-03-15', totalTTC: 40 },
    { typeDocument: 'facture', dateDocument: '2026-03-10', regleLe: null, totalTTC: 999 },
  ], [mois(3)]);
  assert.deepEqual({ n: p.n, montant: p.montant, joursTotal: p.joursTotal, nbDelais: p.nbDelais }, { n: 2, montant: 140, joursTotal: 30, nbDelais: 1 });
});
