// node --test : chiffres des inventaires par tranche (serieInventaire.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieInventaire } from './serieInventaire.js';
import { jeuInventaires } from './jeuInventaires.mjs';
import { valeurStockConsolidee } from '../../utils/inventairePerimetres.js';

const mois = (m) => ({ debut: `2026-${String(m).padStart(2, '0')}-01`, fin: new Date(Date.UTC(2026, m, 0)).toISOString().slice(0, 10) });

test('stock : dernier inventaire validé de chaque périmètre à la fin de la tranche, en cours exclu', () => {
  const invs = jeuInventaires();
  const [oct] = serieInventaire(invs, [mois(10)]);
  assert.equal(oct.stock, (4000 + 10 * 37.5) + (4000 + 10 * 37.5 + 1200));
  const [nov] = serieInventaire(invs, [mois(11)]);
  assert.equal(nov.stock, valeurStockConsolidee(invs.filter((i) => i.statut === 'validé')));
  const [avant] = serieInventaire(invs, [{ debut: '2025-01-01', fin: '2025-12-31' }]);
  assert.equal(avant.stock, null);
});

test('écarts : manques et surplus des inventaires validés de la tranche, les mois font l\'année', () => {
  const invs = jeuInventaires();
  const parMois = serieInventaire(invs, Array.from({ length: 12 }, (_, i) => mois(i + 1)));
  const [annee] = serieInventaire(invs, [{ debut: '2026-01-01', fin: '2026-12-31' }]);
  const somme = (cle) => parMois.reduce((s, p) => s + (p[cle] || 0), 0);
  assert.equal(somme('manques').toFixed(2), annee.manques.toFixed(2));
  assert.equal(somme('surplus').toFixed(2), annee.surplus.toFixed(2));
  assert.equal(annee.inventaires, 22);
  assert.equal(parMois[11].manques, null, 'décembre : aucun inventaire validé');
});
